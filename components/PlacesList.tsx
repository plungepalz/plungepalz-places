'use client';

import { memo, useEffect, useRef } from 'react';
import { placesListHeading } from '@/lib/list-heading';
import { FILTER_OVERLAY_HEADER_INSET, shouldScrollChildIntoView } from '@/lib/map-style';
import type { PlaceSearchResult } from '@/lib/types';
import PlaceCard from './PlaceCard';

interface PlacesListProps {
  places: PlaceSearchResult[];
  total: number;
  selectedPlaceId: string | null;
  hoveredPlaceId: string | null;
  favorites: Set<string>;
  onSelectPlace: (placeId: string) => void;
  onHoverPlace: (placeId: string | null) => void;
  onToggleFavorite: (placeId: string) => void;
  onLoadMore?: () => void;
  hasMore: boolean;
  isLoading: boolean;
  locationName: string;
  error: string | null;
  filterHeaderInset?: boolean;
  /** Settled header text; when null, keep-previous or show a loading title. */
  heading?: string | null;
  /** Narrow viewport: header is a Show list / Hide list control. */
  collapsible?: boolean;
  expanded?: boolean;
  onToggleExpanded?: () => void;
}

function PlacesList({
  places,
  total,
  selectedPlaceId,
  hoveredPlaceId,
  favorites,
  onSelectPlace,
  onHoverPlace,
  onToggleFavorite,
  onLoadMore,
  hasMore,
  isLoading,
  locationName,
  error,
  filterHeaderInset = false,
  heading = null,
  collapsible = false,
  expanded = true,
  onToggleExpanded,
}: PlacesListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const compact = collapsible && !expanded;
  const title =
    heading ??
    (isLoading && places.length === 0
      ? 'Loading places…'
      : placesListHeading(places.length, total, locationName, { hasMore }));

  useEffect(() => {
    const placeId = hoveredPlaceId || selectedPlaceId;
    const parent = scrollRef.current;
    if (!placeId || !parent) return;
    const child = parent.querySelector<HTMLElement>(`[data-place-id="${placeId}"]`);
    if (!child) return;
    const parentRect = parent.getBoundingClientRect();
    const childRect = child.getBoundingClientRect();
    if (shouldScrollChildIntoView(childRect, parentRect)) {
      child.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [hoveredPlaceId, selectedPlaceId]);

  const headerInner = (
    <>
      <h2 className="min-h-6 text-base font-semibold text-gray-900">{title}</h2>
      {collapsible ? (
        <span className="ml-3 flex shrink-0 items-center gap-1 text-sm font-medium text-gray-500">
          {expanded ? 'Hide list' : 'Show list'}
          <svg
            className={`h-4 w-4 places-list-chevron ${expanded ? 'rotate-180' : ''}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      ) : null}
    </>
  );

  return (
    <div
      data-places-list
      data-list-expanded={expanded ? 'true' : 'false'}
      className={`places-list flex flex-col overflow-hidden rounded-2xl bg-white shadow-[0_12px_40px_rgba(0,0,0,0.14)] ring-1 ring-black/5 ${
        compact ? 'h-auto' : 'h-full'
      }`}
    >
      <div className="relative h-0.5 shrink-0 overflow-hidden bg-transparent" aria-hidden>
        {isLoading ? <div className="places-loading-bar" /> : null}
      </div>
      <div
        className="border-b border-gray-100"
        style={filterHeaderInset ? { paddingTop: FILTER_OVERLAY_HEADER_INSET } : undefined}
      >
        {collapsible ? (
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
            aria-expanded={expanded}
            aria-controls="places-list-body"
            onClick={onToggleExpanded}
          >
            {headerInner}
          </button>
        ) : (
          <div className="px-4 py-3">{headerInner}</div>
        )}
      </div>

      <div
        className={`places-list-body-wrap ${compact ? 'places-list-body-wrap-collapsed' : 'places-list-body-wrap-expanded'}`}
        aria-hidden={compact}
        inert={compact ? true : undefined}
      >
        <div
          id="places-list-body"
          ref={scrollRef}
          className="places-list-body flex-1 space-y-1 overflow-y-auto px-2 py-2"
        >
          {error && (
            <div className="m-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          {isLoading && places.length === 0 ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
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
                isHovered={hoveredPlaceId === place.place_id}
                isFavorited={favorites.has(place.place_id)}
                onSelectPlace={onSelectPlace}
                onHoverPlace={onHoverPlace}
                onToggleFavorite={onToggleFavorite}
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
        </div>
      </div>
    </div>
  );
}

export default memo(PlacesList);
