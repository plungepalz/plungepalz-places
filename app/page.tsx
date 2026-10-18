'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import AddPlacePanel from '@/components/AddPlacePanel';
import FilterBar from '@/components/FilterBar';
import PlaceDetailsPanel from '@/components/PlaceDetailsPanel';
import PlacesList from '@/components/PlacesList';
import { client, isMockMode } from '@/lib/client';
import { isPlacesApiError } from '@/lib/errors';
import {
  createListHeadingMachine,
  headingZoomForSearch,
  listHeadingText,
  mapBoundsKey,
  settleListHeadingRequest,
  startListHeadingRequest,
  type ListHeadingSnapshot,
} from '@/lib/list-heading-state';
import { LOCATION_PRESETS, type LocationPreset } from '@/lib/locations';
import {
  defaultCompactList,
  shouldCollapseList,
  shouldReapplyPresetOnSizeChange,
  type SizeBox,
} from '@/lib/map-camera';
import { mergeLocalPlaces } from '@/lib/merge-local-places';
import type { ActivityType, FlyRequest, MapBounds, PlaceSearchResult, PlaceType, SearchParams } from '@/lib/types';
import { resolveMapboxToken } from '@/lib/mapbox-token';
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
  const [mapZoom, setMapZoom] = useState<number | null>(null);
  const [leftPreset, setLeftPreset] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(1280);
  const mapBoundsRef = useRef<MapBounds | null>(null);
  const lastPresetBoundsKeyRef = useRef('');
  const headingMachineRef = useRef(createListHeadingMachine());
  const searchContextRef = useRef({
    hasMap: false,
    location: DEFAULT_LOCATION,
    leftPreset: false,
    mapZoom: null as number | null,
  });
  const [heading, setHeading] = useState<ListHeadingSnapshot | null>(null);
  const filterSlotRef = useRef<HTMLDivElement>(null);
  const [chromeTop, setChromeTop] = useState(96);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [listExpanded, setListExpanded] = useState(false);
  const listSlotRef = useRef<HTMLDivElement>(null);
  const [compactBarHeight, setCompactBarHeight] = useState(56);
  const leftPresetRef = useRef(leftPreset);
  const locationRef = useRef(location);
  const prevViewportRef = useRef<SizeBox | null>(null);

  const mapboxToken = resolveMapboxToken(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);
  const hasMap = Boolean(mapboxToken);

  useEffect(() => {
    searchContextRef.current = { hasMap, location, leftPreset, mapZoom };
    leftPresetRef.current = leftPreset;
    locationRef.current = location;
  }, [hasMap, location, leftPreset, mapZoom]);

  const localFilters = useMemo(
    () => ({
      q: searchQuery.trim() || undefined,
      bounds: mapBounds,
      placeTypes: selectedPlaceTypes,
      activityTypes: selectedActivities,
      approvedOnly,
    }),
    [searchQuery, mapBounds, selectedPlaceTypes, selectedActivities, approvedOnly]
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
      const started = startListHeadingRequest(headingMachineRef.current);
      headingMachineRef.current = started;
      const requestId = started.requestId;
      const context = {
        hasMap: searchContextRef.current.hasMap,
        location: searchContextRef.current.location,
        leftPreset: searchContextRef.current.leftPreset,
        zoom: headingZoomForSearch(
          searchContextRef.current.leftPreset,
          searchContextRef.current.mapZoom,
          searchContextRef.current.location
        ),
      };
      setIsLoading(true);
      try {
        const response = await client.search(buildParams(pageNum, bounds));
        const settled = settleListHeadingRequest(
          headingMachineRef.current,
          requestId,
          {
            shown: response.places.length,
            total: response.total,
            hasMore: response.has_more,
            places: response.places,
          },
          context
        );
        headingMachineRef.current = settled;
        if (settled.pending) return;
        const returnedIds = new Set(response.places.map((place) => place.place_id));
        setLocalPlaces((prev) => prev.filter((place) => !returnedIds.has(place.place_id)));
        setServerPlaces((prev) => (append ? [...prev, ...response.places] : response.places));
        setTotal(response.total);
        setPage(response.page);
        setHasMore(response.has_more);
        setHeading(settled.heading);
        setError(null);
      } catch (err) {
        if (requestId !== headingMachineRef.current.requestId) return;
        setError(isPlacesApiError(err) ? err.message : 'Search failed');
        if (!append) {
          setServerPlaces([]);
          setTotal(0);
          setHasMore(false);
        }
      } finally {
        if (requestId === headingMachineRef.current.requestId) setIsLoading(false);
      }
    },
    [buildParams]
  );

  const handleViewportChange = useCallback((bounds: MapBounds, zoom: number) => {
    mapBoundsRef.current = bounds;
    setMapBounds(bounds);
    setMapZoom(zoom);
  }, []);

  useEffect(() => {
    if (!leftPreset) {
      lastPresetBoundsKeyRef.current = mapBoundsKey(mapBounds);
      const handle = window.setTimeout(() => {
        performSearch(0, false, null);
      }, 200);
      return () => window.clearTimeout(handle);
    }
    const key = mapBoundsKey(mapBounds);
    if (!key || key === lastPresetBoundsKeyRef.current) return;
    const handle = window.setTimeout(() => {
      performSearch(0, false, mapBounds);
    }, 450);
    return () => window.clearTimeout(handle);
  }, [performSearch, leftPreset, mapBounds]);

  useEffect(() => {
    if (!successMessage) return;
    const handle = window.setTimeout(() => setSuccessMessage(null), SUCCESS_TOAST_MS);
    return () => window.clearTimeout(handle);
  }, [successMessage]);

  const handleLocationChange = (next: LocationPreset) => {
    setDetailsPlaceId(null);
    setAddPlaceOpen(false);
    setSelectedPlaceId(null);
    setLeftPreset(false);
    setListExpanded(false);
    setLocation(next);
    setMapZoom(next.zoom);
    setFlyRequest({
      nonce: Date.now(),
      longitude: next.lng,
      latitude: next.lat,
      zoom: next.zoom,
      exactZoom: true,
    });
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
      setLeftPreset(true);
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

  const handleUserCameraMove = useCallback(() => {
    setLeftPreset(true);
  }, []);

  const handleCloseDetails = useCallback(() => {
    setDetailsPlaceId(null);
    setSelectedPlaceId(null);
  }, []);

  const handleCloseAddPlace = useCallback(() => {
    setAddPlaceOpen(false);
    setDraftLocation(null);
  }, []);

  const handleOpenAddPlace = () => {
    setDetailsPlaceId(null);
    setSelectedPlaceId(null);
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
    setLeftPreset(true);
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

  const headingText = listHeadingText(heading, extraCount);
  const chipLabel = heading?.chipLabel ?? location.label;
  const locationName = heading?.locationName ?? (location.id === 'worldwide' ? 'the world' : location.label);

  const panelOpen = Boolean(detailsPlaceId) || addPlaceOpen;
  const narrowViewport = defaultCompactList(viewportWidth);
  const hideListForDrawer = shouldCollapseList(viewportWidth, panelOpen);
  const listCollapsed = narrowViewport && !listExpanded;
  const collapseList = hideListForDrawer || listCollapsed;
  const compactChrome = listCollapsed && !hideListForDrawer;
  const fitTop = compactChrome ? chromeTop + compactBarHeight : 0;
  const pinHintTop = compactChrome ? chromeTop + compactBarHeight + 8 : chromeTop;

  useLayoutEffect(() => {
    const onResize = () => {
      const next = { width: window.innerWidth, height: window.innerHeight };
      setViewportWidth(next.width);
      if (shouldReapplyPresetOnSizeChange(leftPresetRef.current, prevViewportRef.current, next)) {
        const loc = locationRef.current;
        setFlyRequest({
          nonce: Date.now(),
          longitude: loc.lng,
          latitude: loc.lat,
          zoom: loc.zoom,
          exactZoom: true,
          programmatic: true,
        });
      }
      prevViewportRef.current = next;
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useLayoutEffect(() => {
    const el = listSlotRef.current;
    if (!el || !listCollapsed) return;
    const update = () => setCompactBarHeight(Math.ceil(el.getBoundingClientRect().height));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [listCollapsed, headingText, filtersOpen]);

  useLayoutEffect(() => {
    const slot = filterSlotRef.current;
    if (!slot) return;
    const update = () => {
      const bar =
        (slot.querySelector('[data-filter-chrome]') as HTMLElement | null) ??
        (slot.firstElementChild as HTMLElement | null);
      const bottom = bar?.getBoundingClientRect().bottom ?? 96;
      setChromeTop(Math.ceil(bottom + 8));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(slot);
    const bar = slot.querySelector('[data-filter-chrome]') ?? slot.firstElementChild;
    if (bar) observer.observe(bar);
    return () => observer.disconnect();
  }, []);

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
          onUserCameraMove={handleUserCameraMove}
          hintTop={pinHintTop}
          mapboxToken={mapboxToken}
          collapseList={collapseList}
          fitTop={fitTop}
          leftPreset={leftPreset}
          location={location}
        />
      </div>

      <div className="pointer-events-none absolute inset-0 z-20">
        <div
          ref={listSlotRef}
          data-places-list-slot
          className={`absolute left-4 w-[min(100%-2rem,380px)] ${
            hideListForDrawer ? 'hidden' : 'pointer-events-auto'
          } ${listCollapsed ? '' : 'bottom-4'}`}
          style={{ top: chromeTop, transition: 'top 200ms ease' }}
          aria-hidden={hideListForDrawer}
        >
          <PlacesList
            places={places}
            total={displayTotal}
            selectedPlaceId={selectedPlaceId}
            hoveredPlaceId={hoveredPlaceId}
            favorites={favorites}
            onSelectPlace={handleSelectFromList}
            onHoverPlace={setHoveredPlaceId}
            onToggleFavorite={handleToggleFavorite}
            onLoadMore={() =>
              performSearch(page + 1, true, leftPreset ? mapBoundsRef.current : null)
            }
            hasMore={hasMore}
            isLoading={isLoading}
            locationName={locationName}
            heading={headingText}
            collapsible={narrowViewport}
            expanded={!listCollapsed}
            onToggleExpanded={() => setListExpanded((open) => !open)}
            error={error}
            filterHeaderInset={filtersOpen}
          />
        </div>
      </div>

      {/* Above the list (z-20). Overlay is none; only the visible bar captures clicks. */}
      <div ref={filterSlotRef} className="pointer-events-none absolute inset-0 z-40 px-4 pt-4">
        <FilterBar
          location={location}
          locationLabel={chipLabel}
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
          onFiltersOpenChange={setFiltersOpen}
        />
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
          offsetTop={chromeTop}
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
        <PlaceDetailsPanel
          offsetTop={chromeTop}
          placeId={detailsPlaceId}
          onClose={handleCloseDetails}
        />
      )}
    </div>
  );
}
