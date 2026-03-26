# Technical Context: Australian CGT Calculator

## Technology Stack

| Technology   | Version | Purpose                         |
| ------------ | ------- | ------------------------------- |
| Next.js      | 16.x    | React framework with App Router |
| React        | 19.x    | UI library                      |
| TypeScript   | 5.9.x   | Type-safe JavaScript            |
| Tailwind CSS | 4.x     | Utility-first CSS               |
| Bun          | Latest  | Package manager & runtime       |

## Development Commands

```bash
bun install        # Install dependencies
bun build          # Production build
bun lint           # Run ESLint
bun typecheck      # Run TypeScript type checking
```

## Project Configuration

### TypeScript Config (`tsconfig.json`)
- Strict mode enabled
- Path alias: `@/*` → `src/*`
- Target: ES2017

### Tailwind CSS 4 (`postcss.config.mjs`)
- Uses `@tailwindcss/postcss` plugin
- CSS-first configuration (v4 style)

## Key Dependencies

Only base Next.js dependencies - no additional packages needed. All CSV parsing and CGT calculation is implemented in `src/lib/cgt.ts`.

## File Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout (Geist fonts, metadata)
│   ├── page.tsx            # Home page - renders CgtCalculator
│   └── globals.css         # @import "tailwindcss"
├── components/
│   └── CgtCalculator.tsx   # Main interactive component
└── lib/
    ├── types.ts            # Trade, Parcel, Match, CgtSummary types
    └── cgt.ts              # parseCsv, matchTrades, calculateCgtSummary
```

## Technical Constraints

- Client-side only - no server-side processing or database
- All calculations run in the browser
- CSV parsing is custom (no external library)
- No persistence - data is lost on page refresh
- Max holding period check: >365 days for CGT discount eligibility
