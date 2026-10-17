'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapGL, { Marker } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import Supercluster from 'supercluster';
import type { PlaceSearchResult } from '@/lib/types';
import type { MapBounds } from '@/lib/types';
import 'mapbox-gl/dist/mapbox-gl.css';

interface CameraTarget {
  longitude: number;
  latitude: number;
  zoom: number;
}

interface PlacesMapProps {
  places: PlaceSearchResult[];
  selectedPlaceId: string | null;
  hoveredPlaceId: string | null;
  flyToPlaceId: string | null;
  cameraTarget: CameraTarget | null;
  onSelectPlace: (placeId: string) => void;
  onHoverPlace: (placeId: string | null) => void;
  onViewportChange: (bounds: MapBounds) => void;
  mapboxToken?: string;
}

type PlaceProps = { placeId: string };

function Teardrop({
  fill,
  count,
  imageUrl,
  highlighted,
}: {
  fill: string;
  count?: number;
  imageUrl?: string | null;
  highlighted?: boolean;
}) {
  const size = highlighted ? 44 : count ? 40 : 36;
  const height = Math.round(size * 1.25);
  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 32 40"
      className="drop-shadow-md"
      style={{ display: 'block' }}
    >
      <path
        d="M16 0C7.163 0 0 7.163 0 16C0 24.837 16 40 16 40C16 40 32 24.837 32 16C32 7.163 24.837 0 16 0Z"
        fill={fill}
      />
      {count != null ? (
        <text
          x="16"
          y="18"
          textAnchor="middle"
          fill="white"
          fontSize="12"
          fontWeight="700"
          fontFamily="system-ui, sans-serif"
        >
          {count}
        </text>
      ) : imageUrl ? (
        <image href={imageUrl} x="8" y="6" width="16" height="16" clipPath="inset(0 round 8px)" />
      ) : (
        <circle cx="16" cy="14" r="6" fill="white" opacity="0.92" />
      )}
    </svg>
  );
}

export default function PlacesMap({
  places,
  selectedPlaceId,
  hoveredPlaceId,
  flyToPlaceId,
  cameraTarget,
  onSelectPlace,
  onHoverPlace,
  onViewportChange,
  mapboxToken,
}: PlacesMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [zoom, setZoom] = useState(3.4);
  const [bounds, setBounds] = useState<[number, number, number, number]>([-180, -85, 180, 85]);

  const reportViewport = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const b = map.getBounds();
    if (!b) return;
    const next: [number, number, number, number] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    setBounds(next);
    setZoom(map.getZoom());
    onViewportChange({
      minLng: next[0],
      minLat: next[1],
      maxLng: next[2],
      maxLat: next[3],
    });
  }, [onViewportChange]);

  const clusterIndex = useMemo(() => {
    const index = new Supercluster<PlaceProps>({
      radius: 68,
      maxZoom: 16,
    });
    index.load(
      places.map((place) => ({
        type: 'Feature' as const,
        properties: { placeId: place.place_id },
        geometry: {
          type: 'Point' as const,
          coordinates: [place.lng, place.lat],
        },
      }))
    );
    return index;
  }, [places]);

  const clusters = useMemo(() => {
    return clusterIndex.getClusters(bounds, Math.round(zoom));
  }, [clusterIndex, bounds, zoom]);

  const placeById = useMemo(() => {
    return new Map(places.map((place) => [place.place_id, place]));
  }, [places]);

  useEffect(() => {
    if (!flyToPlaceId || !mapRef.current) return;
    const place = placeById.get(flyToPlaceId);
    if (!place) return;
    mapRef.current.flyTo({
      center: [place.lng, place.lat],
      zoom: Math.max(mapRef.current.getZoom(), 12),
      duration: 800,
    });
  }, [flyToPlaceId, placeById]);

  useEffect(() => {
    if (!cameraTarget || !mapRef.current) return;
    mapRef.current.flyTo({
      center: [cameraTarget.longitude, cameraTarget.latitude],
      zoom: cameraTarget.zoom,
      duration: 900,
    });
  }, [cameraTarget]);

  const zoomBy = (delta: number) => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    map.zoomTo(map.getZoom() + delta, { duration: 200 });
  };

  const locateMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((position) => {
      mapRef.current?.flyTo({
        center: [position.coords.longitude, position.coords.latitude],
        zoom: 11,
        duration: 900,
      });
    });
  };

  if (!mapboxToken) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#e8e4dc]">
        <div className="mx-6 max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
          <h3 className="text-lg font-semibold text-gray-900">Mapbox token required</h3>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            Add <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_MAPBOX_TOKEN</code> to{' '}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">frontend/.env.local</code> to enable the
            interactive map. The list and filters still work in mock mode.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <MapGL
        ref={mapRef}
        initialViewState={{ longitude: -98.5795, latitude: 39.8283, zoom: 3.4 }}
        mapStyle="mapbox://styles/mapbox/light-v11"
        mapboxAccessToken={mapboxToken}
        attributionControl
        style={{ width: '100%', height: '100%' }}
        onLoad={reportViewport}
        onMove={() => {
          const map = mapRef.current?.getMap();
          if (!map) return;
          const b = map.getBounds();
          if (!b) return;
          setBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
          setZoom(map.getZoom());
        }}
        onMoveEnd={reportViewport}
      >
        {clusters.map((feature) => {
          const [lng, lat] = feature.geometry.coordinates;
          const props = feature.properties as {
            cluster?: boolean;
            cluster_id?: number;
            point_count?: number;
            placeId?: string;
          };

          if (props.cluster && props.cluster_id != null) {
            return (
              <Marker key={`cluster-${props.cluster_id}`} longitude={lng} latitude={lat} anchor="bottom">
                <button
                  type="button"
                  className="cursor-pointer"
                  onClick={(event) => {
                    event.stopPropagation();
                    const expansion = clusterIndex.getClusterExpansionZoom(props.cluster_id!);
                    mapRef.current?.flyTo({
                      center: [lng, lat],
                      zoom: expansion,
                      duration: 500,
                    });
                  }}
                >
                  <Teardrop fill="#111111" count={props.point_count} />
                </button>
              </Marker>
            );
          }

          const place = props.placeId ? placeById.get(props.placeId) : undefined;
          if (!place) return null;
          const highlighted = selectedPlaceId === place.place_id || hoveredPlaceId === place.place_id;

          return (
            <Marker key={place.place_id} longitude={lng} latitude={lat} anchor="bottom">
              <button
                type="button"
                className="cursor-pointer"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectPlace(place.place_id);
                }}
                onMouseEnter={() => onHoverPlace(place.place_id)}
                onMouseLeave={() => onHoverPlace(null)}
                aria-label={place.place_name}
              >
                <Teardrop fill="#f97316" imageUrl={place.cover_image} highlighted={highlighted} />
              </button>
            </Marker>
          );
        })}
      </MapGL>

      <div className="absolute bottom-6 right-4 z-10 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => zoomBy(1)}
          className="h-10 w-10 rounded-full bg-white text-lg font-semibold text-gray-800 shadow-md ring-1 ring-black/10 hover:bg-gray-50"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoomBy(-1)}
          className="h-10 w-10 rounded-full bg-white text-lg font-semibold text-gray-800 shadow-md ring-1 ring-black/10 hover:bg-gray-50"
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          onClick={locateMe}
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
    </div>
  );
}
