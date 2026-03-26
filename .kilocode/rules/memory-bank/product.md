# Product Context: Australian CGT Calculator

## Why This App Exists

Managing capital gains tax from share and ETF trades in Australia is complex. Investors must match specific purchase parcels to sales, track holding periods for CGT discount eligibility, and determine which parcels to sell for optimal tax outcomes. This app automates that process.

## Problems It Solves

1. **Trade Matching**: Automatically pairs buy and sell transactions for the same share code
2. **CGT Discount Calculation**: Determines if each matched pair qualifies for the 50% CGT discount (>12 months holding)
3. **Strategy Optimisation**: Lets users compare different matching strategies to find the best tax outcome
4. **Partial Parcel Handling**: Correctly splits parcels when only part of a purchase is sold
5. **Brokerage Allocation**: Properly allocates brokerage costs to cost base and reduces proceeds

## User Flow

1. Export trades from broker as CSV (or use provided sample)
2. Paste CSV text or upload file
3. Click "Calculate CGT" to parse and match trades
4. Review summary cards (proceeds, cost base, capital gain, taxable gain)
5. Switch between matching strategies to compare outcomes
6. Inspect individual matches in the results table
7. Check remaining parcels that haven't been fully matched
8. Review unmatched sells (sells without corresponding buys)

## Key UX Goals

- **Instant Feedback**: Strategy changes recalculate immediately
- **Clear Visualisation**: Colour-coded gains (red for positive, green for losses)
- **Strategy Comparison**: Easy switching between strategies to compare tax outcomes
- **Detailed Breakdown**: Both summary-level and line-item detail
- **Dark Theme**: Neutral-950/900 dark UI for comfortable extended use

## CGT Rules Implemented

- Capital gain = sale proceeds - cost base
- Cost base = purchase price + brokerage (allocated proportionally)
- Sale proceeds = sale price - brokerage (allocated proportionally)
- CGT discount: 50% reduction if asset held > 365 days
- Taxable gain = capital gain (with 50% discount applied if eligible)
- Capital losses can offset capital gains within the same calculation
