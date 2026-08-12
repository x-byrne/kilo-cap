export interface TaxEstimatorResult {
  marginalRate: number;
  taxOnGain: number;
  totalTax: number;
  effectiveRate: number;
}

const TAX_BRACKETS_2024_25: { min: number; max: number; rate: number }[] = [
  { min: 0, max: 18200, rate: 0 },
  { min: 18200, max: 45000, rate: 0.19 },
  { min: 45000, max: 120000, rate: 0.325 },
  { min: 120000, max: 180000, rate: 0.37 },
  { min: 180000, max: Infinity, rate: 0.45 },
];

const MEDICARE_LEVY_RATE = 0.02;

function calculateIncomeTax(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0;

  let tax = 0;
  for (const bracket of TAX_BRACKETS_2024_25) {
    if (taxableIncome > bracket.min) {
      const amountInBracket =
        Math.min(taxableIncome, bracket.max) - bracket.min;
      tax += amountInBracket * bracket.rate;
    }
  }
  return tax;
}

function getMarginalRate(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0;
  for (const bracket of TAX_BRACKETS_2024_25) {
    if (taxableIncome > bracket.min && taxableIncome <= bracket.max) {
      return bracket.rate;
    }
    if (bracket.max === Infinity && taxableIncome > bracket.min) {
      return bracket.rate;
    }
  }
  return 0;
}

export function calculateEstimatedTax(
  taxableIncome: number,
  netCapitalGain: number,
): TaxEstimatorResult {
  const totalTaxable = Math.max(0, taxableIncome + netCapitalGain);

  const marginalRate = getMarginalRate(totalTaxable);
  const regularTax = calculateIncomeTax(taxableIncome);
  const totalIncomeTax = calculateIncomeTax(totalTaxable);
  const taxOnGain = Math.max(0, totalIncomeTax - regularTax);
  const medicareLevy = totalTaxable * MEDICARE_LEVY_RATE;
  const totalTax = totalIncomeTax + medicareLevy;
  const effectiveRate = totalTaxable > 0 ? totalTax / totalTaxable : 0;

  return {
    marginalRate,
    taxOnGain,
    totalTax,
    effectiveRate,
  };
}
