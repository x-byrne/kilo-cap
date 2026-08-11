# Kilo Cap

An Australian Capital Gains Tax (CGT) calculator for share and ETF trades. Paste or upload your brokerage CSV export, choose a matching strategy, and instantly see your taxable capital gains with 50% CGT discount eligibility.

## Features

- **CSV Import** — Paste trade data directly or upload a CSV file exported from your broker
- **7 Matching Strategies**
  - FIFO (First In, First Out)
  - LIFO (Last In, First Out)
  - Minimise Taxable Income
  - Maximise Taxable Income
  - Minimise Cost Base
  - Maximise Cost Base
  - Manual Matching (via `match_id` column)
- **CGT Discount Calculation** — Automatically applies the 50% discount for assets held over 12 months
- **Financial Year Filtering** — View results by Australian financial year (Jul–Jun)
- **Match Locking** — Lock individual matches so they persist when switching strategies
- **Summary Dashboard** — Total proceeds, cost base, capital gain, and taxable capital gain at a glance
- **Export Report** — Download matched results as a CSV file
- **Sample Data** — Load example trades to try the app without your own data
- **100% Client-Side** — No data leaves your browser. No accounts, no servers, no storage

## Tech Stack

- [Next.js](https://nextjs.org/) 16 (App Router)
- [React](https://react.dev/) 19
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/) 4
- [Bun](https://bun.sh/) — package manager and runtime

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) installed globally

### Installation

```bash
git clone https://github.com/x-byrne/kilo-cap.git
cd kilo-cap
bun install
```

### Development

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
bun build
bun start
```

### Linting & Type Checking

```bash
bun lint
bun typecheck
```

## Deployment

### Vercel (recommended)

1. Push your repository to GitHub
2. Import the project in [Vercel](https://vercel.com)
3. Vercel auto-detects the Next.js framework — no configuration needed
4. Deploy

### Other Platforms

This is a standard Next.js application. It can be deployed to any platform that supports Node.js:

- **Netlify** — Use the Next.js runtime plugin
- **Docker** — Build with `bun build` and serve with `bun start`
- **Self-hosted** — Run `bun build && bun start` on any server with Node.js/Bun

No environment variables are required — the app runs entirely client-side.

## CSV Format

The app expects CSV data with the following columns:

| Column       | Description                        |
| ------------ | ---------------------------------- |
| `action`     | `buy` or `sell`                    |
| `code`       | Stock/ETF ticker symbol            |
| `date`       | Trade date (YYYY-MM-DD)            |
| `units`      | Number of units                    |
| `price`      | Price per unit                     |
| `brokerage`  | Brokerage fee                      |
| `match_id`   | (Optional) For manual matching     |

## License

MIT
