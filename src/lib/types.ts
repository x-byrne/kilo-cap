export type Action = "Buy" | "Sell";

export type MatchStrategy =
  | "fifo"
  | "lifo"
  | "min-taxable-income"
  | "max-taxable-income"
  | "min-cost-base"
  | "max-cost-base"
  | "manual";

export interface Trade {
  tradeId: string;
  matchId: string;
  date: string; // ISO date string YYYY-MM-DD
  action: Action;
  code: string;
  units: number;
  price: number;
  brokerage: number;
  total: number;
}

export interface Parcel {
  tradeId: string;
  date: string;
  code: string;
  unitsRemaining: number;
  totalUnits: number;
  costBasePerUnit: number; // price + brokerage allocated per unit
  totalCostBase: number;
}

export interface Match {
  sellTradeId: string;
  buyTradeId: string;
  code: string;
  units: number;
  sellDate: string;
  buyDate: string;
  sellProceeds: number; // proportional proceeds for matched units
  buyCostBase: number; // proportional cost base for matched units
  capitalGain: number; // proceeds - cost base
  isLoss: boolean; // true when capitalGain < 0
  cgtDiscountEligible: boolean; // held > 12 months
  discountedGain: number; // gain after 50% CGT discount if eligible
}

export interface CgtSummary {
  totalProceeds: number;
  totalCostBase: number;
  totalCapitalGain: number;
  totalDiscountedGain: number;
  totalDiscountAmount: number;
  matchCount: number;
  unmatchedSells: Trade[];
  remainingParcels: Parcel[];
  totalCapitalLosses: number;
  netCapitalGain: number;
  lossCarryForward: number;
  fycgSummary: Record<number, { gains: number; losses: number; net: number; carryForward: number }>;
}

export interface MatchedTrade extends Trade {
  matchedUnits?: number;
  matchedWith?: string; // trade ID of the matched trade
}
