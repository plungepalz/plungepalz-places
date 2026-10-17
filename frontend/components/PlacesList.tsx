'use client';

import { PlaceSearchResult } from '@/lib/types';
import PlaceCard from './PlaceCard';

interface PlacesListProps {
  places: PlaceSearchResult[];
  total: number;
  selectedPlaceId: string | null;
  onSelectPlace: (placeId: string) => void;
  onHoverPlace: (placeId: string | null) => void;
  onLoadMore?: () => void;
  hasMore: boolean;
  isLoading: boolean;
  locationName?: string;
}

export default function PlacesList({
  places,
  total,
  selectedPlaceId,
  onSelectPlace,
  onHoverPlace,
  onLoadMore,
  hasMore,
  isLoading,
  locationName = 'this area',
}: PlacesListProps) {
  return (
    <div className="h-full flex flex-col bg-white rounded-2xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">
          {total} {total === 1 ? 'place' : 'places'} in {locationName}
        </h2>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
        {isLoading && places.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
          </div>
        ) : places.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500">
            <svg
              className="w-12 h-12 mb-2 text-gray-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p>No places found</p>
          </div>
        ) : (
          places.map((place) => (
            <PlaceCard
              key={place.place_id}
              place={place}
              isSelected={selectedPlaceId === place.place_id}
              onSelect={() => onSelectPlace(place.place_id)}
              onHover={(hover) => onHoverPlace(hover ? place.place_id : null)}
            />
          ))
        )}

        {/* Load more button */}
        {hasMore && !isLoading && (
          <div className="py-4">
            <button
              onClick={onLoadMore}
              className="w-full px-4 py-2 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors"
            >
              Load more
            </button>
          </div>
        )}

        {isLoading && places.length > 0 && (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500"></div>
          </div>
        )}
      </div>
    </div>
  );
}
