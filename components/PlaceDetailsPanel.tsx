'use client';

import { useEffect, useRef, useState } from 'react';
import { isApproved } from '@/lib/approval';
import { client } from '@/lib/client';
import { isPlacesApiError } from '@/lib/errors';
import { ACTIVITY_LABELS, formatLocation, formatPlaceType } from '@/lib/labels';
import { useDialogA11y } from '@/lib/use-dialog-a11y';
import type { ExternalRatingsAiGenerated, PlaceDetail } from '@/lib/types';
import CoverImage from './CoverImage';

interface PlaceDetailsPanelProps {
  placeId: string;
  onClose: () => void;
  /** Pixels from the viewport top so the header sits below the filter bar. */
  offsetTop?: number;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function hasRatings(ratings?: ExternalRatingsAiGenerated): boolean {
  return Boolean(ratings && (ratings.google || ratings.classpass));
}

function MetadataBlock({ metadata }: { metadata: Record<string, unknown> }) {
  const entries = Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (entries.length === 0) return null;
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Details</h4>
      <dl className="space-y-1 text-sm text-gray-800">
        {entries.map(([key, value]) => (
          <div key={key} className="flex justify-between gap-4">
            <dt className="capitalize text-gray-500">{key.replace(/_/g, ' ')}</dt>
            <dd className="text-right">
              {typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
                ? String(value)
                : JSON.stringify(value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function PlaceDetailsPanel({ placeId, onClose, offsetTop = 96 }: PlaceDetailsPanelProps) {
  const [place, setPlace] = useState<PlaceDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

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

  useDialogA11y({ onClose, initialFocusRef: closeButtonRef, containerRef: panelRef });

  const locationLine = place
    ? formatLocation(place.city, place.state_province, place.country, place.postal_code)
    : '';

  return (
    <aside
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="place-details-title"
      data-place-details
      className="drawer-panel absolute bottom-28 right-4 z-30 flex w-[min(28rem,calc(100%-2rem))] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10"
      style={{ top: offsetTop }}
    >
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <h2 id="place-details-title" className="text-lg font-semibold text-gray-900">
          Place details
        </h2>
        <button
          ref={closeButtonRef}
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
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand border-t-transparent" />
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
            {place.address || locationLine ? (
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Location</h4>
                <p className="text-gray-900">
                  {place.address ? (
                    <>
                      {place.address}
                      <br />
                    </>
                  ) : null}
                  {locationLine}
                </p>
              </div>
            ) : null}
            {place.activity_types.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Activities</h4>
                <div className="flex flex-wrap gap-2">
                  {place.activity_types.map((activity) => (
                    <span
                      key={activity}
                      className="rounded-full bg-brand-soft px-3 py-1 text-sm font-medium text-brand-deep"
                    >
                      {ACTIVITY_LABELS[activity]}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {place.hours_of_operation ? (
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Hours</h4>
                <p className="text-gray-800">{place.hours_of_operation}</p>
              </div>
            ) : null}
            {place.description ? (
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Description</h4>
                <p className="leading-relaxed text-gray-700">{place.description}</p>
              </div>
            ) : null}
            {place.amenities && place.amenities.length > 0 ? (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Amenities</h4>
                <div className="flex flex-wrap gap-2">
                  {place.amenities.map((amenity) => (
                    <span key={amenity} className="rounded-full bg-gray-100 px-3 py-1 text-sm capitalize text-gray-700">
                      {amenity}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {place.tags && place.tags.length > 0 ? (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Tags</h4>
                <div className="flex flex-wrap gap-2">
                  {place.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
                      {tag.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {place.place_type_metadata && Object.keys(place.place_type_metadata).length > 0 ? (
              <MetadataBlock metadata={place.place_type_metadata} />
            ) : null}
            {hasRatings(place.external_ratings_ai_generated) ? (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Ratings</h4>
                <ul className="space-y-1 text-sm text-gray-800">
                  {place.external_ratings_ai_generated?.google ? (
                    <li>
                      Google {place.external_ratings_ai_generated.google.rating_score}
                      {place.external_ratings_ai_generated.google.count_string
                        ? ` (${place.external_ratings_ai_generated.google.count_string})`
                        : ''}
                    </li>
                  ) : null}
                  {place.external_ratings_ai_generated?.classpass ? (
                    <li>
                      ClassPass {place.external_ratings_ai_generated.classpass.rating_score}
                      {place.external_ratings_ai_generated.classpass.count_string
                        ? ` (${place.external_ratings_ai_generated.classpass.count_string})`
                        : ''}
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}
            {place.place_website_url ? (
              <a
                href={place.place_website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-selected"
              >
                Visit website
              </a>
            ) : null}
            {place.ts_last_updated || place.ts_created ? (
              <p className="text-xs text-gray-400">
                {place.ts_last_updated ? `Updated ${formatTimestamp(place.ts_last_updated)}` : null}
                {place.ts_last_updated && place.ts_created ? ' · ' : null}
                {place.ts_created ? `Added ${formatTimestamp(place.ts_created)}` : null}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
