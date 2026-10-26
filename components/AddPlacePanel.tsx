'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { geocodeAddress } from '@/lib/geocode';
import { client } from '@/lib/client';
import { isPlacesApiError } from '@/lib/errors';
import { ACTIVITY_LABELS, PLACE_TYPE_LABELS } from '@/lib/labels';
import {
  ACTIVITY_TYPE_VALUES,
  MAX_ADDRESS_LEN,
  MAX_DESCRIPTION_LEN,
  MAX_PLACE_NAME_LEN,
  PLACE_TYPE_VALUES,
  buildOptimisticPlace,
  validateSubmitPlace,
} from '@/lib/submit-validation';
import { useDialogA11y } from '@/lib/use-dialog-a11y';
import type { ActivityType, PlaceSearchResult, PlaceType } from '@/lib/types';

export interface DraftLocation {
  lat: number;
  lng: number;
}

interface AddPlacePanelProps {
  /** Pixels from the viewport top so the header sits below the filter bar. */
  offsetTop?: number;
  onClose: () => void;
  onSubmitted: (place: PlaceSearchResult) => void;
  mapboxToken?: string;
  hasMap: boolean;
  locationLabel: string;
  fallbackCenter: DraftLocation;
  onUseMapCenter: () => void;
  draftLocation: DraftLocation | null;
  /** Incremented when the map drops a pin or reports its center, so inputs snap to that pin. */
  draftNonce: number;
  onDraftLocationChange: (location: DraftLocation | null) => void;
}

function formatCoord(value: number): string {
  return value.toFixed(5);
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-sm text-red-600">
      {message}
    </p>
  );
}

export default function AddPlacePanel({
  offsetTop = 96,
  onClose,
  onSubmitted,
  mapboxToken,
  hasMap,
  locationLabel,
  fallbackCenter,
  onUseMapCenter,
  draftLocation,
  draftNonce,
  onDraftLocationChange,
}: AddPlacePanelProps) {
  const formId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const [placeName, setPlaceName] = useState('');
  const [placeType, setPlaceType] = useState<PlaceType>('business');
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [latInput, setLatInput] = useState('');
  const [lngInput, setLngInput] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [geocodeMessage, setGeocodeMessage] = useState<string | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [appliedNonce, setAppliedNonce] = useState(0);

  useDialogA11y({ onClose, initialFocusRef: closeButtonRef, containerRef: panelRef, modal: false });

  if (draftLocation && draftNonce !== appliedNonce) {
    setAppliedNonce(draftNonce);
    setLatInput(formatCoord(draftLocation.lat));
    setLngInput(formatCoord(draftLocation.lng));
  }

  const addressRequired = placeType !== 'nature';
  const nameId = `${formId}-name`;
  const addressId = `${formId}-address`;
  const latId = `${formId}-lat`;
  const lngId = `${formId}-lng`;
  const emailId = `${formId}-email`;
  const descriptionId = `${formId}-description`;

  const syncDraftFromInputs = (latValue: string, lngValue: string) => {
    const lat = Number(latValue);
    const lng = Number(lngValue);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      onDraftLocationChange({ lat, lng });
    }
  };

  const applyLocation = (location: DraftLocation) => {
    onDraftLocationChange(location);
    setLatInput(formatCoord(location.lat));
    setLngInput(formatCoord(location.lng));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.lat;
      delete next.lng;
      return next;
    });
  };

  const handleUseFallbackCenter = () => {
    applyLocation(fallbackCenter);
  };

  const handleFindOnMap = async () => {
    setGeocodeMessage(null);
    if (!mapboxToken) {
      setGeocodeMessage('Add a Mapbox token to look up an address on the map.');
      return;
    }
    if (!address.trim()) {
      setGeocodeMessage('Enter an address first.');
      return;
    }
    setIsGeocoding(true);
    try {
      const result = await geocodeAddress(address, mapboxToken);
      if (!result) {
        setGeocodeMessage('Could not find that address.');
        return;
      }
      applyLocation(result);
      setGeocodeMessage('Pin moved to the matching address.');
    } finally {
      setIsGeocoding(false);
    }
  };

  const toggleActivity = (activity: ActivityType) => {
    setActivityTypes((prev) =>
      prev.includes(activity) ? prev.filter((item) => item !== activity) : [...prev, activity]
    );
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.activity_types;
      return next;
    });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const { details, payload } = validateSubmitPlace({
      place_name: placeName,
      place_type: placeType,
      activity_types: activityTypes,
      lat: latInput,
      lng: lngInput,
      address,
      description,
      email,
    });
    if (!payload) {
      setFieldErrors(details);
      setFormError('Please fix the highlighted fields.');
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);
    try {
      const response = await client.submitPlace(payload);
      const place = buildOptimisticPlace(payload, response);
      onSubmitted(place);
    } catch (err) {
      if (isPlacesApiError(err)) {
        setFormError(err.message);
        if (err.details) setFieldErrors(err.details);
      } else {
        setFormError('Could not submit this place. Try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const chosenLocation =
    draftLocation ??
    (Number.isFinite(Number(latInput)) && Number.isFinite(Number(lngInput)) && latInput && lngInput
      ? { lat: Number(latInput), lng: Number(lngInput) }
      : null);

  return (
    <aside
      ref={panelRef}
      role="dialog"
      aria-labelledby="add-place-title"
      data-add-place-panel
      className="drawer-panel absolute bottom-28 right-4 z-30 flex w-[min(28rem,calc(100%-2rem))] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10"
      style={{ top: offsetTop }}
    >
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <h2 id="add-place-title" className="text-lg font-semibold text-gray-900">
          Add a place
        </h2>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
          aria-label="Close add a place form"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {formError && (
            <div role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div>
            <label htmlFor={nameId} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Place name
            </label>
            <input
              id={nameId}
              name="place_name"
              type="text"
              autoComplete="off"
              required
              maxLength={MAX_PLACE_NAME_LEN}
              value={placeName}
              onChange={(event) => {
                setPlaceName(event.target.value);
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next.place_name;
                  return next;
                });
              }}
              aria-invalid={Boolean(fieldErrors.place_name)}
              aria-describedby={fieldErrors.place_name ? `${nameId}-error` : undefined}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />
            <FieldError id={`${nameId}-error`} message={fieldErrors.place_name} />
          </div>

          <fieldset>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Place type</legend>
            <div className="flex flex-wrap gap-2">
              {PLACE_TYPE_VALUES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setPlaceType(type);
                    setFieldErrors((prev) => {
                      const next = { ...prev };
                      delete next.place_type;
                      if (type === 'nature') delete next.address;
                      return next;
                    });
                  }}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                    placeType === type ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  aria-pressed={placeType === type}
                >
                  {PLACE_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
            <FieldError id={`${formId}-type-error`} message={fieldErrors.place_type} />
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Activities</legend>
            <div className="flex flex-wrap gap-2">
              {ACTIVITY_TYPE_VALUES.map((activity) => (
                <button
                  key={activity}
                  type="button"
                  onClick={() => toggleActivity(activity)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                    activityTypes.includes(activity)
                      ? 'bg-brand text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  aria-pressed={activityTypes.includes(activity)}
                >
                  {ACTIVITY_LABELS[activity]}
                </button>
              ))}
            </div>
            <FieldError id={`${formId}-activities-error`} message={fieldErrors.activity_types} />
          </fieldset>

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Location</p>
            <p className="mb-2 text-sm text-gray-600">
              {hasMap
                ? 'Click the map to drop or move a pin, or use the map center.'
                : `No map token — use the ${locationLabel} coordinates, or enter lat/lng.`}
            </p>
            <div className="mb-2 flex flex-wrap gap-2">
              {hasMap ? (
                <button
                  type="button"
                  onClick={onUseMapCenter}
                  className="rounded-full bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-black"
                >
                  Use map center
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleUseFallbackCenter}
                  className="rounded-full bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-black"
                >
                  Use {locationLabel} coordinates
                </button>
              )}
            </div>
            {chosenLocation ? (
              <p className="mb-2 font-mono text-xs text-gray-700">
                {formatCoord(chosenLocation.lat)}, {formatCoord(chosenLocation.lng)}
              </p>
            ) : (
              <p className="mb-2 text-xs text-gray-500">No coordinates selected.</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor={latId} className="mb-1 block text-xs font-medium text-gray-500">
                  Latitude
                </label>
                <input
                  id={latId}
                  name="lat"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={-90}
                  max={90}
                  required
                  value={latInput}
                  onChange={(event) => {
                    setLatInput(event.target.value);
                    syncDraftFromInputs(event.target.value, lngInput);
                    setFieldErrors((prev) => {
                      const next = { ...prev };
                      delete next.lat;
                      return next;
                    });
                  }}
                  aria-invalid={Boolean(fieldErrors.lat)}
                  aria-describedby={fieldErrors.lat ? `${latId}-error` : undefined}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                />
                <FieldError id={`${latId}-error`} message={fieldErrors.lat} />
              </div>
              <div>
                <label htmlFor={lngId} className="mb-1 block text-xs font-medium text-gray-500">
                  Longitude
                </label>
                <input
                  id={lngId}
                  name="lng"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={-180}
                  max={180}
                  required
                  value={lngInput}
                  onChange={(event) => {
                    setLngInput(event.target.value);
                    syncDraftFromInputs(latInput, event.target.value);
                    setFieldErrors((prev) => {
                      const next = { ...prev };
                      delete next.lng;
                      return next;
                    });
                  }}
                  aria-invalid={Boolean(fieldErrors.lng)}
                  aria-describedby={fieldErrors.lng ? `${lngId}-error` : undefined}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                />
                <FieldError id={`${lngId}-error`} message={fieldErrors.lng} />
              </div>
            </div>
          </div>

          <div>
            <label htmlFor={addressId} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Address {addressRequired ? '' : '(optional for nature)'}
            </label>
            <input
              id={addressId}
              name="address"
              type="text"
              autoComplete="street-address"
              required={addressRequired}
              maxLength={MAX_ADDRESS_LEN}
              value={address}
              onChange={(event) => {
                setAddress(event.target.value);
                setGeocodeMessage(null);
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next.address;
                  return next;
                });
              }}
              aria-invalid={Boolean(fieldErrors.address)}
              aria-describedby={fieldErrors.address ? `${addressId}-error` : undefined}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />
            <FieldError id={`${addressId}-error`} message={fieldErrors.address} />
            <button
              type="button"
              onClick={() => void handleFindOnMap()}
              disabled={isGeocoding}
              className="mt-2 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-200 disabled:opacity-60"
            >
              {isGeocoding ? 'Looking up…' : 'Find on map'}
            </button>
            {geocodeMessage && <p className="mt-1 text-xs text-gray-500">{geocodeMessage}</p>}
          </div>

          <div>
            <label htmlFor={descriptionId} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Description (optional)
            </label>
            <textarea
              id={descriptionId}
              name="description"
              rows={3}
              maxLength={MAX_DESCRIPTION_LEN}
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next.description;
                  return next;
                });
              }}
              aria-invalid={Boolean(fieldErrors.description)}
              aria-describedby={fieldErrors.description ? `${descriptionId}-error` : undefined}
              className="w-full resize-y rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />
            <FieldError id={`${descriptionId}-error`} message={fieldErrors.description} />
          </div>

          <div>
            <label htmlFor={emailId} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Email (optional)
            </label>
            <input
              id={emailId}
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next.email;
                  return next;
                });
              }}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? `${emailId}-error` : undefined}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />
            <FieldError id={`${emailId}-error`} message={fieldErrors.email} />
          </div>
        </div>

        <div className="border-t border-gray-100 px-5 py-4">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-selected disabled:opacity-60"
          >
            {isSubmitting ? 'Submitting…' : 'Submit place'}
          </button>
        </div>
      </form>
    </aside>
  );
}
