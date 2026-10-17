'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import FilterBar from '@/components/FilterBar';
import PlacesList from '@/components/PlacesList';
import PlacesMap from '@/components/PlacesMap';
import PlaceDetailsPanel from '@/components/PlaceDetailsPanel';
import { client, isMockMode } from '@/lib/client';
import { PlaceSearchResult, ActivityType, PlaceType } from '@/lib/types';

export default function HomePage() {
  const [places, setPlaces] = useState<PlaceSearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedActivities, setSelectedActivities] = useState<ActivityType[]>([]);
  const [selectedPlaceTypes, setSelectedPlaceTypes] = useState<PlaceType[]>([]);
  const [approvedOnly, setApprovedOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null);
  const [detailsPlaceId, setDetailsPlaceId] = useState<string | null>(null);

  const [currentBounds, setCurrentBounds] = useState<{
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
  } | null>(null);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const viewportTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  const performSearch = useCallback(
    async (bounds: typeof currentBounds, pageNum: number = 0, append: boolean = false) => {
      setIsLoading(true);
      try {
        const params: {
          page: number;
          limit: number;
          q?: string;
          bbox?: string;
          activity_types?: string;
          place_type?: string;
          approved_only?: boolean;
        } = {
          page: pageNum,
          limit: 100,
        };

        if (searchQuery.trim()) {
          params.q = searchQuery.trim();
        }

        if (bounds) {
          params.bbox = `${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}`;
        }

        if (selectedActivities.length > 0) {
          params.activity_types = selectedActivities.join(',');
        }

        if (selectedPlaceTypes.length > 0) {
          params.place_type = selectedPlaceTypes.join(',');
        }

        if (approvedOnly) {
          params.approved_only = true;
        }

        const response = await client.search(params);

        if (append) {
          setPlaces((prev) => [...prev, ...response.places]);
        } else {
          setPlaces(response.places);
        }

        setTotal(response.total);
        setPage(response.page);
        setHasMore(response.has_more);
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [searchQuery, selectedActivities, selectedPlaceTypes, approvedOnly]
  );

  // Debounced search when filters change
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      if (currentBounds) {
        performSearch(currentBounds, 0, false);
      }
    }, 500);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, selectedActivities, selectedPlaceTypes, approvedOnly, performSearch, currentBounds]);

  // Debounced viewport change
  const handleViewportChange = useCallback(
    (bounds: { minLng: number; minLat: number; maxLng: number; maxLat: number }) => {
      if (viewportTimeoutRef.current) {
        clearTimeout(viewportTimeoutRef.current);
      }

      viewportTimeoutRef.current = setTimeout(() => {
        setCurrentBounds(bounds);
        performSearch(bounds, 0, false);
      }, 800);
    },
    [performSearch]
  );

  const handleActivityToggle = (activity: ActivityType) => {
    setSelectedActivities((prev) =>
      prev.includes(activity) ? prev.filter((a) => a !== activity) : [...prev, activity]
    );
  };

  const handlePlaceTypeToggle = (placeType: PlaceType) => {
    setSelectedPlaceTypes((prev) =>
      prev.includes(placeType) ? prev.filter((t) => t !== placeType) : [...prev, placeType]
    );
  };

  const handleLoadMore = () => {
    if (hasMore && !isLoading && currentBounds) {
      performSearch(currentBounds, page + 1, true);
    }
  };

  const handleSelectPlace = (placeId: string) => {
    setSelectedPlaceId(placeId);
    setDetailsPlaceId(placeId);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Mock mode banner */}
      {isMockMode && (
        <div className="bg-yellow-100 border-b border-yellow-200 px-4 py-2 text-center text-sm text-yellow-800">
          <strong>Mock Mode:</strong> Using mock data. Set NEXT_PUBLIC_API_BASE_URL in .env.local to use the real API.
        </div>
      )}

      {/* Filter bar */}
      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedActivities={selectedActivities}
        onActivityToggle={handleActivityToggle}
        selectedPlaceTypes={selectedPlaceTypes}
        onPlaceTypeToggle={handlePlaceTypeToggle}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters(!showFilters)}
        approvedOnly={approvedOnly}
        onApprovedOnlyToggle={() => setApprovedOnly(!approvedOnly)}
      />

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden" style={{ marginTop: showFilters ? '120px' : '72px' }}>
        {/* Left panel - Places list */}
        <div className="w-96 p-4 overflow-hidden">
          <PlacesList
            places={places}
            total={total}
            selectedPlaceId={selectedPlaceId}
            onSelectPlace={handleSelectPlace}
            onHoverPlace={setHoveredPlaceId}
            onLoadMore={handleLoadMore}
            hasMore={hasMore}
            isLoading={isLoading}
            locationName="the map"
          />
        </div>

        {/* Right panel - Map */}
        <div className="flex-1">
          <PlacesMap
            places={places}
            selectedPlaceId={selectedPlaceId}
            hoveredPlaceId={hoveredPlaceId}
            onSelectPlace={handleSelectPlace}
            onViewportChange={handleViewportChange}
            mapboxToken={mapboxToken}
          />
        </div>
      </div>

      {/* Details panel */}
      {detailsPlaceId && (
        <PlaceDetailsPanel placeId={detailsPlaceId} onClose={() => setDetailsPlaceId(null)} />
      )}
    </div>
  );
}
