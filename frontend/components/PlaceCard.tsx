'use client';

import { PlaceSearchResult } from '@/lib/types';
import { useState } from 'react';

interface PlaceCardProps {
  place: PlaceSearchResult;
  isSelected: boolean;
  onSelect: () => void;
  onHover: (hover: boolean) => void;
}

export default function PlaceCard({ place, isSelected, onSelect, onHover }: PlaceCardProps) {
  const [isFavorited, setIsFavorited] = useState(false);

  return (
    <div
      className={`bg-white border rounded-lg p-4 cursor-pointer transition-all ${
        isSelected
          ? 'border-orange-500 ring-2 ring-orange-200'
          : 'border-gray-200 hover:border-orange-300 hover:shadow-md'
      }`}
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <div className="flex gap-3">
        {/* Thumbnail */}
        <div className="flex-shrink-0">
          <div className="w-20 h-20 bg-gradient-to-br from-orange-100 to-orange-200 rounded-lg flex items-center justify-center">
            {place.cover_image ? (
              <img
                src={place.cover_image}
                alt={place.place_name}
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              <svg
                className="w-10 h-10 text-orange-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 truncate">{place.place_name}</h3>
              {place.is_approved && (
                <span className="inline-block mt-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                  Approved
                </span>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsFavorited(!isFavorited);
              }}
              className="flex-shrink-0 p-1 hover:bg-gray-100 rounded-full transition-colors"
            >
              <svg
                className={`w-5 h-5 ${isFavorited ? 'fill-orange-500 text-orange-500' : 'text-gray-400'}`}
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                />
              </svg>
            </button>
          </div>

          <div className="mt-1 text-sm text-gray-600">
            <div className="capitalize">{place.place_type.replace(/_/g, ' ')}</div>
            <div className="text-xs text-gray-500">
              {place.city}
              {place.state_province && `, ${place.state_province}`}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-1">
            {place.activity_types.map((activity) => (
              <span
                key={activity}
                className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full"
              >
                {activity === 'cold_plunge' ? '❄️ Cold' : '🔥 Sauna'}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
