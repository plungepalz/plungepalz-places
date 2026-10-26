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
  shouldApplySettledSearch,
  shouldCommitSearchUi,
  startListHeadingRequest,
  type ListHeadingSnapshot,
} from '@/lib/list-heading-state';
import { listLocationName, locationChipLabel } from '@/lib/list-location-name';
import { LOCATION_PRESETS, type LocationPreset } from '@/lib/locations';
import {
  defaultCompactList,
  nextFlyNonce,
  shouldCollapseList,
  shouldReapplyNarrowWorldwide,
  shouldReapplyPresetOnSizeChange,
  type FlightEndKind,
  type SizeBox,
} from '@/lib/map-camera';
import {
  mergeLocalPlaces,
  nextPlaceListMountKey,
  placeListRegionKey,
  placesVisibleDuringFlight,
  reconcilePlacesById,
} from '@/lib/merge-local-places';
import {
  placesListMaxHeightPx,
  placesListSlotMaxHeightPx,
  scrollPlaceCardIntoView,
  syncMapHoveredCard,
} from '@/lib/map-style';
import { createPlaceHoverController } from '@/lib/place-hover';
import {
  lastKeyAfterLeavingPreset,
  rememberSettleKeyOnDispatch,
  searchAfterViewportChange,
  searchDebounceMs,
  viewportSearchIdentity,
} from '@/lib/search-debounce';
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
  const [detailsPlaceId, setDetailsPlaceId] = useState<string | null>(null);
  const [addPlaceOpen, setAddPlaceOpen] = useState(false);
  const [draftLocation, setDraftLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [draftNonce, setDraftNonce] = useState(0);
  const [mapCenterRequest, setMapCenterRequest] = useState<number | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [flyRequest, setFlyRequest] = useState<FlyRequest | null>(null);
  const [mapCameraBusy, setMapCameraBusy] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  const [mapZoom, setMapZoom] = useState<number | null>(null);
  const [leftPreset, setLeftPreset] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(1280);
  const [viewportHeight, setViewportHeight] = useState(900);
  const mapBoundsRef = useRef<MapBounds | null>(null);
  const lastPresetBoundsKeyRef = useRef('');
  const gestureSearchPendingRef = useRef(false);
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
  const flyNonceRef = useRef(0);
  const prevViewportRef = useRef<SizeBox | null>(null);
  const cameraBusyRef = useRef(false);
  const pendingSearchRef = useRef<{
    requestId: number;
    append: boolean;
    places: PlaceSearchResult[];
    total: number;
    page: number;
    hasMore: boolean;
    heading: ListHeadingSnapshot | null;
    error: string | null;
  } | null>(null);

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

  const merged = useMemo(
    () => mergeLocalPlaces(serverPlaces, localPlaces, localFilters),
    [serverPlaces, localPlaces, localFilters]
  );
  const extraCount = merged.extraCount;
  const [placeStore, setPlaceStore] = useState({ src: merged, places: merged.places });
  if (placeStore.src !== merged) {
    setPlaceStore({ src: merged, places: reconcilePlacesById(placeStore.places, merged.places) });
  }
  const places = placeStore.src === merged ? placeStore.places : reconcilePlacesById(placeStore.places, merged.places);
  const cameraBusy = hasMap && (Boolean(flyRequest) || mapCameraBusy);
  useEffect(() => {
    cameraBusyRef.current = cameraBusy;
  }, [cameraBusy]);
  const [heldList, setHeldList] = useState<PlaceSearchResult[] | null>(null);
  const [listMountKey, setListMountKey] = useState('0');
  const listMountKeyRef = useRef('0');
  const listRegionKeyRef = useRef(placeListRegionKey(false, DEFAULT_LOCATION.id));
  const listView = placesVisibleDuringFlight(places, heldList, cameraBusy, isLoading);
  if (heldList !== listView.hold) {
    setHeldList(listView.hold);
  }
  const listPlaces = listView.visible;
  const displayTotal = total + extraCount;
  const [hoverCtrl] = useState(createPlaceHoverController);

  useEffect(() => () => hoverCtrl.dispose(), [hoverCtrl]);

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
        const commit = {
          requestId,
          append,
          places: response.places,
          total: response.total,
          page: response.page,
          hasMore: response.has_more,
          heading: settled.heading,
          error: null as string | null,
        };
        if (
          !shouldCommitSearchUi({
            requestId,
            machine: headingMachineRef.current,
            cameraBusy: cameraBusyRef.current,
          })
        ) {
          if (shouldApplySettledSearch(requestId, headingMachineRef.current)) {
            pendingSearchRef.current = commit;
          }
          return;
        }
        pendingSearchRef.current = null;
        const regionKey = placeListRegionKey(context.leftPreset, context.location.id);
        const nextMount = nextPlaceListMountKey({
          prevKey: listMountKeyRef.current,
          prevRegionKey: listRegionKeyRef.current,
          requestId,
          regionKey,
          append,
        });
        listRegionKeyRef.current = regionKey;
        if (nextMount !== listMountKeyRef.current) {
          listMountKeyRef.current = nextMount;
          setListMountKey(nextMount);
        }
        const returnedIds = new Set(response.places.map((place) => place.place_id));
        setLocalPlaces((prev) => prev.filter((place) => !returnedIds.has(place.place_id)));
        setServerPlaces((prev) => (append ? [...prev, ...response.places] : response.places));
        setTotal(response.total);
        setPage(response.page);
        setHasMore(response.has_more);
        setHeading(settled.heading);
        setError(null);
        setIsLoading(false);
      } catch (err) {
        if (!shouldApplySettledSearch(requestId, headingMachineRef.current)) return;
        const message = isPlacesApiError(err) ? err.message : 'Search failed';
        if (cameraBusyRef.current) {
          pendingSearchRef.current = {
            requestId,
            append,
            places: [],
            total: 0,
            page: 0,
            hasMore: false,
            heading: headingMachineRef.current.heading,
            error: message,
          };
          return;
        }
        setError(message);
        setIsLoading(false);
      }
    },
    [buildParams]
  );

  const handleViewportChange = useCallback((bounds: MapBounds, zoom: number) => {
    gestureSearchPendingRef.current = false;
    mapBoundsRef.current = bounds;
    setMapBounds(bounds);
    setMapZoom(zoom);
  }, []);

  const filterKey = `${searchQuery.trim()}|${selectedActivities.join(',')}|${selectedPlaceTypes.join(',')}|${approvedOnly}`;
  const searchIdentity = viewportSearchIdentity(
    leftPreset,
    mapBoundsKey(mapBounds),
    location.id,
    filterKey
  );

  useEffect(() => {
    if (!cameraBusy) {
      const pending = pendingSearchRef.current;
      if (pending) {
        pendingSearchRef.current = null;
        if (
          shouldCommitSearchUi({
            requestId: pending.requestId,
            machine: headingMachineRef.current,
            cameraBusy: false,
          })
        ) {
          if (pending.error) {
            setError(pending.error);
          } else {
            const ctx = searchContextRef.current;
            const regionKey = placeListRegionKey(ctx.leftPreset, ctx.location.id);
            const nextMount = nextPlaceListMountKey({
              prevKey: listMountKeyRef.current,
              prevRegionKey: listRegionKeyRef.current,
              requestId: pending.requestId,
              regionKey,
              append: pending.append,
            });
            listRegionKeyRef.current = regionKey;
            if (nextMount !== listMountKeyRef.current) {
              listMountKeyRef.current = nextMount;
              setListMountKey(nextMount);
            }
            const returnedIds = new Set(pending.places.map((place) => place.place_id));
            setLocalPlaces((prev) => prev.filter((place) => !returnedIds.has(place.place_id)));
            setServerPlaces((prev) => (pending.append ? [...prev, ...pending.places] : pending.places));
            setTotal(pending.total);
            setPage(pending.page);
            setHasMore(pending.hasMore);
            setHeading(pending.heading);
            setError(null);
          }
          setIsLoading(false);
        }
      }
    }
    const bounds = mapBoundsRef.current;
    const decision = searchAfterViewportChange({
      leftPreset,
      boundsKey: mapBoundsKey(leftPreset ? bounds : null),
      lastPresetKey: lastPresetBoundsKeyRef.current,
      cameraBusy,
      gestureInProgress: gestureSearchPendingRef.current,
      settleKey: searchIdentity,
      forceSettle:
        headingMachineRef.current.heading == null && lastPresetBoundsKeyRef.current === '',
    });
    if (decision.action === 'skip') return;
    const handle = window.setTimeout(() => {
      lastPresetBoundsKeyRef.current = rememberSettleKeyOnDispatch(
        lastPresetBoundsKeyRef.current,
        decision,
        true
      );
      performSearch(0, false, decision.action === 'moveend' ? bounds : null);
    }, searchDebounceMs(decision.action));
    return () => window.clearTimeout(handle);
  }, [cameraBusy, flyRequest, mapCameraBusy, performSearch, leftPreset, searchIdentity]);

  useEffect(() => {
    if (!successMessage) return;
    const handle = window.setTimeout(() => setSuccessMessage(null), SUCCESS_TOAST_MS);
    return () => window.clearTimeout(handle);
  }, [successMessage]);

  const handleLocationChange = (next: LocationPreset) => {
    headingMachineRef.current = startListHeadingRequest(headingMachineRef.current);
    lastPresetBoundsKeyRef.current = '';
    pendingSearchRef.current = null;
    setDetailsPlaceId(null);
    setAddPlaceOpen(false);
    setSelectedPlaceId(null);
    setLeftPreset(false);
    setListExpanded(false);
    setLocation(next);
    setMapZoom(next.zoom);
    setFlyRequest({
      nonce: (flyNonceRef.current = nextFlyNonce(flyNonceRef.current)),
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

  const handleSelectFromList = useCallback((placeId: string) => {
    const place = places.find((item) => item.place_id === placeId);
    setSelectedPlaceId(placeId);
    setDetailsPlaceId(placeId);
    setAddPlaceOpen(false);
    if (place) {
      setLeftPreset(true);
      setFlyRequest({ nonce: (flyNonceRef.current = nextFlyNonce(flyNonceRef.current)), longitude: place.lng, latitude: place.lat, zoom: 12 });
    }
  }, [places]);

  const handleSelectFromMap = useCallback((placeId: string) => {
    const place = places.find((item) => item.place_id === placeId);
    setSelectedPlaceId(placeId);
    setDetailsPlaceId(placeId);
    setAddPlaceOpen(false);
    if (place) {
      setFlyRequest({
        nonce: (flyNonceRef.current = nextFlyNonce(flyNonceRef.current)),
        longitude: place.lng,
        latitude: place.lat,
        ease: true,
        keepZoom: true,
      });
    }
  }, [places]);

  const handleFlyComplete = useCallback((
    nonce?: number,
    kind?: FlightEndKind,
    info?: { gestureSearchPending?: boolean }
  ) => {
    setFlyRequest((current) => {
      if (!current) return null;
      if (nonce != null && current.nonce !== nonce) return current;
      return null;
    });
    if (kind === 'user-interrupt') {
      headingMachineRef.current = startListHeadingRequest(headingMachineRef.current);
      pendingSearchRef.current = null;
      const pending = Boolean(info?.gestureSearchPending);
      gestureSearchPendingRef.current = pending;
      lastPresetBoundsKeyRef.current = lastKeyAfterLeavingPreset({
        boundsKey: mapBoundsKey(mapBoundsRef.current),
        gestureSearchPending: pending,
      });
      setLeftPreset(true);
      setHeading((prev) =>
        prev
          ? {
              ...prev,
              chipLabel: locationChipLabel(locationRef.current, true),
              locationName: listLocationName({ location: locationRef.current, leftPreset: true }),
            }
          : prev
      );
    }
  }, []);

  const handleUserCameraMove = useCallback((info?: { gestureSearchPending?: boolean }) => {
    const pending = Boolean(info?.gestureSearchPending);
    gestureSearchPendingRef.current = pending;
    lastPresetBoundsKeyRef.current = lastKeyAfterLeavingPreset({
      boundsKey: mapBoundsKey(mapBoundsRef.current),
      gestureSearchPending: pending,
    });
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
    setFlyRequest({ nonce: (flyNonceRef.current = nextFlyNonce(flyNonceRef.current)), longitude: place.lng, latitude: place.lat, zoom: 12 });
    setSuccessMessage('Place submitted. It is pending review and is not approved yet.');
  };

  const handleToggleFavorite = useCallback((placeId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(placeId)) next.delete(placeId);
      else next.add(placeId);
      return next;
    });
  }, []);

  const handleCardHover = useCallback((placeId: string | null) => {
    hoverCtrl.setHover(placeId, 'card');
  }, [hoverCtrl]);

  const handlePinHover = useCallback((placeId: string | null) => {
    hoverCtrl.setHover(placeId, 'pin');
  }, [hoverCtrl]);

  const bindMapHover = useCallback(
    (apply: (placeId: string | null) => void) => hoverCtrl.bindFeatureState(apply),
    [hoverCtrl]
  );

  useEffect(() => {
    const unHighlight = hoverCtrl.bindCardHighlight((placeId) => {
      syncMapHoveredCard(listSlotRef.current, placeId);
    });
    const unScroll = hoverCtrl.bindPinScroll((placeId) => {
      const root = listSlotRef.current;
      scrollPlaceCardIntoView(
        placeId,
        root?.querySelector<HTMLElement>('#places-list-body') ?? null,
        root?.querySelector<HTMLElement>('[data-list-header]') ?? null
      );
    });
    return () => {
      unHighlight();
      unScroll();
    };
  }, [hoverCtrl]);

  useEffect(() => {
    if (!selectedPlaceId) return;
    const root = listSlotRef.current;
    scrollPlaceCardIntoView(
      selectedPlaceId,
      root?.querySelector<HTMLElement>('#places-list-body') ?? null,
      root?.querySelector<HTMLElement>('[data-list-header]') ?? null
    );
  }, [selectedPlaceId]);

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
      setViewportHeight(next.height);
      const loc = locationRef.current;
      const left = leftPresetRef.current;
      if (
        shouldReapplyPresetOnSizeChange(left, prevViewportRef.current, next) ||
        shouldReapplyNarrowWorldwide(left, loc.id, prevViewportRef.current, next)
      ) {
        setFlyRequest({
          nonce: (flyNonceRef.current = nextFlyNonce(flyNonceRef.current)),
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
          bindHover={bindMapHover}
          flyRequest={flyRequest}
          onFlyComplete={handleFlyComplete}
          panelOpen={panelOpen}
          locationPickMode={addPlaceOpen}
          draftLocation={draftLocation}
          onPickLocation={applyMapLocation}
          mapCenterRequest={mapCenterRequest}
          onMapCenter={applyMapLocation}
          onSelectPlace={handleSelectFromMap}
          onHoverPlace={handlePinHover}
          onViewportChange={handleViewportChange}
          onUserCameraMove={handleUserCameraMove}
          onCameraBusy={setMapCameraBusy}
          hintTop={pinHintTop}
          mapboxToken={mapboxToken}
          collapseList={collapseList}
          fitTop={fitTop}
          viewportWidth={viewportWidth}
          viewportHeight={viewportHeight}
          location={location}
          leftPreset={leftPreset}
        />
      </div>

      <div className="pointer-events-none absolute inset-0 z-20">
        <div
          ref={listSlotRef}
          data-places-list-slot
          className={`places-list-slot absolute left-4 w-[min(100%-2rem,380px)] overflow-hidden ${
            hideListForDrawer ? 'hidden' : 'pointer-events-auto'
          } ${listCollapsed ? '' : 'bottom-4'}`}
          style={{
            top: chromeTop,
            maxHeight: placesListSlotMaxHeightPx(viewportHeight, chromeTop),
            ['--places-list-max' as string]: `${placesListMaxHeightPx(viewportHeight, chromeTop)}px`,
          }}
          aria-hidden={hideListForDrawer}
        >
          <PlacesList
            listKey={listMountKey}
            places={listPlaces}
            total={displayTotal}
            selectedPlaceId={selectedPlaceId}
            favorites={favorites}
            onSelectPlace={handleSelectFromList}
            onHoverPlace={handleCardHover}
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
