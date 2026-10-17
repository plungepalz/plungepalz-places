'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FilterBar from '@/components/FilterBar';
import PlaceDetailsPanel from '@/components/PlaceDetailsPanel';
import PlacesList from '@/components/PlacesList';
import { client, isMockMode } from '@/lib/client';
import { isPlacesApiError } from '@/lib/errors';
import { LOCATION_PRESETS, type LocationPreset } from '@/lib/locations';
import type { ActivityType, MapBounds, PlaceSearchResult, PlaceType, SearchParams } from '@/lib/types';
import { formatBbox } from '@/lib/types';

const PlacesMap = dynamic(() => import('@/components/PlacesMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-[#e8e4dc]" />,
});

const PAGE_SIZE = 20;
const DEFAULT_LOCATION = LOCATION_PRESETS[1]; // United States

export default function HomePage() {
  const [places, setPlaces] = useState<PlaceSearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedActivities, setSelectedActivities] = useState<ActivityType[]>([]);
  const [selectedPlaceTypes, setSelectedPlaceTypes] = useState<PlaceType[]>([]);
  const [approvedOnly, setApprovedOnly] = useState(false);
  const [location, setLocation] = useState<LocationPreset>(DEFAULT_LOCATION);

  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null);
  const [detailsPlaceId, setDetailsPlaceId] = useState<string | null>(null);
  const [flyToPlaceId, setFlyToPlaceId] = useState<string | null>(null);
  const [cameraTarget, setCameraTarget] = useState<{
    longitude: number;
    latitude: number;
    zoom: number;
  } | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  const mapBoundsRef = useRef<MapBounds | null>(null);
  const requestIdRef = useRef(0);

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const hasMap = Boolean(mapboxToken);

  const buildParams = useCallback(
    (pageNum: number, bounds: MapBounds | null): SearchParams => {
      const params: SearchParams = { page: pageNum, limit: PAGE_SIZE };
      if (searchQuery.trim()) params.q = searchQuery.trim();
      if (selectedActivities.length > 0) params.activity_types = selectedActivities.join(',');
      if (selectedPlaceTypes.length > 0) params.place_type = selectedPlaceTypes.join(',');
      if (approvedOnly) params.approved_only = true;

      if (bounds) {
        params.bbox = formatBbox(bounds);
      } else if (location.id !== 'worldwide') {
        params.lat = location.lat;
        params.lng = location.lng;
        params.radius_km = location.radiusKm;
      }
      return params;
    },
    [searchQuery, selectedActivities, selectedPlaceTypes, approvedOnly, location]
  );

  const performSearch = useCallback(
    async (pageNum: number, append: boolean, bounds: MapBounds | null) => {
      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      try {
        const response = await client.search(buildParams(pageNum, bounds));
        if (requestId !== requestIdRef.current) return;
        setPlaces((prev) => (append ? [...prev, ...response.places] : response.places));
        setTotal(response.total);
        setPage(response.page);
        setHasMore(response.has_more);
        setError(null);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setError(isPlacesApiError(err) ? err.message : 'Search failed');
        if (!append) {
          setPlaces([]);
          setTotal(0);
          setHasMore(false);
        }
      } finally {
        if (requestId === requestIdRef.current) setIsLoading(false);
      }
    },
    [buildParams]
  );

  const handleViewportChange = useCallback((bounds: MapBounds) => {
    mapBoundsRef.current = bounds;
    setMapBounds(bounds);
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      performSearch(0, false, mapBounds);
    }, mapBounds ? 450 : 200);
    return () => window.clearTimeout(handle);
  }, [performSearch, mapBounds]);

  const handleLocationChange = (next: LocationPreset) => {
    setLocation(next);
    setCameraTarget({ longitude: next.lng, latitude: next.lat, zoom: next.zoom });
    if (!hasMap) {
      mapBoundsRef.current = null;
      setMapBounds(null);
    }
  };

  const handleSelectFromList = (placeId: string) => {
    setSelectedPlaceId(placeId);
    setDetailsPlaceId(placeId);
    setFlyToPlaceId(placeId);
  };

  const handleSelectFromMap = (placeId: string) => {
    setSelectedPlaceId(placeId);
    setDetailsPlaceId(placeId);
    setFlyToPlaceId(null);
  };

  const handleToggleFavorite = (placeId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(placeId)) next.delete(placeId);
      else next.add(placeId);
      return next;
    });
  };

  const locationName = useMemo(() => {
    if (!hasMap || !mapBounds) {
      return location.id === 'worldwide' ? 'the world' : location.label;
    }
    const counts = new Map<string, number>();
    for (const place of places) {
      const key = place.city || place.country;
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    let best = '';
    let bestCount = 0;
    for (const [key, count] of counts) {
      if (count > bestCount) {
        best = key;
        bestCount = count;
      }
    }
    if (bestCount >= 2) return best;
    return location.label === 'United States' ? 'this area' : location.label;
  }, [hasMap, mapBounds, places, location]);

  return (
    <div className="relative h-screen overflow-hidden bg-[#e8e4dc] text-gray-900">
      <div className="absolute inset-0">
        <PlacesMap
          places={places}
          selectedPlaceId={selectedPlaceId}
          hoveredPlaceId={hoveredPlaceId}
          flyToPlaceId={flyToPlaceId}
          cameraTarget={cameraTarget}
          onSelectPlace={handleSelectFromMap}
          onHoverPlace={setHoveredPlaceId}
          onViewportChange={handleViewportChange}
          mapboxToken={mapboxToken}
        />
      </div>

      <div className="pointer-events-none absolute inset-0 z-20">
        <div className="pointer-events-auto px-4 pt-4">
          <FilterBar
            location={location}
            onLocationChange={handleLocationChange}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedActivities={selectedActivities}
            onActivityToggle={(activity) =>
              setSelectedActivities((prev) =>
                prev.includes(activity) ? prev.filter((item) => item !== activity) : [...prev, activity]
              )
            }
            selectedPlaceTypes={selectedPlaceTypes}
            onPlaceTypeToggle={(placeType) =>
              setSelectedPlaceTypes((prev) =>
                prev.includes(placeType) ? prev.filter((item) => item !== placeType) : [...prev, placeType]
              )
            }
            approvedOnly={approvedOnly}
            onApprovedOnlyToggle={() => setApprovedOnly((prev) => !prev)}
            mockMode={isMockMode}
          />
        </div>

        <div className="pointer-events-auto absolute bottom-4 left-4 top-24 w-[min(100%-2rem,380px)]">
          <PlacesList
            places={places}
            total={total}
            selectedPlaceId={selectedPlaceId}
            favorites={favorites}
            onSelectPlace={handleSelectFromList}
            onHoverPlace={setHoveredPlaceId}
            onToggleFavorite={handleToggleFavorite}
            onLoadMore={() => performSearch(page + 1, true, mapBoundsRef.current)}
            hasMore={hasMore}
            isLoading={isLoading}
            locationName={locationName}
            error={error}
          />
        </div>
      </div>

      {detailsPlaceId && (
        <PlaceDetailsPanel placeId={detailsPlaceId} onClose={() => setDetailsPlaceId(null)} />
      )}
    </div>
  );
}
