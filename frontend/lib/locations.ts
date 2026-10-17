export interface LocationPreset {
  id: string;
  label: string;
  lat: number;
  lng: number;
  zoom: number;
  radiusKm: number;
}

export const LOCATION_PRESETS: LocationPreset[] = [
  { id: 'worldwide', label: 'Worldwide', lat: 20, lng: 0, zoom: 1.6, radiusKm: 20000 },
  { id: 'united-states', label: 'United States', lat: 39.8283, lng: -98.5795, zoom: 3.4, radiusKm: 4000 },
  { id: 'salt-lake-city', label: 'Salt Lake City', lat: 40.7608, lng: -111.891, zoom: 11, radiusKm: 40 },
  { id: 'new-york', label: 'New York', lat: 40.73, lng: -73.99, zoom: 11, radiusKm: 30 },
  { id: 'helsinki', label: 'Helsinki', lat: 60.17, lng: 24.94, zoom: 11, radiusKm: 25 },
  { id: 'london', label: 'London', lat: 51.5074, lng: -0.1278, zoom: 11, radiusKm: 25 },
  { id: 'tokyo', label: 'Tokyo', lat: 35.6762, lng: 139.6503, zoom: 11, radiusKm: 30 },
];

export const DEFAULT_LOCATION = LOCATION_PRESETS[0];
