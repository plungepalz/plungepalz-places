'use client';

import type { PlaceSearchResult } from '@/lib/types';
import PlaceCard from './PlaceCard';

interface PlacesListProps {
  places: PlaceSearchResult[];
  total: number;
  selectedPlaceId: string | null;
  favorites: Set<string>;
  onSelectPlace: (placeId: string) => void;
  onHoverPlace: (placeId: string | null) => void;
  onToggleFavorite: (placeId: string) => void;
  onLoadMore?: () => void;
  hasMore: boolean;
  isLoading: boolean;
  locationName: string;
  error: string | null;
}

export default function PlacesList({
  places,
  total,
  selectedPlaceId,
  favorites,
  onSelectPlace,
  onHoverPlace,
  onToggleFavorite,
  onLoadMore,
  hasMore,
  isLoading,
  locationName,
  error,
}: PlacesListProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-[0_12px_40px_rgba(0,0,0,0.14)] ring-1 ring-black/5">
      <div className="border-b border-gray-100 px-4 py-3">
        <h2 className="text-base font-semibold text-gray-900">
          {total} {total === 1 ? 'place' : 'places'} in {locationName}
        </h2>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
        {error && (
          <div className="m-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        {isLoading && places.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
          </div>
        ) : places.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-500">
            No places in this view. Try zooming out or clearing filters.
          </div>
        ) : (
          places.map((place) => (
            <PlaceCard
              key={place.place_id}
              place={place}
              isSelected={selectedPlaceId === place.place_id}
              isFavorited={favorites.has(place.place_id)}
              onSelect={() => onSelectPlace(place.place_id)}
              onHover={(hover) => onHoverPlace(hover ? place.place_id : null)}
              onToggleFavorite={() => onToggleFavorite(place.place_id)}
            />
          ))
        )}

        {hasMore && !isLoading && (
          <div className="p-2">
            <button
              type="button"
              onClick={onLoadMore}
              className="w-full rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-black"
            >
              Load more
            </button>
          </div>
        )}

        {isLoading && places.length > 0 && (
          <div className="flex items-center justify-center py-4">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
          </div>
        )}
      </div>
    </div>
  );
}
