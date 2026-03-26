# System Patterns: Australian CGT Calculator

## Architecture Overview

```
src/
├── app/
│   ├── layout.tsx          # Root layout + metadata
│   ├── page.tsx            # Home page (renders CgtCalculator)
│   └── globals.css         # Tailwind imports
├── components/
│   └── CgtCalculator.tsx   # Main client component (all interactivity)
└── lib/
    ├── types.ts            # TypeScript type definitions
    └── cgt.ts              # Core CGT calculation logic
```

## Key Design Patterns

### 1. Single Client Component Pattern

The entire app is driven by one large client component (`CgtCalculator.tsx`) that manages:
- CSV input (paste/upload)
- Trade parsing
- Strategy selection
- Matching calculations
- Results display (tabs for matches, parcels, trades)

This is appropriate for a single-page tool where all state is interdependent.

### 2. Pure Calculation Library

`src/lib/cgt.ts` contains all CGT logic as pure functions:
- `parseCsv(csv)` - CSV string to Trade[]
- `tradesToParcels(trades)` - Buy trades to Parcel[]
- `matchTrades(trades, strategy)` - Core matching algorithm
- `calculateCgtSummary(matches)` - Aggregate calculations
- `isCgtDiscountEligible(acqDate, dispDate)` - 365-day check

### 3. Strategy Pattern

Matching strategies are implemented as sorting functions applied to available parcels before matching. Each strategy sorts parcels differently:
- FIFO: by date ascending
- LIFO: by date descending
- Min cost base: by cost per unit ascending
- Max cost base: by cost per unit descending
- Min taxable income: by cost per unit descending (highest cost = lowest gain)
- Max taxable income: by cost per unit ascending (lowest cost = highest gain)
- Manual: uses match_id grouping instead of automatic matching

### 4. Partial Parcel Splitting

When a sell requires more units than a single parcel contains:
- The parcel's `unitsRemaining` is decremented
- Only the matched portion is used in calculations
- Remaining units stay available for future matches
- Cost base and proceeds are proportionally allocated

## Data Flow

```
CSV Text → parseCsv() → Trade[]
                         ↓
                  matchTrades(trades, strategy)
                         ↓
              { matches[], unmatchedSells[], remainingParcels[] }
                         ↓
                  calculateCgtSummary(matches)
                         ↓
                     CgtSummary
```

## Styling Conventions

- Dark theme: neutral-950 background, neutral-900 cards, neutral-800 borders
- Colour coding: red-400 for gains (tax payable), green-400 for losses/savings
- Monospace font for numbers (font-mono)
- Responsive grid for summary cards
- Table with sticky headers for large result sets
