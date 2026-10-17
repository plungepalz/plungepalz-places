'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Map, { Marker, NavigationControl, GeolocateControl } from 'react-map-gl/mapbox';
import type { MapRef, ViewStateChangeEvent } from 'react-map-gl/mapbox';
import { PlaceSearchResult } from '@/lib/types';
import 'mapbox-gl/dist/mapbox-gl.css';

interface PlacesMapProps {
  places: PlaceSearchResult[];
  selectedPlaceId: string | null;
  hoveredPlaceId: string | null;
  onSelectPlace: (placeId: string) => void;
  onViewportChange: (bounds: { minLng: number; minLat: number; maxLng: number; maxLat: number }) => void;
  mapboxToken?: string;
}

export default function PlacesMap({
  places,
  selectedPlaceId,
  hoveredPlaceId,
  onSelectPlace,
  onViewportChange,
  mapboxToken,
}: PlacesMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [viewState, setViewState] = useState({
    longitude: -98.5795,
    latitude: 39.8283,
    zoom: 4,
  });

  const handleMove = useCallback(
    (evt: ViewStateChangeEvent) => {
      setViewState(evt.viewState);

      // Debounce the viewport change callback
      if (mapRef.current) {
        const map = mapRef.current.getMap();
        const bounds = map.getBounds();
        onViewportChange({
          minLng: bounds.getWest(),
          minLat: bounds.getSouth(),
          maxLng: bounds.getEast(),
          maxLat: bounds.getNorth(),
        });
      }
    },
    [onViewportChange]
  );

  // Fly to selected place
  useEffect(() => {
    if (selectedPlaceId && mapRef.current) {
      const place = places.find((p) => p.place_id === selectedPlaceId);
      if (place) {
        mapRef.current.flyTo({
          center: [place.lng, place.lat],
          zoom: Math.max(viewState.zoom, 12),
          duration: 1000,
        });
      }
    }
  }, [selectedPlaceId, places, viewState.zoom]);

  if (!mapboxToken) {
    return (
      <div className="w-full h-full bg-gray-100 flex items-center justify-center">
        <div className="text-center p-8">
          <svg
            className="w-16 h-16 text-gray-400 mx-auto mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
            />
          </svg>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Mapbox Token Required</h3>
          <p className="text-gray-600 max-w-md">
            Add <code className="bg-gray-200 px-2 py-1 rounded text-sm">NEXT_PUBLIC_MAPBOX_TOKEN</code> to your{' '}
            <code className="bg-gray-200 px-2 py-1 rounded text-sm">.env.local</code> file to enable the map.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <Map
        ref={mapRef}
        {...viewState}
        onMove={handleMove}
        mapStyle="mapbox://styles/mapbox/light-v11"
        mapboxAccessToken={mapboxToken}
        attributionControl={false}
        style={{ width: '100%', height: '100%' }}
      >
        {/* Places markers */}
        {places.map((place) => {
          const isSelected = selectedPlaceId === place.place_id;
          const isHovered = hoveredPlaceId === place.place_id;
          const scale = isSelected || isHovered ? 1.2 : 1;

          return (
            <Marker
              key={place.place_id}
              longitude={place.lng}
              latitude={place.lat}
              anchor="bottom"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                onSelectPlace(place.place_id);
              }}
            >
              <div
                className="cursor-pointer transition-transform duration-200"
                style={{ transform: `scale(${scale})` }}
              >
                {/* Teardrop pin */}
                <svg
                  width="32"
                  height="40"
                  viewBox="0 0 32 40"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="drop-shadow-lg"
                >
                  <path
                    d="M16 0C7.163 0 0 7.163 0 16C0 24.837 16 40 16 40C16 40 32 24.837 32 16C32 7.163 24.837 0 16 0Z"
                    fill={isSelected || isHovered ? '#f97316' : place.is_approved ? '#fb923c' : '#fdba74'}
                  />
                  {place.cover_image ? (
                    <image
                      href={place.cover_image}
                      x="8"
                      y="6"
                      width="16"
                      height="16"
                      clipPath="circle(8px at center)"
                    />
                  ) : (
                    <circle cx="16" cy="14" r="6" fill="white" opacity="0.9" />
                  )}
                </svg>
                {/* Tooltip on hover */}
                {isHovered && (
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap pointer-events-none">
                    {place.place_name}
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                  </div>
                )}
              </div>
            </Marker>
          );
        })}

        {/* Map controls */}
        <NavigationControl position="bottom-right" style={{ marginBottom: '20px', marginRight: '20px' }} />
        <GeolocateControl
          position="bottom-right"
          style={{ marginBottom: '80px', marginRight: '20px' }}
          trackUserLocation
        />
      </Map>
    </div>
  );
}
