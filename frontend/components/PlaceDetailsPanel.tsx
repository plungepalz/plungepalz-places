'use client';

import { useEffect, useState } from 'react';
import { isApproved } from '@/lib/approval';
import { client } from '@/lib/client';
import { isPlacesApiError } from '@/lib/errors';
import { ACTIVITY_LABELS, formatLocation, formatPlaceType } from '@/lib/labels';
import type { PlaceDetail } from '@/lib/types';
import CoverImage from './CoverImage';

interface PlaceDetailsPanelProps {
  placeId: string;
  onClose: () => void;
}

export default function PlaceDetailsPanel({ placeId, onClose }: PlaceDetailsPanelProps) {
  const [place, setPlace] = useState<PlaceDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchPlace = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await client.getPlace(placeId);
        if (!cancelled) setPlace(data);
      } catch (err) {
        if (!cancelled) {
          setPlace(null);
          setError(isPlacesApiError(err) ? err.message : 'Failed to load place details');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchPlace();
    return () => {
      cancelled = true;
    };
  }, [placeId]);

  return (
    <aside className="absolute inset-y-4 right-4 z-30 flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <h2 className="text-lg font-semibold text-gray-900">Place details</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
          aria-label="Close details"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
          </div>
        ) : error ? (
          <p className="text-center text-red-600">{error}</p>
        ) : place ? (
          <div className="space-y-5">
            <CoverImage src={place.cover_image} alt="" className="h-52 w-full rounded-xl object-cover" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-2xl font-bold text-gray-900">{place.place_name}</h3>
                {isApproved(place) && (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                    Approved
                  </span>
                )}
              </div>
              <p className="mt-1 text-gray-600">{formatPlaceType(place.place_type)}</p>
            </div>
            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Location</h4>
              <p className="text-gray-900">
                {place.address && (
                  <>
                    {place.address}
                    <br />
                  </>
                )}
                {formatLocation(place.city, place.state_province)}
                {place.country ? ` · ${place.country}` : ''}
              </p>
            </div>
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Activities</h4>
              <div className="flex flex-wrap gap-2">
                {place.activity_types.map((activity) => (
                  <span
                    key={activity}
                    className="rounded-full bg-orange-50 px-3 py-1 text-sm font-medium text-orange-700"
                  >
                    {ACTIVITY_LABELS[activity]}
                  </span>
                ))}
              </div>
            </div>
            {place.description && (
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Description</h4>
                <p className="leading-relaxed text-gray-700">{place.description}</p>
              </div>
            )}
            {place.amenities && place.amenities.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {place.amenities.map((amenity) => (
                  <span key={amenity} className="rounded-full bg-gray-100 px-3 py-1 text-sm capitalize text-gray-700">
                    {amenity}
                  </span>
                ))}
              </div>
            )}
            {place.place_website_url && (
              <a
                href={place.place_website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
              >
                Visit website
              </a>
            )}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
