'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import MapGL, { Layer, Marker, Source } from 'react-map-gl/mapbox';
import type { MapMouseEvent, MapRef, ViewStateChangeEvent } from 'react-map-gl/mapbox';
import type { GeoJSONSource, Map as MapboxMap } from 'mapbox-gl';
import { BRAND } from '@/lib/brand';
import {
  CAMERA_DURATION,
  STREETS_LOW_ZOOM_OCEAN,
  ZERO_PADDING,
  cameraEaseOptions,
  cameraFlyOptions,
  cameraMoveendEffects,
  canvasFillStyle,
  canvasHostStyle,
  canvasReadyForFlight,
  claimFlyNonce,
  clearPaddingKeepView,
  flyPadding,
  isNarrowViewport,
  isProgrammaticCanvasMove,
  isProgrammaticFlightTag,
  presetFlyCamera,
  readMeasuredViewport,
  createCanvasMachine,
  mapControlsRightPx,
  mapNeedsResize,
  mapboxChromeInsetLeft,
  paddingIsZero,
  pickCameraAnimation,
  pinHintCenterX,
  presetCamera,
  readMapWaterColor,
  reduceCanvasMachine,
  scheduleMapResize,
  shouldApplyNarrowWorldwideAfterResize,
  shouldClearPaddingAfterFlight,
  shouldReapplyNarrowWorldwide,
  startCameraAnimation,
  type FlightTag,
  type MapResizeState,
  type SizeBox,
} from '@/lib/map-camera';
import type { LocationPreset } from '@/lib/locations';
import {
  MAPBOX_STREETS_STYLE,
  MAP_FADE_DURATION_MS,
  PIN_STROKE,
  clusterLeafHasPlace,
  muteMotorwayLayers,
  pinMapboxChromeToContainer,
  placesMapLayerSpecs,
  placesToGeoJSON,
} from '@/lib/map-style';
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
  bindHover?: (apply: (placeId: string | null) => void) => () => void;
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
  onUserCameraMove?: () => void;
  /** True while a programmatic fly / cluster ease is running — suppress bbox search. */
  onCameraBusy?: (busy: boolean) => void;
  /** Pixels from the top so the pin-drop hint sits below the filter chrome. */
  hintTop?: number;
  mapboxToken?: string;
  /** Collapse list occupancy (drawer collision or compact list at ≤768). */
  collapseList?: boolean;
  /** Top chrome (filter + compact list) to keep out of an exactZoom fit. */
  fitTop?: number;
  /** Window size from the page so canvas layout and preset flies stay in sync. */
  viewportWidth?: number;
  viewportHeight?: number;
  location?: LocationPreset;
  /** False while a location chip is still the selected camera. */
  leftPreset?: boolean;
}

function resolveFlyZoom(currentZoom: number, flyRequest: FlyRequest): number {
  if (flyRequest.zoom == null) return currentZoom;
  if (flyRequest.exactZoom) return flyRequest.zoom;
  return Math.max(currentZoom, flyRequest.zoom);
}

function MapZoomControls({
  panelOpen,
  canvasWidth,
  onZoomIn,
  onZoomOut,
  onLocate,
}: {
  panelOpen: boolean;
  canvasWidth: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onLocate: () => void;
}) {
  return (
    <div
      data-map-controls
      className="pointer-events-auto absolute bottom-6 z-[25] flex flex-col gap-2"
      style={{ right: mapControlsRightPx(canvasWidth, panelOpen) }}
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
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="80" viewBox="-3 -3 38 48"><defs><filter id="pin-shadow" x="-40%" y="-20%" width="180%" height="180%"><feDropShadow dx="0" dy="1.4" stdDeviation="1.1" flood-color="#0f172a" flood-opacity="0.32"/></filter></defs><path d="${PIN_PATH}" fill="${fill}" stroke="${PIN_STROKE}" stroke-width="1.8" stroke-linejoin="round" filter="url(#pin-shadow)"/>${inner}</svg>`;
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
  ctx.fillStyle = BRAND.orange;
  ctx.strokeStyle = PIN_STROKE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(32, 76);
  ctx.quadraticCurveTo(8, 44, 8, 28);
  ctx.arc(32, 28, 24, Math.PI, 0, false);
  ctx.quadraticCurveTo(56, 44, 32, 76);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
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
  bindHover,
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
  onUserCameraMove,
  onCameraBusy,
  hintTop = 96,
  mapboxToken,
  collapseList = false,
  fitTop = 0,
  viewportWidth,
  viewportHeight,
  location,
  leftPreset = false,
}: PlacesMapProps) {
  const mapRef = useRef<MapRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapBoxRef = useRef<HTMLDivElement>(null);
  const flyEndHandlerRef = useRef<(() => void) | null>(null);
  const flightTagRef = useRef<string | null>(null);
  const startedFlyNonceRef = useRef<number | null>(null);
  const [imagesReady, setImagesReady] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [highlightedClusterId, setHighlightedClusterId] = useState<number | null>(null);
  const [clusterQueryTick, setClusterQueryTick] = useState(0);
  const featureStateRef = useRef<{ hover: string | null; selected: string | null }>({
    hover: null,
    selected: null,
  });
  const [outerSize, setOuterSize] = useState(() => ({
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 800 : window.innerHeight,
  }));
  const [canvasSize, setCanvasSize] = useState(() => ({
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 800 : window.innerHeight,
  }));
  const [waterColor, setWaterColor] = useState<string | undefined>(undefined);
  const resizeStateRef = useRef<MapResizeState>({ rafId: null });
  const liveZoomRef = useRef<number | null>(null);
  const slotSize = useMemo(
    () => ({
      width: viewportWidth ?? outerSize.width,
      height: viewportHeight ?? outerSize.height,
    }),
    [outerSize.height, outerSize.width, viewportHeight, viewportWidth]
  );
  const canvasMachineRef = useRef(createCanvasMachine(slotSize));
  const [canvasLayout, setCanvasLayout] = useState(() => ({
    top: 0,
    height: typeof window === 'undefined' ? 800 : window.innerHeight,
  }));
  const pendingNarrowWorldwideRef = useRef(false);
  const prevSlotForJumpRef = useRef<SizeBox | null>(null);
  const jumpContextRef = useRef({ leftPreset, location, slotSize });
  const flyFitTop = canvasLayout.top > 0 ? 0 : fitTop;

  const commitCanvas = useCallback((next: ReturnType<typeof reduceCanvasMachine>) => {
    canvasMachineRef.current = next;
    setCanvasLayout((prev) =>
      prev.top === next.box.top && prev.height === next.box.height ? prev : next.box
    );
  }, []);

  const targetZoomForFly = useCallback(
    (currentZoom: number) => {
      if (!flyRequest) return currentZoom;
      if (flyRequest.exactZoom && location) {
        return presetCamera(location, slotSize.width, slotSize.height, { left: 0, right: 0 }).zoom;
      }
      if (flyRequest.exactZoom && (flyRequest.zoom ?? currentZoom) <= 1.3) {
        return presetCamera(
          {
            id: 'worldwide',
            lat: flyRequest.latitude,
            lng: flyRequest.longitude,
            zoom: flyRequest.zoom ?? 1.15,
            radiusKm: 20000,
          },
          slotSize.width,
          slotSize.height,
          { left: 0, right: 0 }
        ).zoom;
      }
      return resolveFlyZoom(currentZoom, flyRequest);
    },
    [flyRequest, location, slotSize.height, slotSize.width]
  );

  const clearPaddingProgrammatic = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return false;
    if (paddingIsZero(map.getPadding())) return false;
    flightTagRef.current = 'resize';
    return clearPaddingKeepView(map);
  }, []);

  const applyNarrowWorldwideAfterResize = useCallback(() => {
    if (!pendingNarrowWorldwideRef.current) return;
    const { leftPreset: left, location: loc, slotSize: slot } = jumpContextRef.current;
    if (!loc || left || loc.id !== 'worldwide') {
      pendingNarrowWorldwideRef.current = false;
      return;
    }
    const measured =
      readMeasuredViewport(containerRef.current) ??
      readMeasuredViewport(mapBoxRef.current) ??
      slot;
    const el = mapBoxRef.current;
    const map = mapRef.current?.getMap();
    const liveZoom = map?.getZoom() ?? liveZoomRef.current ?? 0;
    const canvasHeight = el?.clientHeight ?? measured.height;
    if (canvasHeight >= measured.height - 1) return;
    if (
      !shouldApplyNarrowWorldwideAfterResize({
        pending: true,
        leftPreset: left,
        locationId: loc.id,
        viewport: measured,
        canvasHeight,
        liveZoom,
      })
    ) {
      pendingNarrowWorldwideRef.current = false;
      return;
    }
    if (!map) return;
    pendingNarrowWorldwideRef.current = false;
    const camera = presetFlyCamera(loc, measured);
    flightTagRef.current = 'resize';
    map.jumpTo({ center: [camera.lng, camera.lat], zoom: camera.zoom });
    liveZoomRef.current = camera.zoom;
    commitCanvas(reduceCanvasMachine(canvasMachineRef.current, { type: 'flightEnd', zoom: camera.zoom }));
    flightTagRef.current = null;
  }, [commitCanvas]);

  const requestMapResize = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    if (isProgrammaticFlightTag(flightTagRef.current) && !pendingNarrowWorldwideRef.current) {
      return;
    }
    if (flyRequest && !pendingNarrowWorldwideRef.current) {
      return;
    }
    if (!mapNeedsResize(map.getCanvas(), mapBoxRef.current)) {
      applyNarrowWorldwideAfterResize();
      return;
    }
    flightTagRef.current = 'resize';
    scheduleMapResize(
      map,
      resizeStateRef.current,
      requestAnimationFrame,
      cancelAnimationFrame,
      applyNarrowWorldwideAfterResize
    );
  }, [applyNarrowWorldwideAfterResize, flyRequest]);

  const applyWaterColor = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const color = readMapWaterColor(
      (layer, prop) => map.getPaintProperty(layer, prop as never),
      map.getZoom()
    );
    if (color) setWaterColor((prev) => (prev === color ? prev : color));
  }, []);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      setOuterSize({ width: el.clientWidth, height: el.clientHeight });
      requestMapResize();
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [requestMapResize]);

  useLayoutEffect(() => {
    const el = mapBoxRef.current;
    if (!el) return;
    const update = () => {
      setCanvasSize({ width: el.clientWidth, height: el.clientHeight });
      requestMapResize();
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    const resizeState = resizeStateRef.current;
    return () => {
      observer.disconnect();
      if (resizeState.rafId != null) {
        cancelAnimationFrame(resizeState.rafId);
        resizeState.rafId = null;
      }
    };
  }, [requestMapResize, canvasLayout.top, canvasLayout.height]);

  useLayoutEffect(() => {
    jumpContextRef.current = { leftPreset, location, slotSize };
    const prev = prevSlotForJumpRef.current;
    if (shouldReapplyNarrowWorldwide(leftPreset, location?.id ?? '', prev, slotSize)) {
      pendingNarrowWorldwideRef.current = true;
    }
    prevSlotForJumpRef.current = slotSize;
    let next = reduceCanvasMachine(canvasMachineRef.current, { type: 'viewport', viewport: slotSize });
    if (flyRequest) {
      const currentZoom = mapRef.current?.getMap()?.getZoom() ?? liveZoomRef.current ?? 3.4;
      next = reduceCanvasMachine(next, {
        type: 'prepareFlight',
        targetZoom: targetZoomForFly(currentZoom),
        viewport: slotSize,
      });
    }
    commitCanvas(next);
  }, [commitCanvas, flyRequest, leftPreset, location, slotSize, targetZoomForFly]);

  const geojson = useMemo(() => placesToGeoJSON(places), [places]);

  const layerSpecs = useMemo(
    () =>
      placesMapLayerSpecs({
        selectedPlaceId,
        highlightedClusterId,
      }),
    [selectedPlaceId, highlightedClusterId]
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
    map.setMinZoom(0);
    muteMotorwayLayers(map);
    flightTagRef.current = 'resize';
    map.resize();
    pinMapboxChromeToContainer(containerRef.current, map.getContainer());
    applyWaterColor();
    map.once('idle', applyWaterColor);
    void Promise.all([
      ensurePinImage(map, 'pin-place', pinSvg(BRAND.orange, true)),
      ensurePinImage(map, 'pin-place-active', pinSvg(BRAND.orangeSelected, true)),
    ]).finally(() => setImagesReady(true));
    reportViewport();
  }, [applyWaterColor, reportViewport]);

  const detailsOpen = panelOpen && !locationPickMode;
  const detailsOpenRef = useRef(detailsOpen);

  useEffect(() => {
    detailsOpenRef.current = detailsOpen;
  }, [detailsOpen]);

  useEffect(() => {
    if (detailsOpen) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    clearPaddingProgrammatic();
  }, [clearPaddingProgrammatic, detailsOpen]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !imagesReady) return;
    const applyHover = (placeId: string | null) => {
      const prev = featureStateRef.current.hover;
      if (prev === placeId) return;
      try {
        if (prev) map.removeFeatureState({ source: 'places', id: prev }, 'hover');
        if (placeId) map.setFeatureState({ source: 'places', id: placeId }, { hover: true });
      } catch {
        /* source or feature may not exist at this zoom */
      }
      featureStateRef.current.hover = placeId;
    };
    return bindHover?.(applyHover);
  }, [bindHover, imagesReady]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !imagesReady) return;
    const prev = featureStateRef.current.selected;
    if (prev === selectedPlaceId) return;
    try {
      if (prev) map.removeFeatureState({ source: 'places', id: prev }, 'selected');
      if (selectedPlaceId) map.setFeatureState({ source: 'places', id: selectedPlaceId }, { selected: true });
    } catch {
      /* clustered-away points have no source feature */
    }
    featureStateRef.current.selected = selectedPlaceId;
  }, [selectedPlaceId, imagesReady]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    const placeId = selectedPlaceId;
    if (!map || !imagesReady || !placeId) {
      setHighlightedClusterId(null);
      return;
    }
    const source = map.getSource('places') as GeoJSONSource | undefined;
    if (!source?.getClusterLeaves) {
      setHighlightedClusterId(null);
      return;
    }
    const clusters = map.queryRenderedFeatures({ layers: ['clusters'] }).slice(0, 12);
    if (clusters.length === 0) {
      setHighlightedClusterId(null);
      return;
    }
    let cancelled = false;
    let pending = clusters.length;
    let found = false;
    for (const feature of clusters) {
      const clusterId = Number(
        (feature as { properties?: { cluster_id?: number | string } }).properties?.cluster_id
      );
      if (!Number.isFinite(clusterId)) {
        pending -= 1;
        continue;
      }
      source.getClusterLeaves(clusterId, 80, 0, (error, leaves) => {
        if (cancelled || found) return;
        pending -= 1;
        const rows = (leaves ?? []) as Array<{ properties?: { place_id?: string } }>;
        if (!error && clusterLeafHasPlace(rows, placeId)) {
          found = true;
          setHighlightedClusterId(clusterId);
          return;
        }
        if (pending <= 0) setHighlightedClusterId(null);
      });
    }
    if (pending <= 0 && !found) setHighlightedClusterId(null);
    return () => {
      cancelled = true;
    };
  }, [selectedPlaceId, imagesReady, clusterQueryTick]);

  useEffect(() => {
    if (!mapCenterRequest || !mapRef.current || !onMapCenter) return;
    const map = mapRef.current.getMap();
    clearPaddingProgrammatic();
    // Visual canvas center, not Mapbox's padded getCenter() leftover from flyTo.
    const canvas = map.getCanvas();
    const point = map.unproject([canvas.clientWidth / 2, canvas.clientHeight / 2]);
    onMapCenter({ lat: point.lat, lng: point.lng });
  }, [clearPaddingProgrammatic, mapCenterRequest, onMapCenter]);

  useEffect(() => {
    if (!flyRequest || !mapRef.current) return;
    const prepared = canvasMachineRef.current.box;
    if (!canvasReadyForFlight(canvasLayout, prepared)) return;
    if (!claimFlyNonce(startedFlyNonceRef, flyRequest.nonce)) return;
    const map = mapRef.current.getMap();
    if (resizeStateRef.current.rafId != null) {
      cancelAnimationFrame(resizeStateRef.current.rafId);
      resizeStateRef.current.rafId = null;
    }
    const programmatic = Boolean(flyRequest.programmatic);
    const flightTag: FlightTag = programmatic
      ? 'programmatic'
      : flyRequest.exactZoom
        ? 'preset'
        : flyRequest.ease
          ? 'drawer'
          : 'place';
    flightTagRef.current = flightTag;
    onCameraBusy?.(true);
    if (mapNeedsResize(map.getCanvas(), mapBoxRef.current)) {
      map.resize();
    }
    const measured =
      readMeasuredViewport(containerRef.current) ??
      readMeasuredViewport(map.getCanvas()) ??
      slotSize;
    const currentZoom = map.getZoom();
    const size = { width: measured.width, height: prepared.height };
    const narrowWorldFly =
      Boolean(flyRequest.exactZoom) &&
      isNarrowViewport(measured.width) &&
      (location?.id === 'worldwide' || (flyRequest.zoom ?? currentZoom) <= 1.3);
    const padding = flyPadding(
      panelOpen,
      flyRequest.exactZoom,
      size,
      collapseList || narrowWorldFly,
      flyFitTop
    );
    let zoom = flyRequest.keepZoom ? currentZoom : resolveFlyZoom(currentZoom, flyRequest);
    let longitude = flyRequest.longitude;
    let latitude = flyRequest.latitude;
    if (!flyRequest.exactZoom && !flyRequest.ease && !flyRequest.programmatic) {
      onUserCameraMove?.();
    }
    if (flyRequest.exactZoom && location) {
      const camera = presetFlyCamera(location, measured, panelOpen);
      zoom = camera.zoom;
      longitude = camera.lng;
      latitude = camera.lat;
    } else if (flyRequest.exactZoom && (flyRequest.zoom ?? currentZoom) <= 1.3) {
      const camera = presetFlyCamera(
        {
          id: 'worldwide',
          lat: flyRequest.latitude,
          lng: flyRequest.longitude,
          zoom: flyRequest.zoom ?? 1.15,
          radiusKm: 20000,
        },
        measured,
        panelOpen
      );
      zoom = camera.zoom;
      longitude = camera.lng;
      latitude = camera.lat;
    }
    liveZoomRef.current = zoom;
    const keepFitPadding = Boolean(flyRequest.exactZoom && flyFitTop > 0);
    const onFlyEnd = () => {
      const live = mapRef.current?.getMap();
      const endedZoom = live?.getZoom() ?? zoom;
      commitCanvas(reduceCanvasMachine(canvasMachineRef.current, { type: 'flightEnd', zoom: endedZoom }));
      const shouldClear =
        !detailsOpenRef.current &&
        !keepFitPadding &&
        shouldClearPaddingAfterFlight(
          flyRequest.exactZoom ? ZERO_PADDING : padding,
          live?.getPadding()
        );
      if (shouldClear) {
        clearPaddingProgrammatic();
      }
      reportViewport();
      flightTagRef.current = null;
      onCameraBusy?.(false);
      onFlyComplete();
    };
    const current = map.getCenter();
    const move = programmatic
      ? { method: 'easeTo' as const, duration: 0 }
      : flyRequest.ease
        ? pickCameraAnimation('drawer', current, { lng: longitude, lat: latitude, zoom })
        : pickCameraAnimation(
            flyRequest.exactZoom ? 'preset' : 'place',
            { lng: current.lng, lat: current.lat, zoom: currentZoom },
            { lng: longitude, lat: latitude, zoom }
          );
    const cameraOptions = flyRequest.exactZoom
      ? {
          center: [longitude, latitude],
          zoom,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          retainPadding: false,
        }
      : {
          center: [longitude, latitude],
          zoom,
          padding,
          retainPadding: keepFitPadding || !paddingIsZero(padding),
        };
    // Instant flights (duration 0 / reduced motion) finish inside flyTo/easeTo
    // and startCameraAnimation runs onFlyEnd now. Animated flights attach after
    // start so stop() from an interrupt does not consume this cleanup.
    // Shrink-first already resized the short canvas. One capped unpadded
    // preset fly; a leftover padded flight may add one jumpTo so the visual
    // centre stays put and moveend reports bounds.
    startCameraAnimation(
      map,
      flyEndHandlerRef,
      move.method,
      move.method === 'easeTo'
        ? cameraEaseOptions(move.duration, cameraOptions)
        : cameraFlyOptions({ ...cameraOptions, duration: move.duration }),
      onFlyEnd
    );
  }, [
    canvasLayout,
    collapseList,
    commitCanvas,
    flyFitTop,
    flyRequest,
    location,
    clearPaddingProgrammatic,
    onCameraBusy,
    onFlyComplete,
    onUserCameraMove,
    panelOpen,
    reportViewport,
    slotSize,
  ]);

  const zoomBy = (delta: number) => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    if (!detailsOpen) {
      clearPaddingProgrammatic();
    }
    onCameraBusy?.(true);
    onUserCameraMove?.();
    flightTagRef.current = 'zoom';
    startCameraAnimation(
      map,
      flyEndHandlerRef,
      'easeTo',
      cameraEaseOptions(CAMERA_DURATION.zoom, { zoom: map.getZoom() + delta }),
      () => {
        flightTagRef.current = null;
        onCameraBusy?.(false);
        reportViewport();
      }
    );
  };

  const locateMe = () => {
    if (!navigator.geolocation) {
      setLocateError('Geolocation is not supported in this browser.');
      return;
    }
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onUserCameraMove?.();
        const live = mapRef.current?.getMap();
        if (!live) return;
        onCameraBusy?.(true);
        flightTagRef.current = 'locate';
        startCameraAnimation(
          live,
          flyEndHandlerRef,
          'flyTo',
          cameraFlyOptions({
            center: [position.coords.longitude, position.coords.latitude],
            zoom: 11,
            duration: CAMERA_DURATION.locate,
          }),
          () => {
            flightTagRef.current = null;
            onCameraBusy?.(false);
            reportViewport();
          }
        );
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
          clearPaddingProgrammatic();
        }
        const live = mapRef.current?.getMap();
        if (!live) return;
        onCameraBusy?.(true);
        flightTagRef.current = 'cluster';
        startCameraAnimation(
          live,
          flyEndHandlerRef,
          'easeTo',
          cameraEaseOptions(CAMERA_DURATION.cluster, {
            center: clusterCenter,
            zoom,
          }),
          () => {
            onUserCameraMove?.();
            flightTagRef.current = null;
            onCameraBusy?.(false);
            reportViewport();
          }
        );
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
    } else if (props?.cluster || props?.place_id) {
      map.getCanvas().style.cursor = 'pointer';
    } else {
      map.getCanvas().style.cursor = '';
    }
  };

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !imagesReady) return;
    const pinLayers = ['unclustered-point', 'unclustered-point-hover', 'unclustered-point-selected'];
    const placeIdFromFeatures = (features: unknown): string | null => {
      const first = Array.isArray(features) ? features[0] : undefined;
      const props = (first as { properties?: { place_id?: string } } | undefined)?.properties;
      return props?.place_id ?? null;
    };
    const onEnter = (event: { features?: unknown; point?: { x: number; y: number } }) => {
      const placeId = placeIdFromFeatures(event.features);
      map.getCanvas().style.cursor = locationPickMode ? 'crosshair' : 'pointer';
      if (placeId && !locationPickMode) onHoverPlace(placeId);
    };
    const onLeave = (event: { point?: { x: number; y: number } }) => {
      const hits = event.point
        ? map.queryRenderedFeatures([event.point.x, event.point.y], { layers: pinLayers })
        : [];
      const nextId = placeIdFromFeatures(hits);
      if (nextId && !locationPickMode) {
        onHoverPlace(nextId);
        return;
      }
      map.getCanvas().style.cursor = locationPickMode ? 'crosshair' : '';
      if (!locationPickMode) onHoverPlace(null);
    };
    let attached = false;
    const attach = () => {
      if (attached || !map.getLayer('unclustered-point')) return;
      attached = true;
      for (const layer of pinLayers) {
        map.on('mouseenter', layer, onEnter);
        map.on('mouseleave', layer, onLeave);
      }
    };
    attach();
    map.on('idle', attach);
    return () => {
      map.off('idle', attach);
      if (!attached) return;
      for (const layer of pinLayers) {
        map.off('mouseenter', layer, onEnter);
        map.off('mouseleave', layer, onLeave);
      }
    };
  }, [imagesReady, locationPickMode, onHoverPlace]);

  const handleMove = useCallback(
    (event: ViewStateChangeEvent) => {
      const nextZoom = event.viewState.zoom;
      const prevZoom = liveZoomRef.current;
      liveZoomRef.current = nextZoom;
      const tag = flightTagRef.current;
      if (isProgrammaticCanvasMove(tag, event as { originalEvent?: unknown })) {
        commitCanvas(reduceCanvasMachine(canvasMachineRef.current, { type: 'flightProgress', zoom: nextZoom }));
        return;
      }
      if (prevZoom != null && Math.abs(prevZoom - nextZoom) < 1e-6) {
        commitCanvas(reduceCanvasMachine(canvasMachineRef.current, { type: 'pan', zoom: nextZoom }));
        return;
      }
      commitCanvas(
        reduceCanvasMachine(canvasMachineRef.current, {
          type: 'userZoom',
          zoom: nextZoom,
          prevZoom: prevZoom ?? nextZoom,
        })
      );
    },
    [commitCanvas]
  );

  const handleMoveEnd = useCallback(
    (event: ViewStateChangeEvent) => {
      handleMove(event);
      const tag = flightTagRef.current;
      const effects = cameraMoveendEffects(event as { originalEvent?: unknown }, tag);
      if (effects.leavePreset) {
        onUserCameraMove?.();
      }
      if (effects.reportBounds) {
        reportViewport();
        setClusterQueryTick((tick) => tick + 1);
      }
      if (tag === 'resize' || effects.leavePreset) {
        flightTagRef.current = null;
      }
    },
    [handleMove, onUserCameraMove, reportViewport]
  );

  const pinHint = locationPickMode ? (
    <div
      data-pin-hint
      className="pointer-events-none absolute z-20 -translate-x-1/2 rounded-full bg-gray-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg"
      style={{ left: pinHintCenterX(canvasSize.width, panelOpen, collapseList), top: hintTop }}
    >
      Click the map to drop a pin
    </div>
  ) : null;

  const zoomControls = (
    <MapZoomControls
      panelOpen={panelOpen}
      canvasWidth={canvasSize.width}
      onZoomIn={() => zoomBy(1)}
      onZoomOut={() => zoomBy(-1)}
      onLocate={locateMe}
    />
  );

  const accessToken = resolveMapboxToken(mapboxToken);
  const fillColor = waterColor ?? (canvasLayout.top > 0 ? STREETS_LOW_ZOOM_OCEAN : undefined);
  const leftoverFill = fillColor ? canvasFillStyle(canvasLayout, fillColor) : null;
  const hostStyle = canvasHostStyle(canvasLayout);

  if (!accessToken) {
    return (
      <div
        ref={containerRef}
        data-places-map
        className="relative flex h-full w-full items-center justify-center bg-[#e8e4dc]"
      >
        <div className="mx-6 max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
          <h3 className="text-lg font-semibold text-gray-900">Mapbox token required</h3>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            Add a real <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_MAPBOX_TOKEN</code> to{' '}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">.env.local</code> to enable the
            interactive map. Blank values and the <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">.env.example</code>{' '}
            placeholder are treated as no token. The list and filters still work.
          </p>
        </div>
        {pinHint}
        {zoomControls}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-places-map
      className="relative h-full w-full"
      style={{
        ...(fillColor ? { backgroundColor: fillColor } : {}),
        ['--map-chrome-left' as string]: `${mapboxChromeInsetLeft(slotSize.width, collapseList)}px`,
      }}
    >
      {leftoverFill && (
        <div
          data-map-fill
          className="pointer-events-none absolute inset-x-0 top-0"
          style={leftoverFill}
        />
      )}
      <div data-map-canvas className="absolute inset-0 overflow-hidden">
      <div
        ref={mapBoxRef}
        data-map-canvas-host
        className="absolute inset-x-0 top-0 overflow-hidden"
        style={hostStyle}
      >
      <MapGL
        ref={mapRef}
        initialViewState={{ longitude: -98.5795, latitude: 39.8283, zoom: 3.4 }}
        minZoom={0}
        projection="mercator"
        mapStyle={MAPBOX_STREETS_STYLE}
        mapboxAccessToken={accessToken}
        attributionControl
        renderWorldCopies
        {...{ fadeDuration: MAP_FADE_DURATION_MS }}
        style={{ width: '100%', height: '100%', backgroundColor: fillColor }}
        interactiveLayerIds={
          imagesReady
            ? [
                'clusters',
                'cluster-count',
                'unclustered-point',
                'unclustered-point-hover',
                'unclustered-point-selected',
              ]
            : []
        }
        cursor="auto"
        onLoad={handleLoad}
        onZoomEnd={applyWaterColor}
        onMove={handleMove}
        onMoveEnd={handleMoveEnd}
        onClick={handleMapClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
          const map = mapRef.current?.getMap();
          if (map) map.getCanvas().style.cursor = '';
          onHoverPlace(null);
        }}
      >
        {imagesReady && (
          <Source
            id="places"
            type="geojson"
            data={geojson}
            cluster
            clusterMaxZoom={14}
            clusterRadius={60}
            promoteId="place_id"
          >
            {layerSpecs.map((layer) => (
              <Layer
                key={layer.id}
                id={layer.id}
                type={layer.type}
                filter={layer.filter as never}
                layout={(layer.layout ?? {}) as never}
                paint={(layer.paint ?? {}) as never}
              />
            ))}
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
      </div>
      </div>

      {pinHint}
      {zoomControls}
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
