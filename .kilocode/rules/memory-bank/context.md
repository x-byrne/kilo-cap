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
  - [x] `matchKey()` moved from CgtCalculator to cgt.ts (prevents circular dependency)
  - [x] `matchAutomaticWithAvailable()` and `matchManualWithLocked()` exported for locked-match recalculation
- [x] CgtCalculator refactored from 1201 lines to thin orchestrator (~320 lines)
  - [x] Extracted `CsvInput.tsx` — textarea, Load Sample, Upload CSV, Calculate CGT button, error display
  - [x] Extracted `StrategySelector.tsx` — strategy grid with labels/descriptions, lock count display
  - [x] Extracted `SummaryCards.tsx` — 4 summary cards + CGT discount saved message
  - [x] Extracted `TabNavigation.tsx` — Matches / Parcels / Trades tab buttons
  - [x] Extracted `MatchResultsTable.tsx` — matches table, unmatched sells alert, lock/unlock controls
  - [x] Extracted `ParcelsTable.tsx` — remaining parcels table
  - [x] Extracted `TradesTable.tsx` — all trades table
  - [x] Extracted `FyFilter.tsx` — financial year dropdown and Export Report button
  - [x] CgtCalculator now a thin orchestrator holding state and wiring sub-components via props
- [x] Updated layout metadata for CGT calculator
- [x] Updated all memory bank files
- [x] TypeScript type check passes
- [x] ESLint passes

## Current Structure

| File/Directory | Purpose | Status |
|----------------|---------|--------|
| `src/app/page.tsx` | Home page - renders CgtCalculator | Ready |
| `src/app/layout.tsx` | Root layout with CGT metadata | Ready |
| `src/app/globals.css` | Tailwind CSS import | Ready |
| `src/components/CgtCalculator.tsx` | Thin orchestrator (~320 lines) | Ready |
| `src/components/CsvInput.tsx` | CSV input section | Ready |
| `src/components/StrategySelector.tsx` | Strategy grid | Ready |
| `src/components/SummaryCards.tsx` | Summary cards | Ready |
| `src/components/TabNavigation.tsx` | Tab buttons | Ready |
| `src/components/MatchResultsTable.tsx` | Matches table | Ready |
| `src/components/ParcelsTable.tsx` | Parcels table | Ready |
| `src/components/TradesTable.tsx` | Trades table | Ready |
| `src/components/FyFilter.tsx` | FY filter + export | Ready |
| `src/lib/types.ts` | TypeScript type definitions | Ready |
| `src/lib/cgt.ts` | Core CGT calculation logic + matchKey + matching functions | Ready |

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
| 2026-08-12 | Refactored CgtCalculator from 1201 lines to 8 focused sub-components; moved matchKey and matching functions to cgt.ts |
