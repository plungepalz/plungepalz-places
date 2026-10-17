'use client';

import { ActivityType, PlaceType } from '@/lib/types';

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedActivities: ActivityType[];
  onActivityToggle: (activity: ActivityType) => void;
  selectedPlaceTypes: PlaceType[];
  onPlaceTypeToggle: (placeType: PlaceType) => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  approvedOnly: boolean;
  onApprovedOnlyToggle: () => void;
}

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  cold_plunge: 'Cold Plunge',
  sauna: 'Sauna',
};

const PLACE_TYPE_LABELS: Record<PlaceType, string> = {
  business: 'Business',
  nature: 'Nature',
  temporary_pop_up: 'Pop-up',
  gym_amenity: 'Gym',
};

export default function FilterBar({
  searchQuery,
  onSearchChange,
  selectedActivities,
  onActivityToggle,
  selectedPlaceTypes,
  onPlaceTypeToggle,
  showFilters,
  onToggleFilters,
  approvedOnly,
  onApprovedOnlyToggle,
}: FilterBarProps) {
  return (
    <div className="fixed top-0 left-0 right-0 z-20 bg-white border-b border-gray-200 shadow-sm">
      <div className="px-4 py-3">
        <div className="flex items-center gap-3">
          {/* Search input */}
          <div className="flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search places, cities..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          {/* Filter toggle button */}
          <button
            onClick={onToggleFilters}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              showFilters
                ? 'bg-orange-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Filters {(selectedActivities.length > 0 || selectedPlaceTypes.length > 0 || approvedOnly) && `(${selectedActivities.length + selectedPlaceTypes.length + (approvedOnly ? 1 : 0)})`}
          </button>

          {/* Activity chips */}
          {(Object.keys(ACTIVITY_LABELS) as ActivityType[]).map((activity) => (
            <button
              key={activity}
              onClick={() => onActivityToggle(activity)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                selectedActivities.includes(activity)
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {ACTIVITY_LABELS[activity]}
            </button>
          ))}
        </div>

        {/* Expanded filters */}
        {showFilters && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <div className="flex flex-wrap gap-2">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mr-2">
                Place Type:
              </div>
              {(Object.keys(PLACE_TYPE_LABELS) as PlaceType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => onPlaceTypeToggle(type)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    selectedPlaceTypes.includes(type)
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {PLACE_TYPE_LABELS[type]}
                </button>
              ))}
              <button
                onClick={onApprovedOnlyToggle}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  approvedOnly
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Approved Only
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
