# Project Brief: Australian CGT Calculator

## Purpose

A web application for calculating Capital Gains Tax (CGT) on Australian share and ETF trades. It parses CSV trade data, matches purchases and sales using configurable strategies, calculates profits/losses, and determines CGT discount eligibility (50% discount for assets held over 12 months).

## Target Users

- Australian individual investors managing their own tax returns
- Accountants and tax advisors working with client share portfolios
- Anyone needing to optimise which parcels of shares to sell for tax purposes

## Core Use Case

1. User exports trade history from their broker as CSV
2. User uploads/pastes CSV into the app
3. App parses trades and matches buys to sells
4. User selects a matching strategy (FIFO, LIFO, min/max taxable income, etc.)
5. App displays matched trades with capital gains calculations
6. App shows CGT discount eligibility based on holding period (>365 days)
7. User can compare strategies to optimise their tax position

## CSV Input Format

```
trade_id,match_id,date,action,code,units,price,brokerage,total
T001,,2021-01-20,Buy,LRSOC,135175,0.03905,9.5,5288.06
T002,,2021-01-20,Buy,LRSOC,110888,0.043,9.5,4777.68
T003,M003,2021-02-15,Sell,LRSOC,194444,0.06,9.5,11657.14
```

## Matching Strategies

| Strategy | Description |
|----------|-------------|
| FIFO | First In, First Out - sell oldest shares first |
| LIFO | Last In, First Out - sell newest shares first |
| Minimise Taxable Income | Match highest cost base parcels first to reduce gains |
| Maximise Taxable Income | Match lowest cost base parcels first to increase gains |
| Minimise Cost Base | Match lowest cost base per unit first |
| Maximise Cost Base | Match highest cost base per unit first |
| Manual | Use match_id column to define buy-sell pairings |

## Key Requirements

### Must Have
- CSV import (paste or file upload)
- Automatic buy/sell matching by share code
- CGT discount calculation (>12 months holding)
- Multiple matching strategies
- Summary of total proceeds, cost base, capital gains, taxable gains
- Detailed match results table
- Remaining unmatched parcels display

### Nice to Have
- Export results to CSV
- Multiple financial year filtering
- Broker-specific CSV format parsers
- Save/load sessions

## Constraints

- Australian tax rules only (50% CGT discount for individuals, 12-month holding period)
- Client-side only (no server/database needed)
- No tax advice - calculations are informational only
