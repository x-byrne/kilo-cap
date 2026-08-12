# Active Context: Australian CGT Calculator

## Current State

**App Status**: Functional - Australian CGT calculator with CSV import, trade matching, and multiple optimisation strategies.

## Recently Completed

- [x] TypeScript types for Trade, Parcel, Match, CgtSummary
- [x] Core CGT calculation library (`src/lib/cgt.ts`)
  - [x] CSV parser for trade data
  - [x] 7 matching strategies (FIFO, LIFO, min/max taxable income, min/max cost base, manual)
  - [x] CGT discount eligibility check (>365 days)
  - [x] Partial parcel splitting with proportional cost/proceeds allocation
  - [x] Brokerage allocation to cost base and proceeds
- [x] CgtCalculator client component with:
  - [x] CSV paste textarea and file upload
  - [x] Sample data loader
  - [x] Strategy selector with descriptions
  - [x] Summary cards (proceeds, cost base, gain, taxable gain)
  - [x] Matched trades table with CGT discount indicators
  - [x] Remaining parcels tab
  - [x] All trades tab
  - [x] Unmatched sells warning
- [x] Updated layout metadata for CGT calculator
- [x] Updated all memory bank files
- [x] TypeScript type check passes
- [x] ESLint passes
- [x] CI workflow (`.github/workflows/ci.yml`): added `bun install --frozen-lockfile` to every job; build step uses `bun run build`
- [x] CSV input validation hardened: `Number.isNaN()` checks for units/price/brokerage in `validateTradeRow` (`src/lib/cgt.ts`)
- [x] Added `src/lib/cgt.test.ts` unit tests (parseCsv NaN + edge cases); added `@types/bun`
- [x] PR #12 CI now green (build, lint, test, typecheck all pass)

## Current Structure

| File/Directory | Purpose | Status |
|----------------|---------|--------|
| `src/app/page.tsx` | Home page - renders CgtCalculator | Ready |
| `src/app/layout.tsx` | Root layout with CGT metadata | Ready |
| `src/app/globals.css` | Tailwind CSS import | Ready |
| `src/components/CgtCalculator.tsx` | Main interactive component | Ready |
| `src/lib/types.ts` | TypeScript type definitions | Ready |
| `src/lib/cgt.ts` | Core CGT calculation logic | Ready |

## Current Focus

The app is functional and ready for use. Potential next steps:
- Export results to CSV
- Financial year filtering
- Broker-specific CSV format parsers
- Save/load sessions (localStorage or file)
- Unit tests for CGT calculation logic

## Session History

| Date | Changes |
|------|---------|
| 2026-03-26 | Built complete CGT calculator app: types, calculation library, UI with CSV import, 7 matching strategies, summary display, detailed results tables |
