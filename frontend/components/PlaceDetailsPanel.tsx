'use client';

import { PlaceDetail } from '@/lib/types';
import { useEffect, useState } from 'react';
import { client } from '@/lib/client';

interface PlaceDetailsPanelProps {
  placeId: string;
  onClose: () => void;
}

export default function PlaceDetailsPanel({ placeId, onClose }: PlaceDetailsPanelProps) {
  const [place, setPlace] = useState<PlaceDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPlace = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await client.getPlace(placeId);
        setPlace(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load place details');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPlace();
  }, [placeId]);

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-30 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Place Details</h2>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="px-6 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500"></div>
          </div>
        ) : error ? (
          <div className="text-center text-red-600 py-8">
            <p>{error}</p>
          </div>
        ) : place ? (
          <div className="space-y-6">
            {/* Cover Image */}
            {place.cover_image ? (
              <img
                src={place.cover_image}
                alt={place.place_name}
                className="w-full h-64 object-cover rounded-lg"
              />
            ) : (
              <div className="w-full h-64 bg-gradient-to-br from-orange-100 to-orange-200 rounded-lg flex items-center justify-center">
                <svg className="w-24 h-24 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </div>
            )}

            {/* Title & Approval Status */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-2xl font-bold text-gray-900">{place.place_name}</h3>
                {place.is_approved && (
                  <span className="px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded-full">
                    Approved
                  </span>
                )}
              </div>
              <p className="text-gray-600 capitalize">{place.place_type.replace(/_/g, ' ')}</p>
            </div>

            {/* Location */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Location</h4>
              <p className="text-gray-900">
                {place.address && <>{place.address}<br /></>}
                {place.city}
                {place.state_province && `, ${place.state_province}`}
                {place.country && <> {place.country}</>}
              </p>
            </div>

            {/* Activity Types */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Activities</h4>
              <div className="flex flex-wrap gap-2">
                {place.activity_types.map((activity) => (
                  <span
                    key={activity}
                    className="px-3 py-1.5 bg-orange-100 text-orange-700 text-sm font-medium rounded-full"
                  >
                    {activity === 'cold_plunge' ? '❄️ Cold Plunge' : '🔥 Sauna'}
                  </span>
                ))}
              </div>
            </div>

            {/* Description */}
            {place.description && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Description</h4>
                <p className="text-gray-700 leading-relaxed">{place.description}</p>
              </div>
            )}

            {/* Amenities */}
            {place.amenities && place.amenities.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Amenities</h4>
                <div className="flex flex-wrap gap-2">
                  {place.amenities.map((amenity, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full capitalize"
                    >
                      {amenity}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Website */}
            {place.place_website_url && (
              <div>
                <a
                  href={place.place_website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors"
                >
                  Visit Website
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            )}

            {/* Coordinates */}
            <div className="pt-4 border-t border-gray-200 text-xs text-gray-500">
              <p>ID: {place.place_id}</p>
              <p>Coordinates: {place.lat.toFixed(4)}, {place.lng.toFixed(4)}</p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
