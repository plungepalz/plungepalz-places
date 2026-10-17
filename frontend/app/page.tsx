'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AddPlacePanel from '@/components/AddPlacePanel';
import FilterBar from '@/components/FilterBar';
import PlaceDetailsPanel from '@/components/PlaceDetailsPanel';
import PlacesList from '@/components/PlacesList';
import { client, isMockMode } from '@/lib/client';
import { isPlacesApiError } from '@/lib/errors';
import { LOCATION_PRESETS, type LocationPreset } from '@/lib/locations';
import { mergeLocalPlaces } from '@/lib/merge-local-places';
import type { ActivityType, FlyRequest, MapBounds, PlaceSearchResult, PlaceType, SearchParams } from '@/lib/types';
import { formatBbox, wrapLng } from '@/lib/types';

const PlacesMap = dynamic(() => import('@/components/PlacesMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-[#e8e4dc]" />,
});

/** API max. Mapbox clustering only sees this page of /search results (known MVP limit). */
const SEARCH_LIMIT = 500;
const DEFAULT_LOCATION = LOCATION_PRESETS[1]; // United States
const SUCCESS_TOAST_MS = 4500;

export default function HomePage() {
  const [serverPlaces, setServerPlaces] = useState<PlaceSearchResult[]>([]);
  const [localPlaces, setLocalPlaces] = useState<PlaceSearchResult[]>([]);
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
  const [addPlaceOpen, setAddPlaceOpen] = useState(false);
  const [draftLocation, setDraftLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [draftNonce, setDraftNonce] = useState(0);
  const [mapCenterRequest, setMapCenterRequest] = useState<number | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [flyRequest, setFlyRequest] = useState<FlyRequest | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  const mapBoundsRef = useRef<MapBounds | null>(null);
  const requestIdRef = useRef(0);

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const hasMap = Boolean(mapboxToken);

  const localFilters = useMemo(
    () => ({
      q: searchQuery.trim() || undefined,
      bounds: mapBounds,
      placeTypes: selectedPlaceTypes,
      activityTypes: selectedActivities,
    }),
    [searchQuery, mapBounds, selectedPlaceTypes, selectedActivities]
  );

  const { places, extraCount } = useMemo(
    () => mergeLocalPlaces(serverPlaces, localPlaces, localFilters),
    [serverPlaces, localPlaces, localFilters]
  );
  const displayTotal = total + extraCount;

  const buildParams = useCallback(
    (pageNum: number, bounds: MapBounds | null): SearchParams => {
      const params: SearchParams = { page: pageNum, limit: SEARCH_LIMIT };
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
        const returnedIds = new Set(response.places.map((place) => place.place_id));
        setLocalPlaces((prev) => prev.filter((place) => !returnedIds.has(place.place_id)));
        setServerPlaces((prev) => (append ? [...prev, ...response.places] : response.places));
        setTotal(response.total);
        setPage(response.page);
        setHasMore(response.has_more);
        setError(null);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setError(isPlacesApiError(err) ? err.message : 'Search failed');
        if (!append) {
          setServerPlaces([]);
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

  useEffect(() => {
    if (!successMessage) return;
    const handle = window.setTimeout(() => setSuccessMessage(null), SUCCESS_TOAST_MS);
    return () => window.clearTimeout(handle);
  }, [successMessage]);

  const handleLocationChange = (next: LocationPreset) => {
    setLocation(next);
    setFlyRequest({ nonce: Date.now(), longitude: next.lng, latitude: next.lat, zoom: next.zoom });
    if (!hasMap) {
      mapBoundsRef.current = null;
      setMapBounds(null);
    }
  };

  const handleSelectFromList = (placeId: string) => {
    const place = places.find((item) => item.place_id === placeId);
    setSelectedPlaceId(placeId);
    setDetailsPlaceId(placeId);
    setAddPlaceOpen(false);
    if (place) {
      setFlyRequest({ nonce: Date.now(), longitude: place.lng, latitude: place.lat, zoom: 12 });
    }
  };

  const handleSelectFromMap = (placeId: string) => {
    setSelectedPlaceId(placeId);
    setDetailsPlaceId(placeId);
    setAddPlaceOpen(false);
  };

  const handleFlyComplete = useCallback(() => {
    setFlyRequest(null);
  }, []);

  const handleCloseDetails = useCallback(() => {
    setDetailsPlaceId(null);
  }, []);

  const handleCloseAddPlace = useCallback(() => {
    setAddPlaceOpen(false);
    setDraftLocation(null);
  }, []);

  const handleOpenAddPlace = () => {
    setDetailsPlaceId(null);
    setAddPlaceOpen(true);
  };

  const applyMapLocation = useCallback((center: { lat: number; lng: number }) => {
    setDraftLocation({ lat: center.lat, lng: wrapLng(center.lng) });
    setDraftNonce((nonce) => nonce + 1);
  }, []);

  const handleUseMapCenter = () => {
    setMapCenterRequest(Date.now());
  };

  const handlePlaceSubmitted = (place: PlaceSearchResult) => {
    setLocalPlaces((prev) => {
      if (prev.some((item) => item.place_id === place.place_id)) return prev;
      return [...prev, place];
    });
    setAddPlaceOpen(false);
    setDraftLocation(null);
    setSelectedPlaceId(place.place_id);
    setDetailsPlaceId(place.place_id);
    setFlyRequest({ nonce: Date.now(), longitude: place.lng, latitude: place.lat, zoom: 12 });
    setSuccessMessage('Place submitted. It is pending review and is not approved yet.');
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

  const panelOpen = Boolean(detailsPlaceId) || addPlaceOpen;

  return (
    <div className="relative h-screen overflow-hidden bg-[#e8e4dc] text-gray-900">
      <div className="absolute inset-0">
        <PlacesMap
          places={places}
          selectedPlaceId={selectedPlaceId}
          hoveredPlaceId={hoveredPlaceId}
          flyRequest={flyRequest}
          onFlyComplete={handleFlyComplete}
          panelOpen={panelOpen}
          locationPickMode={addPlaceOpen}
          draftLocation={draftLocation}
          onPickLocation={applyMapLocation}
          mapCenterRequest={mapCenterRequest}
          onMapCenter={applyMapLocation}
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
            onAddPlace={handleOpenAddPlace}
          />
        </div>

        <div className="pointer-events-auto absolute bottom-4 left-4 top-24 w-[min(100%-2rem,380px)]">
          <PlacesList
            places={places}
            total={displayTotal}
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

      {successMessage && (
        <div
          role="status"
          aria-live="polite"
          className="absolute left-1/2 top-24 z-40 max-w-sm -translate-x-1/2 rounded-2xl bg-gray-900 px-4 py-3 text-center text-sm text-white shadow-lg"
        >
          {successMessage}
        </div>
      )}

      {addPlaceOpen && (
        <AddPlacePanel
          onClose={handleCloseAddPlace}
          onSubmitted={handlePlaceSubmitted}
          mapboxToken={mapboxToken}
          hasMap={hasMap}
          locationLabel={location.label}
          fallbackCenter={{ lat: location.lat, lng: location.lng }}
          onUseMapCenter={handleUseMapCenter}
          draftLocation={draftLocation}
          draftNonce={draftNonce}
          onDraftLocationChange={setDraftLocation}
        />
      )}

      {detailsPlaceId && !addPlaceOpen && (
        <PlaceDetailsPanel placeId={detailsPlaceId} onClose={handleCloseDetails} />
      )}
    </div>
  );
}
