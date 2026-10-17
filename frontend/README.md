# PlungePalz Places Frontend

A Next.js web application for browsing and discovering sauna and cold plunge locations worldwide.

## Features

- **Interactive Map**: Mapbox GL map with clustered pins showing place locations
- **Filter & Search**: Search by text, activity type (sauna, cold plunge), and place type (business, nature, pop-up, gym)
- **Place Cards**: Scrollable list of places with thumbnail, approval status, and favorite functionality
- **Details Panel**: Full place information including location, activities, amenities, and website links
- **Viewport Sync**: Map and list stay synchronized based on the current map viewport
- **Mock Mode**: Fully functional with mock data when API is not configured

## Setup

### Prerequisites

- Node.js 18+ and npm

### Installation

1. Install dependencies:

```bash
npm install
```

2. Create environment configuration:

```bash
cp .env.example .env.local
```

3. Configure environment variables in `.env.local`:

```bash
# Required for map functionality
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token_here

# Optional: API base URL (omit for mock mode)
NEXT_PUBLIC_API_BASE_URL=https://your-api-gateway.execute-api.us-east-1.amazonaws.com/dev
```

### Getting a Mapbox Token

1. Sign up for a free account at [https://www.mapbox.com/](https://www.mapbox.com/)
2. Navigate to your [Account Dashboard](https://account.mapbox.com/)
3. Create a new token or copy your default public token
4. Add it to your `.env.local` file

## Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The app will run in **mock mode** if `NEXT_PUBLIC_API_BASE_URL` is not set, using realistic mock data for development.

## Building for Production

Build the application:

```bash
npm run build
```

Start the production server:

```bash
npm run start
```

## Linting

Run ESLint:

```bash
npm run lint
```

## API Integration

The frontend connects to the PlungePalz Places API (backend in `../backend/`). See `../backend/docs/API_REFERENCE.md` for the full API contract.

### API Endpoints Used

- **GET /search**: Search places with filters (bbox, activity types, place types, etc.)
- **GET /place/{place_id}**: Get full place details
- **POST /submit**: Submit a new place (typed client function only; no UI yet)

### API Contract Notes

1. **Approval Status**: Places include `is_approved: boolean`. Only approved places show the "Approved" tag in the UI.
2. **Pagination**: Search supports `limit` (default 100, max 500) and `page` (0-based) with `has_more` in the response.
3. **Bbox Filtering**: Preferred method for viewport-based queries using `bbox=minLng,minLat,maxLng,maxLat`.

## Project Structure

```
frontend/
├── app/
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Main map view page
│   └── globals.css         # Global styles
├── components/
│   ├── FilterBar.tsx       # Top filter bar with search and chips
│   ├── PlaceCard.tsx       # Individual place card
│   ├── PlacesList.tsx      # Scrollable list of place cards
│   ├── PlacesMap.tsx       # Mapbox map with pins
│   └── PlaceDetailsPanel.tsx # Sliding details drawer
├── lib/
│   ├── types.ts            # TypeScript types
│   ├── api-client.ts       # Real API client
│   ├── mock-client.ts      # Mock API client
│   ├── mock-data.ts        # Mock place data
│   └── client.ts           # Client factory (switches between real/mock)
├── .env.example            # Environment variable template
├── .env.local              # Your local environment (gitignored)
└── README.md               # This file
```

## Mock Data

When running in mock mode, the app includes ~24 mock places across multiple countries:

- United States (Utah, California, New York, Washington, Colorado, etc.)
- Finland (Helsinki)
- Iceland (Reykjavik)
- Germany (Berlin)
- Japan (Tokyo)
- Australia (Sydney)
- Canada (Whistler, Lake Louise)
- United Kingdom (London)
- Netherlands (Amsterdam)

Mix of place types: business, nature, temporary pop-ups, and gym amenities, with varying approval statuses.

## Technologies

- **Next.js 16** (App Router, using webpack)
- **React 19**
- **TypeScript**
- **Tailwind CSS 4**
- **Mapbox GL JS** (via react-map-gl)
- **React Map GL 8**

**Note:** This project uses webpack instead of Turbopack due to react-map-gl compatibility. The `--webpack` flag is included in the npm scripts.

## Known Limitations

- No image upload functionality yet
- Submit form UI not implemented (API client function exists)
- Clustering logic uses simple markers (advanced clustering TBD)
- Mock mode uses in-memory state (resets on refresh)

## License

Proprietary - PlungePalz
