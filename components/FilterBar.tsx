'use client';

import { useEffect, useRef, useState } from 'react';
import { ACTIVITY_LABELS, PLACE_TYPE_LABELS } from '@/lib/labels';
import { LOCATION_PRESETS, type LocationPreset } from '@/lib/locations';
import type { ActivityType, PlaceType } from '@/lib/types';

interface FilterBarProps {
  location: LocationPreset;
  locationLabel?: string;
  onLocationChange: (location: LocationPreset) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedActivities: ActivityType[];
  onActivityToggle: (activity: ActivityType) => void;
  selectedPlaceTypes: PlaceType[];
  onPlaceTypeToggle: (placeType: PlaceType) => void;
  approvedOnly: boolean;
  onApprovedOnlyToggle: () => void;
  mockMode: boolean;
  onAddPlace: () => void;
  onFiltersOpenChange?: (open: boolean) => void;
}

export default function FilterBar({
  location,
  locationLabel,
  onLocationChange,
  searchQuery,
  onSearchChange,
  selectedActivities,
  onActivityToggle,
  selectedPlaceTypes,
  onPlaceTypeToggle,
  approvedOnly,
  onApprovedOnlyToggle,
  mockMode,
  onAddPlace,
  onFiltersOpenChange,
}: FilterBarProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [showLocations, setShowLocations] = useState(false);

  useEffect(() => {
    onFiltersOpenChange?.(showFilters);
  }, [showFilters, onFiltersOpenChange]);
  const locationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (locationRef.current && !locationRef.current.contains(event.target as Node)) {
        setShowLocations(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const extraFilterCount = selectedPlaceTypes.length + (approvedOnly ? 1 : 0);

  return (
    <div className="pointer-events-none relative z-40">
      <div
        data-filter-chrome
        className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-2xl bg-white/95 px-3 py-2 shadow-[0_8px_30px_rgb(0,0,0,0.12)] ring-1 ring-black/5 backdrop-blur"
      >
        <div className="flex items-center gap-2 pr-2 mr-1 border-r border-gray-200">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-white font-bold">
            P
          </div>
          <span className="hidden sm:inline text-sm font-semibold tracking-tight text-gray-900">PlungePalz</span>
        </div>

        <div className="relative" ref={locationRef}>
          <button
            type="button"
            data-location-chip
            onClick={() => setShowLocations((open) => !open)}
            className="flex w-[9.5rem] shrink-0 items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-2 text-sm font-medium text-gray-800 hover:bg-gray-200 sm:w-[10.5rem] sm:px-3"
          >
            <svg className="h-4 w-4 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="min-w-0 flex-1 truncate text-left">{locationLabel ?? location.label}</span>
            <svg className="h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showLocations && (
            <div className="absolute left-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl bg-white py-1 shadow-xl ring-1 ring-black/10">
              {LOCATION_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`block w-full px-3 py-2 text-left text-sm hover:bg-brand-soft ${
                    preset.id === location.id ? 'font-semibold text-brand-selected' : 'text-gray-800'
                  }`}
                  onClick={() => {
                    onLocationChange(preset);
                    setShowLocations(false);
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowFilters((open) => !open)}
          className={`relative flex h-9 w-9 items-center justify-center rounded-full ${
            showFilters || extraFilterCount > 0 ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          aria-label="Filters"
          aria-expanded={showFilters}
          aria-pressed={showFilters || extraFilterCount > 0}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M6 12h12M10 20h4" />
          </svg>
          {extraFilterCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
              {extraFilterCount}
            </span>
          )}
        </button>

        {(Object.keys(ACTIVITY_LABELS) as ActivityType[]).map((activity) => (
          <button
            key={activity}
            type="button"
            onClick={() => onActivityToggle(activity)}
            className={`rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
              selectedActivities.includes(activity)
                ? 'bg-brand text-white'
                : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
            }`}
            aria-pressed={selectedActivities.includes(activity)}
          >
            {ACTIVITY_LABELS[activity]}
          </button>
        ))}

        <div className="min-w-[180px] flex-1">
          <label htmlFor="places-search" className="sr-only">
            Search places
          </label>
          <input
            id="places-search"
            type="search"
            placeholder="Search places, cities..."
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            className="w-full rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-brand-hover focus:ring-2 focus:ring-brand-soft"
          />
        </div>

        <button
          type="button"
          onClick={onAddPlace}
          className="rounded-full bg-brand px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-selected"
          aria-haspopup="dialog"
        >
          Add a place
        </button>

        {mockMode && (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">Mock data</span>
        )}
      </div>

      <div
        data-place-type-filters
        className={`pointer-events-auto absolute left-0 right-0 top-full z-50 mt-2 flex flex-wrap items-center gap-2 rounded-2xl bg-white/95 px-3 py-2 shadow-[0_12px_32px_rgba(0,0,0,0.16)] ring-1 ring-black/10 backdrop-blur-sm transition duration-200 ease-out ${
          showFilters
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none invisible -translate-y-1 opacity-0'
        }`}
        aria-hidden={!showFilters}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Place type</span>
        {(Object.keys(PLACE_TYPE_LABELS) as PlaceType[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onPlaceTypeToggle(type)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              selectedPlaceTypes.includes(type)
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            aria-pressed={selectedPlaceTypes.includes(type)}
          >
            {PLACE_TYPE_LABELS[type]}
          </button>
        ))}
        <button
          type="button"
          onClick={onApprovedOnlyToggle}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
            approvedOnly ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          aria-pressed={approvedOnly}
        >
          Approved only
        </button>
      </div>
    </div>
  );
}
