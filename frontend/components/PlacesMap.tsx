'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapGL, { Layer, Marker, Source } from 'react-map-gl/mapbox';
import type { MapMouseEvent, MapRef } from 'react-map-gl/mapbox';
import type { GeoJSONSource, Map as MapboxMap } from 'mapbox-gl';
import { ZERO_PADDING, flyToThenOnMoveend, listPanelRightEdge, worldwideFraming } from '@/lib/map-camera';
import { resolveMapboxToken } from '@/lib/mapbox-token';
import type { FlyRequest, MapBounds, PlaceSearchResult } from '@/lib/types';
import 'mapbox-gl/dist/mapbox-gl.css';

interface DraftLocation {
  lat: number;
  lng: number;
}

interface PlacesMapProps {
  places: PlaceSearchResult[];
  selectedPlaceId: string | null;
  hoveredPlaceId: string | null;
  flyRequest: FlyRequest | null;
  onFlyComplete: () => void;
  panelOpen: boolean;
  locationPickMode?: boolean;
  draftLocation?: DraftLocation | null;
  onPickLocation?: (location: DraftLocation) => void;
  mapCenterRequest?: number | null;
  onMapCenter?: (location: DraftLocation) => void;
  onSelectPlace: (placeId: string) => void;
  onHoverPlace: (placeId: string | null) => void;
  onViewportChange: (bounds: MapBounds, zoom: number) => void;
  mapboxToken?: string;
}

/** Right-side details / add-place drawer: 28rem + right-4 + gap. */
const PANEL_PADDING_RIGHT = 496;

function resolveFlyZoom(currentZoom: number, flyRequest: FlyRequest): number {
  if (flyRequest.zoom == null) return currentZoom;
  if (flyRequest.exactZoom) return flyRequest.zoom;
  return Math.max(currentZoom, flyRequest.zoom);
}

function flyPadding(
  panelOpen: boolean,
  exactZoom: boolean | undefined,
  size: { width: number; height: number }
) {
  const maxHorizontal = Math.max(0, size.width - 80);
  const maxVertical = Math.max(0, size.height - 80);
  // Line the padded viewport up with the list’s right edge (x≈396).
  let left = listPanelRightEdge(size.width);
  let right = panelOpen
    ? Math.min(PANEL_PADDING_RIGHT, Math.floor(maxHorizontal * 0.45))
    : exactZoom
      ? 0
      : Math.min(56, Math.floor(maxHorizontal * 0.45));
  if (left + right > maxHorizontal && left + right > 0) {
    const scale = maxHorizontal / (left + right);
    left = Math.floor(left * scale);
    right = Math.floor(right * scale);
  }
  if (exactZoom) {
    // Worldwide / location chips ignore the drawer so the list gap stays stable.
    return { top: 0, bottom: 0, left, right: 0 };
  }
  return {
    top: Math.min(96, Math.floor(maxVertical * 0.25)),
    bottom: Math.min(48, Math.floor(maxVertical * 0.15)),
    left,
    right,
  };
}

function paddingIsZero(map: MapboxMap): boolean {
  const padding = map.getPadding();
  return (
    (padding.top ?? 0) === 0 &&
    (padding.right ?? 0) === 0 &&
    (padding.bottom ?? 0) === 0 &&
    (padding.left ?? 0) === 0
  );
}

/** Drop leftover flyTo padding without shifting what is on screen. */
function clearPaddingKeepView(map: MapboxMap): void {
  if (paddingIsZero(map)) return;
  const canvas = map.getCanvas();
  const visual = map.unproject([canvas.clientWidth / 2, canvas.clientHeight / 2]);
  map.jumpTo({
    center: [visual.lng, visual.lat],
    padding: ZERO_PADDING,
  });
}

function MapZoomControls({
  panelOpen,
  onZoomIn,
  onZoomOut,
  onLocate,
}: {
  panelOpen: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onLocate: () => void;
}) {
  return (
    <div
      className={`pointer-events-auto absolute bottom-6 z-[25] flex flex-col gap-2 ${
        panelOpen ? 'right-[min(calc(100%-3.5rem),calc(1.25rem+28rem))]' : 'right-4'
      }`}
    >
      <button
        type="button"
        onClick={onZoomIn}
        className="h-10 w-10 rounded-full bg-white text-lg font-semibold text-gray-800 shadow-md ring-1 ring-black/10 hover:bg-gray-50"
        aria-label="Zoom in"
      >
        +
      </button>
      <button
        type="button"
        onClick={onZoomOut}
        className="h-10 w-10 rounded-full bg-white text-lg font-semibold text-gray-800 shadow-md ring-1 ring-black/10 hover:bg-gray-50"
        aria-label="Zoom out"
      >
        −
      </button>
      <button
        type="button"
        onClick={onLocate}
        className="mt-1 flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-800 shadow-md ring-1 ring-black/10 hover:bg-gray-50"
        aria-label="Locate me"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l2 2m6-2a8 8 0 11-16 0 8 8 0 0116 0z"
          />
        </svg>
      </button>
    </div>
  );
}

const PIN_PATH =
  'M16 0C7.163 0 0 7.163 0 16C0 24.837 16 40 16 40C16 40 32 24.837 32 16C32 7.163 24.837 0 16 0Z';

function pinSvg(fill: string, innerWhiteDot: boolean): string {
  const inner = innerWhiteDot
    ? '<circle cx="16" cy="14" r="6" fill="white" fill-opacity="0.92"/>'
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="80" viewBox="0 0 32 40"><path d="${PIN_PATH}" fill="${fill}"/>${inner}</svg>`;
}

function addFallbackOrangePin(map: MapboxMap, id: string): void {
  if (map.hasImage(id)) return;
  const width = 64;
  const height = 80;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.moveTo(32, 76);
  ctx.quadraticCurveTo(8, 44, 8, 28);
  ctx.arc(32, 28, 24, Math.PI, 0, false);
  ctx.quadraticCurveTo(56, 44, 32, 76);
  ctx.closePath();
  ctx.fill();
  map.addImage(id, ctx.getImageData(0, 0, width, height), { pixelRatio: 2 });
}

function loadMapImage(map: MapboxMap, id: string, svg: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (map.hasImage(id)) {
      resolve();
      return;
    }
    const img = new Image(64, 80);
    img.onload = () => {
      if (!map.hasImage(id)) {
        map.addImage(id, img, { pixelRatio: 2 });
      }
      resolve();
    };
    img.onerror = () => reject(new Error(`Failed to load pin ${id}`));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

async function ensurePinImage(map: MapboxMap, id: string, svg: string): Promise<void> {
  try {
    await loadMapImage(map, id, svg);
  } catch (error) {
    console.warn(`Map pin image "${id}" failed to load; using a plain orange pin fallback.`, error);
    addFallbackOrangePin(map, id);
  }
}

export default function PlacesMap({
  places,
  selectedPlaceId,
  hoveredPlaceId,
  flyRequest,
  onFlyComplete,
  panelOpen,
  locationPickMode = false,
  draftLocation = null,
  onPickLocation,
  mapCenterRequest = null,
  onMapCenter,
  onSelectPlace,
  onHoverPlace,
  onViewportChange,
  mapboxToken,
}: PlacesMapProps) {
  const mapRef = useRef<MapRef>(null);
  const flyEndHandlerRef = useRef<(() => void) | null>(null);
  const [imagesReady, setImagesReady] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  const geojson = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: places.map((place) => ({
        type: 'Feature' as const,
        properties: {
          place_id: place.place_id,
          place_name: place.place_name,
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [place.lng, place.lat] as [number, number],
        },
      })),
    }),
    [places]
  );

  const reportViewport = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const bounds = map.getBounds();
    if (!bounds) return;
    onViewportChange(
      {
        minLng: bounds.getWest(),
        minLat: bounds.getSouth(),
        maxLng: bounds.getEast(),
        maxLat: bounds.getNorth(),
      },
      map.getZoom()
    );
  }, [onViewportChange]);

  const handleLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    void Promise.all([
      ensurePinImage(map, 'pin-cluster', pinSvg('#111111', false)),
      ensurePinImage(map, 'pin-place', pinSvg('#f97316', true)),
      ensurePinImage(map, 'pin-place-active', pinSvg('#ea580c', true)),
    ]).finally(() => setImagesReady(true));
    reportViewport();
  }, [reportViewport]);

  const detailsOpen = panelOpen && !locationPickMode;
  const detailsOpenRef = useRef(detailsOpen);

  useEffect(() => {
    detailsOpenRef.current = detailsOpen;
  }, [detailsOpen]);

  useEffect(() => {
    if (detailsOpen) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    clearPaddingKeepView(map);
  }, [detailsOpen]);

  useEffect(() => {
    if (!mapCenterRequest || !mapRef.current || !onMapCenter) return;
    const map = mapRef.current.getMap();
    clearPaddingKeepView(map);
    // Visual canvas center, not Mapbox's padded getCenter() leftover from flyTo.
    const canvas = map.getCanvas();
    const point = map.unproject([canvas.clientWidth / 2, canvas.clientHeight / 2]);
    onMapCenter({ lat: point.lat, lng: point.lng });
  }, [mapCenterRequest, onMapCenter]);

  useEffect(() => {
    if (!flyRequest || !mapRef.current) return;
    const map = mapRef.current.getMap();
    const currentZoom = map.getZoom();
    const container = map.getContainer();
    const size = { width: container.clientWidth, height: container.clientHeight };
    const padding = flyPadding(panelOpen, flyRequest.exactZoom, size);
    let zoom = resolveFlyZoom(currentZoom, flyRequest);
    let longitude = flyRequest.longitude;
    let latitude = flyRequest.latitude;
    if (flyRequest.exactZoom && (flyRequest.zoom ?? currentZoom) <= 1.3) {
      const framing = worldwideFraming(size.width, size.height, {
        left: padding.left,
        right: padding.right,
      });
      zoom = framing.zoom;
      longitude = framing.lng;
      latitude = framing.lat;
    }
    if (flyEndHandlerRef.current) {
      map.off('moveend', flyEndHandlerRef.current);
      flyEndHandlerRef.current = null;
    }
    const onFlyEnd = () => {
      flyEndHandlerRef.current = null;
      if (detailsOpenRef.current) return;
      const live = mapRef.current?.getMap();
      if (!live) return;
      const canvas = live.getCanvas();
      const visual = live.unproject([canvas.clientWidth / 2, canvas.clientHeight / 2]);
      live.jumpTo({
        center: [visual.lng, visual.lat],
        padding: ZERO_PADDING,
      });
    };
    // mapbox-gl 3.33 flyTo() stop()s any in-flight camera first and fires
    // moveend synchronously. Attach the listener after flyTo so that interrupt
    // does not consume this flight's cleanup. Preset flights also pass
    // retainPadding: false (supported in 3.33) so global padding stays 0.
    flyToThenOnMoveend(
      map,
      {
        center: [longitude, latitude],
        zoom,
        duration: 800,
        padding,
        retainPadding: flyRequest.exactZoom ? false : undefined,
      },
      onFlyEnd
    );
    flyEndHandlerRef.current = onFlyEnd;
    onFlyComplete();
  }, [flyRequest, onFlyComplete, panelOpen]);

  const zoomBy = (delta: number) => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    if (!detailsOpen) {
      clearPaddingKeepView(map);
    }
    map.zoomTo(map.getZoom() + delta, { duration: 200 });
  };

  const locateMe = () => {
    if (!navigator.geolocation) {
      setLocateError('Geolocation is not supported in this browser.');
      return;
    }
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        mapRef.current?.flyTo({
          center: [position.coords.longitude, position.coords.latitude],
          zoom: 11,
          duration: 900,
        });
      },
      (err) => {
        setLocateError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied.'
            : 'Unable to get your location.'
        );
      }
    );
  };

  const handleMapClick = (event: MapMouseEvent) => {
    const feature = event.features?.[0] as
      | {
          properties?: { cluster?: boolean; cluster_id?: number | string; place_id?: string };
          geometry?: { type?: string; coordinates?: [number, number] };
        }
      | undefined;
    const props = feature?.properties;
    if (props?.cluster_id != null && mapRef.current) {
      const source = mapRef.current.getMap().getSource('places') as GeoJSONSource;
      const coords = feature?.geometry?.type === 'Point' ? feature.geometry.coordinates : undefined;
      const clusterCenter: [number, number] = coords ?? [event.lngLat.lng, event.lngLat.lat];
      source.getClusterExpansionZoom(Number(props.cluster_id), (error, zoom) => {
        if (error || zoom == null) return;
        const map = mapRef.current?.getMap();
        if (map && !detailsOpen) {
          clearPaddingKeepView(map);
        }
        mapRef.current?.easeTo({ center: clusterCenter, zoom, duration: 500 });
      });
      return;
    }
    if (locationPickMode) {
      onPickLocation?.({ lat: event.lngLat.lat, lng: event.lngLat.lng });
      return;
    }
    if (props?.place_id) {
      onSelectPlace(props.place_id);
    }
  };

  const handleMouseMove = (event: MapMouseEvent) => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const feature = event.features?.[0] as
      | { properties?: { cluster?: boolean; place_id?: string } }
      | undefined;
    const props = feature?.properties;
    if (locationPickMode) {
      map.getCanvas().style.cursor = props?.cluster ? 'pointer' : 'crosshair';
    } else {
      map.getCanvas().style.cursor = feature ? 'pointer' : '';
    }
    onHoverPlace(props?.place_id && !props.cluster ? props.place_id : null);
  };

  const accessToken = resolveMapboxToken(mapboxToken);

  if (!accessToken) {
    return (
      <div data-places-map className="relative flex h-full w-full items-center justify-center bg-[#e8e4dc]">
        <div className="mx-6 max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
          <h3 className="text-lg font-semibold text-gray-900">Mapbox token required</h3>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            Add a real <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_MAPBOX_TOKEN</code> to{' '}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">frontend/.env.local</code> to enable the
            interactive map. Blank values and the <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">.env.example</code>{' '}
            placeholder are treated as no token. The list and filters still work.
          </p>
        </div>
        <MapZoomControls
          panelOpen={panelOpen}
          onZoomIn={() => zoomBy(1)}
          onZoomOut={() => zoomBy(-1)}
          onLocate={locateMe}
        />
      </div>
    );
  }

  const highlightId = hoveredPlaceId || selectedPlaceId || '';

  return (
    <div data-places-map className="relative h-full w-full">
      <MapGL
        ref={mapRef}
        initialViewState={{ longitude: -98.5795, latitude: 39.8283, zoom: 3.4 }}
        projection="mercator"
        mapStyle="mapbox://styles/mapbox/light-v11"
        mapboxAccessToken={accessToken}
        attributionControl
        style={{ width: '100%', height: '100%' }}
        interactiveLayerIds={imagesReady ? ['clusters', 'cluster-count', 'unclustered-point'] : []}
        cursor="auto"
        onLoad={handleLoad}
        onMoveEnd={reportViewport}
        onClick={handleMapClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
          const map = mapRef.current?.getMap();
          if (map) map.getCanvas().style.cursor = '';
          onHoverPlace(null);
        }}
      >
        {imagesReady && (
          <Source id="places" type="geojson" data={geojson} cluster clusterMaxZoom={14} clusterRadius={60}>
            <Layer
              id="unclustered-point"
              type="symbol"
              filter={['!', ['has', 'point_count']]}
              layout={{
                'icon-image': [
                  'case',
                  ['==', ['get', 'place_id'], highlightId],
                  'pin-place-active',
                  'pin-place',
                ],
                'icon-anchor': 'bottom',
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
                'icon-size': [
                  'case',
                  ['==', ['get', 'place_id'], selectedPlaceId ?? ''],
                  1.25,
                  ['==', ['get', 'place_id'], hoveredPlaceId ?? ''],
                  1.15,
                  1,
                ],
              }}
            />
            <Layer
              id="clusters"
              type="symbol"
              filter={['has', 'point_count']}
              layout={{
                'icon-image': 'pin-cluster',
                'icon-anchor': 'bottom',
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
              }}
            />
            <Layer
              id="cluster-count"
              type="symbol"
              filter={['has', 'point_count']}
              layout={{
                'text-field': ['get', 'point_count_abbreviated'],
                'text-size': 12,
                'text-offset': [0, -1.35],
                'text-allow-overlap': true,
                'text-ignore-placement': true,
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
              }}
              paint={{
                'text-color': '#ffffff',
                'text-halo-color': '#111111',
                'text-halo-width': 1.25,
              }}
            />
          </Source>
        )}
        {draftLocation && (
          <Marker longitude={draftLocation.lng} latitude={draftLocation.lat} anchor="bottom">
            <div className="pointer-events-none flex flex-col items-center" aria-hidden>
              <div className="h-7 w-7 rounded-full border-[3px] border-white bg-gray-900 shadow-lg" />
              <div className="-mt-0.5 h-2.5 w-0.5 bg-gray-900" />
            </div>
          </Marker>
        )}
      </MapGL>

      {locationPickMode && (
        <div className="pointer-events-none absolute left-1/2 top-24 z-10 -translate-x-1/2 rounded-full bg-gray-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
          Click the map to drop a pin
        </div>
      )}

      <MapZoomControls
        panelOpen={panelOpen}
        onZoomIn={() => zoomBy(1)}
        onZoomOut={() => zoomBy(-1)}
        onLocate={locateMe}
      />
      {locateError && (
        <div
          role="status"
          className="absolute bottom-6 left-1/2 z-10 max-w-xs -translate-x-1/2 rounded-xl bg-gray-900 px-3 py-2 text-center text-xs text-white shadow-lg"
        >
          {locateError}
        </div>
      )}
    </div>
  );
}
