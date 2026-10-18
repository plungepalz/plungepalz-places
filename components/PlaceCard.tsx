'use client';

import { memo } from 'react';
import { isApproved } from '@/lib/approval';
import { formatLocation, formatPlaceType } from '@/lib/labels';
import type { PlaceSearchResult } from '@/lib/types';
import CoverImage from './CoverImage';

interface PlaceCardProps {
  place: PlaceSearchResult;
  isSelected: boolean;
  isHovered?: boolean;
  isFavorited: boolean;
  onSelectPlace: (placeId: string) => void;
  onHoverPlace: (placeId: string | null) => void;
  onToggleFavorite: (placeId: string) => void;
}

function PlaceCard({
  place,
  isSelected,
  isHovered = false,
  isFavorited,
  onSelectPlace,
  onHoverPlace,
  onToggleFavorite,
}: PlaceCardProps) {
  const locationLine = formatLocation(place.city, place.state_province);
  return (
    <div
      data-place-id={place.place_id}
      data-place-card
      data-selected={isSelected ? 'true' : 'false'}
      data-hovered={isHovered ? 'true' : 'false'}
      className={`place-card relative rounded-2xl border bg-white ${
        isSelected
          ? 'place-card-selected border-brand shadow-md ring-2 ring-brand-soft'
          : isHovered
            ? 'place-card-hovered border-brand/50 bg-brand-soft/40 shadow-sm'
            : 'border-transparent hover:border-gray-200 hover:shadow-sm'
      }`}
      onMouseEnter={() => onHoverPlace(place.place_id)}
      onMouseLeave={() => onHoverPlace(null)}
      onFocus={() => onHoverPlace(place.place_id)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onHoverPlace(null);
        }
      }}
    >
      <button
        type="button"
        onClick={() => onSelectPlace(place.place_id)}
        className="w-full cursor-pointer rounded-2xl p-3 text-left"
      >
        <div className="flex gap-3 pr-8">
          <CoverImage
            src={place.cover_image}
            alt=""
            className="h-[72px] w-[72px] shrink-0 rounded-xl object-cover"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-semibold text-gray-900">{place.place_name}</h3>
              {isApproved(place) && (
                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                  Approved
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-gray-600">{formatPlaceType(place.place_type)}</p>
            {locationLine ? <p className="text-xs text-gray-500">{locationLine}</p> : null}
          </div>
        </div>
      </button>
      <button
        type="button"
        aria-label={isFavorited ? 'Remove favorite' : 'Save favorite'}
        aria-pressed={isFavorited}
        onClick={() => onToggleFavorite(place.place_id)}
        className="absolute right-2 top-2 rounded-full p-1 text-gray-400 hover:bg-brand-soft hover:text-brand"
      >
        <svg
          className={`h-5 w-5 ${isFavorited ? 'fill-brand text-brand' : ''}`}
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          fill={isFavorited ? 'currentColor' : 'none'}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
          />
        </svg>
      </button>
    </div>
  );
}

export default memo(PlaceCard);
