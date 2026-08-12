/// <reference types="vitest" />
import {
  calculateCgtSummary,
  calculateLossOffsets,
  formatCurrency,
  getFinancialYear,
  getFinancialYearLabel,
  getFinancialYearRange,
  isCgtDiscountEligible,
  matchAutomatic,
  matchManual,
  matchTrades,
  parseCsv,
  sortParcelsByStrategy,
  tradesToParcels,
} from "../cgt";
import type { Match, Parcel, Trade } from "../types";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function makeTrade(
  tradeId: string,
  overrides: Partial<Omit<Trade, "tradeId">> = {},
): Trade {
  return {
    tradeId,
    matchId: "",
    date: "2024-01-01",
    action: "Buy",
    code: "BHP",
    units: 100,
    price: 10,
    brokerage: 0,
    total: 1000,
    ...overrides,
  };
}

function makeParcel(
  tradeId: string,
  overrides: Partial<Omit<Parcel, "tradeId">> = {},
): Parcel {
  return {
    tradeId,
    date: "2024-01-01",
    code: "BHP",
    unitsRemaining: 100,
    totalUnits: 100,
    costBasePerUnit: 10,
    totalCostBase: 1000,
    ...overrides,
  };
}

function makeMatch(
  sellTradeId: string,
  overrides: Partial<Omit<Match, "sellTradeId">> = {},
): Match {
  return {
    sellTradeId,
    buyTradeId: "T1",
    code: "BHP",
    units: 100,
    sellDate: "2024-06-01",
    buyDate: "2024-01-01",
    sellProceeds: 1500,
    buyCostBase: 1000,
    capitalGain: 500,
    cgtDiscountEligible: false,
    discountedGain: 500,
    ...overrides,
  };
}

describe("parseCsv", () => {
  it("parses valid input with all columns", () => {
    const csv = `trade_id,date,action,code,units,price,brokerage,total,match_id
T1,2024-01-01,Buy,BHP,100,10.5,10,1060,
T2,2024-06-01,Sell,BHP,50,15.0,15,735,M1`;
    const trades = parseCsv(csv);
    expect(trades).toHaveLength(2);
    expect(trades[0]).toMatchObject({
      tradeId: "T1",
      date: "2024-01-01",
      action: "Buy",
      code: "BHP",
      units: 100,
      price: 10.5,
      brokerage: 10,
      total: 1060,
      matchId: "",
    });
    expect(trades[1]).toMatchObject({
      tradeId: "T2",
      date: "2024-06-01",
      action: "Sell",
      code: "BHP",
      units: 50,
      price: 15,
      brokerage: 15,
      total: 735,
      matchId: "M1",
    });
  });

  it("throws on missing required columns", () => {
    const csv = `date,action,code
2024-01-01,Buy,BHP`;
    expect(() => parseCsv(csv)).toThrow(
      "CSV must contain at least trade_id, date, and action columns",
    );
  });

  it("skips empty lines", () => {
    const csv = `trade_id,date,action,code,units,price,brokerage,total
T1,2024-01-01,Buy,BHP,100,10,0,1000

T2,2024-06-01,Sell,BHP,50,15,0,750`;
    const trades = parseCsv(csv);
    expect(trades).toHaveLength(2);
  });

  it("parses quoted values", () => {
    const csv = `trade_id,date,action,code,units,price,brokerage,total
T1,"2024-01-01","Buy","BHP",100,10,0,1000`;
    const trades = parseCsv(csv);
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      tradeId: "T1",
      date: "2024-01-01",
      action: "Buy",
      code: "BHP",
    });
  });

  it("filters out non-buy/sell actions", () => {
    const csv = `trade_id,date,action,code,units,price,brokerage,total
T1,2024-01-01,Buy,BHP,100,10,0,1000
T2,2024-01-02,Dividend,BHP,0,0,0,0
T3,2024-06-01,Sell,BHP,50,15,0,750`;
    const trades = parseCsv(csv);
    expect(trades).toHaveLength(2);
    expect(trades.every((t) => t.action === "Buy" || t.action === "Sell")).toBe(
      true,
    );
  });

  it("defaults optional columns when missing", () => {
    const csv = `trade_id,date,action,units,price
T1,2024-01-01,Buy,100,10`;
    const trades = parseCsv(csv);
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      tradeId: "T1",
      code: "",
      units: 100,
      price: 10,
      brokerage: 0,
      matchId: "",
    });
  });

  it("returns empty array for empty input", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("trade_id,date,action\n")).toEqual([]);
  });
});

describe("isCgtDiscountEligible", () => {
  it("returns false for exactly 365 days", () => {
    const start = "2023-01-01";
    const end = "2024-01-01";
    const diffDays =
      (new Date(end).getTime() - new Date(start).getTime()) / MS_PER_DAY;
    expect(diffDays).toBe(365);
    expect(isCgtDiscountEligible(start, end)).toBe(false);
  });

  it("returns true for over 365 days", () => {
    expect(isCgtDiscountEligible("2024-01-01", "2025-01-02")).toBe(true);
  });

  it("returns false for under 365 days", () => {
    expect(isCgtDiscountEligible("2024-01-01", "2024-06-01")).toBe(false);
  });

  it("handles leap years correctly", () => {
    expect(isCgtDiscountEligible("2024-02-29", "2025-03-01")).toBe(true);
  });
});

describe("sortParcelsByStrategy", () => {
  const parcels: Parcel[] = [
    makeParcel("T1", { date: "2024-01-01", costBasePerUnit: 10, totalCostBase: 1000 }),
    makeParcel("T2", { date: "2024-03-01", costBasePerUnit: 8, totalCostBase: 800 }),
    makeParcel("T3", { date: "2024-02-01", costBasePerUnit: 12, totalCostBase: 1200 }),
  ];

  it("sorts fifo by date ascending", () => {
    const sorted = sortParcelsByStrategy(parcels, "fifo");
    expect(sorted.map((p) => p.tradeId)).toEqual(["T1", "T3", "T2"]);
  });

  it("sorts lifo by date descending", () => {
    const sorted = sortParcelsByStrategy(parcels, "lifo");
    expect(sorted.map((p) => p.tradeId)).toEqual(["T2", "T3", "T1"]);
  });

  it("sorts min-cost-base by costBasePerUnit ascending", () => {
    const sorted = sortParcelsByStrategy(parcels, "min-cost-base");
    expect(sorted.map((p) => p.tradeId)).toEqual(["T2", "T1", "T3"]);
  });

  it("sorts max-cost-base by costBasePerUnit descending", () => {
    const sorted = sortParcelsByStrategy(parcels, "max-cost-base");
    expect(sorted.map((p) => p.tradeId)).toEqual(["T3", "T1", "T2"]);
  });

  it("sorts min-taxable-income by costBasePerUnit descending then date ascending", () => {
    const sorted = sortParcelsByStrategy(parcels, "min-taxable-income");
    expect(sorted.map((p) => p.tradeId)).toEqual(["T3", "T1", "T2"]);
  });

  it("sorts max-taxable-income by costBasePerUnit ascending then date descending", () => {
    const sorted = sortParcelsByStrategy(parcels, "max-taxable-income");
    expect(sorted.map((p) => p.tradeId)).toEqual(["T2", "T1", "T3"]);
  });

  it("does not sort for manual strategy", () => {
    const sorted = sortParcelsByStrategy(parcels, "manual");
    expect(sorted.map((p) => p.tradeId)).toEqual(["T1", "T2", "T3"]);
  });

  it("returns empty array for empty input", () => {
    expect(sortParcelsByStrategy([], "fifo")).toEqual([]);
  });
});

describe("matchAutomatic", () => {
  it("matches a simple buy/sell pair", () => {
    const trades: Trade[] = [
      makeTrade("T1", { date: "2024-01-01", action: "Buy", units: 100, price: 10, brokerage: 0 }),
      makeTrade("T2", { date: "2024-06-01", action: "Sell", units: 100, price: 15, brokerage: 0 }),
    ];
    const { matches, unmatchedSells, remainingParcels } = matchAutomatic(trades, "fifo");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      sellTradeId: "T2",
      buyTradeId: "T1",
      code: "BHP",
      units: 100,
      sellDate: "2024-06-01",
      buyDate: "2024-01-01",
      sellProceeds: 1500,
      buyCostBase: 1000,
      capitalGain: 500,
      cgtDiscountEligible: false,
      discountedGain: 500,
    });
    expect(unmatchedSells).toHaveLength(0);
    expect(remainingParcels).toHaveLength(0);
  });

  it("handles partial match when sell exceeds parcel units", () => {
    const trades: Trade[] = [
      makeTrade("T1", { date: "2024-01-01", action: "Buy", units: 100, price: 10, brokerage: 0 }),
      makeTrade("T2", { date: "2024-02-01", action: "Buy", units: 100, price: 12, brokerage: 0 }),
      makeTrade("T3", { date: "2024-06-01", action: "Sell", units: 150, price: 15, brokerage: 0 }),
    ];
    const { matches, unmatchedSells, remainingParcels } = matchAutomatic(trades, "fifo");
    expect(matches).toHaveLength(2);
    expect(matches[0].units).toBe(100);
    expect(matches[0].buyTradeId).toBe("T1");
    expect(matches[1].units).toBe(50);
    expect(matches[1].buyTradeId).toBe("T2");
    expect(unmatchedSells).toHaveLength(0);
    expect(remainingParcels).toHaveLength(1);
    expect(remainingParcels[0].unitsRemaining).toBe(50);
  });

  it("matches multiple parcels for one sell", () => {
    const trades: Trade[] = [
      makeTrade("T1", { date: "2024-01-01", action: "Buy", units: 100, price: 10, brokerage: 0 }),
      makeTrade("T2", { date: "2024-02-01", action: "Buy", units: 100, price: 12, brokerage: 0 }),
      makeTrade("T3", { date: "2024-06-01", action: "Sell", units: 150, price: 15, brokerage: 0 }),
    ];
    const { matches } = matchAutomatic(trades, "fifo");
    expect(matches).toHaveLength(2);
    expect(matches.reduce((sum, m) => sum + m.units, 0)).toBe(150);
  });

  it("returns unmatched sell when no parcels available", () => {
    const trades: Trade[] = [
      makeTrade("T1", { date: "2024-06-01", action: "Sell", units: 100, price: 15, brokerage: 0 }),
    ];
    const { matches, unmatchedSells } = matchAutomatic(trades, "fifo");
    expect(matches).toHaveLength(0);
    expect(unmatchedSells).toHaveLength(1);
    expect(unmatchedSells[0].units).toBe(100);
  });

  it("marks discount eligible when held over 12 months", () => {
    const trades: Trade[] = [
      makeTrade("T1", { date: "2023-01-01", action: "Buy", units: 100, price: 10, brokerage: 0 }),
      makeTrade("T2", { date: "2024-06-01", action: "Sell", units: 100, price: 15, brokerage: 0 }),
    ];
    const { matches } = matchAutomatic(trades, "fifo");
    expect(matches[0].cgtDiscountEligible).toBe(true);
    expect(matches[0].discountedGain).toBe(250);
  });

  it("allocates brokerage proportionally", () => {
    const trades: Trade[] = [
      makeTrade("T1", { date: "2024-01-01", action: "Buy", units: 100, price: 10, brokerage: 100 }),
      makeTrade("T2", { date: "2024-06-01", action: "Sell", units: 100, price: 15, brokerage: 50 }),
    ];
    const { matches } = matchAutomatic(trades, "fifo");
    expect(matches[0].sellProceeds).toBeCloseTo(1500 - 50);
    expect(matches[0].buyCostBase).toBeCloseTo(1000 + 100);
  });
});

describe("matchManual", () => {
  it("groups trades by match_id", () => {
    const trades: Trade[] = [
      makeTrade("T1", { date: "2024-01-01", action: "Buy", matchId: "M1", units: 100, price: 10, brokerage: 0 }),
      makeTrade("T2", { date: "2024-06-01", action: "Sell", matchId: "M1", units: 100, price: 15, brokerage: 0 }),
    ];
    const { matches } = matchManual(trades);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      sellTradeId: "T2",
      buyTradeId: "T1",
      units: 100,
      capitalGain: 500,
    });
  });

  it("handles partial units within a match group", () => {
    const trades: Trade[] = [
      makeTrade("T1", { date: "2024-01-01", action: "Buy", matchId: "M1", units: 100, price: 10, brokerage: 0 }),
      makeTrade("T2", { date: "2024-06-01", action: "Sell", matchId: "M1", units: 150, price: 15, brokerage: 0 }),
    ];
    const { matches, unmatchedSells } = matchManual(trades);
    expect(matches).toHaveLength(1);
    expect(matches[0].units).toBe(100);
    expect(unmatchedSells).toHaveLength(1);
    expect(unmatchedSells[0].units).toBe(50);
  });

  it("adds sells without match_id to unmatchedSells", () => {
    const trades: Trade[] = [
      makeTrade("T1", { date: "2024-01-01", action: "Buy", matchId: "M1", units: 100, price: 10, brokerage: 0 }),
      makeTrade("T2", { date: "2024-06-01", action: "Sell", matchId: "", units: 100, price: 15, brokerage: 0 }),
    ];
    const { matches, unmatchedSells } = matchManual(trades);
    expect(matches).toHaveLength(0);
    expect(unmatchedSells).toHaveLength(1);
    expect(unmatchedSells[0].tradeId).toBe("T2");
  });
});

describe("calculateCgtSummary", () => {
  it("calculates totals from matches", () => {
    const matches: Match[] = [
      makeMatch("T1", { sellProceeds: 1500, buyCostBase: 1000, capitalGain: 500, discountedGain: 500 }),
      makeMatch("T2", { sellProceeds: 800, buyCostBase: 1000, capitalGain: -200, discountedGain: -200 }),
    ];
    const summary = calculateCgtSummary({ matches, unmatchedSells: [], remainingParcels: [] });
    expect(summary.totalProceeds).toBe(2300);
    expect(summary.totalCostBase).toBe(2000);
    expect(summary.totalCapitalGain).toBe(300);
    expect(summary.totalDiscountedGain).toBe(300);
    expect(summary.totalDiscountAmount).toBe(0);
    expect(summary.matchCount).toBe(2);
    expect(summary.totalCapitalLosses).toBe(200);
    expect(summary.netCapitalGain).toBe(300);
  });

  it("returns zeros for empty matches", () => {
    const summary = calculateCgtSummary({ matches: [], unmatchedSells: [], remainingParcels: [] });
    expect(summary.totalProceeds).toBe(0);
    expect(summary.totalCostBase).toBe(0);
    expect(summary.totalCapitalGain).toBe(0);
    expect(summary.totalDiscountedGain).toBe(0);
    expect(summary.totalDiscountAmount).toBe(0);
    expect(summary.matchCount).toBe(0);
    expect(summary.totalCapitalLosses).toBe(0);
    expect(summary.netCapitalGain).toBe(0);
  });
});

describe("calculateLossOffsets", () => {
  it("calculates gross gain when all matches are profitable", () => {
    const matches: Match[] = [
      makeMatch("T1", { capitalGain: 500, discountedGain: 500, sellProceeds: 1500, buyCostBase: 1000 }),
      makeMatch("T2", { capitalGain: 300, discountedGain: 300, sellProceeds: 800, buyCostBase: 500 }),
    ];
    const result = calculateLossOffsets(matches);
    expect(result.totalCapitalGain).toBe(800);
    expect(result.totalCapitalLosses).toBe(0);
    expect(result.netCapitalGain).toBe(800);
  });

  it("calculates gross loss when all matches are losses", () => {
    const matches: Match[] = [
      makeMatch("T1", { capitalGain: -200, discountedGain: -200, sellProceeds: 800, buyCostBase: 1000 }),
      makeMatch("T2", { capitalGain: -300, discountedGain: -300, sellProceeds: 700, buyCostBase: 1000 }),
    ];
    const result = calculateLossOffsets(matches);
    expect(result.totalCapitalGain).toBe(0);
    expect(result.totalCapitalLosses).toBe(500);
    expect(result.netCapitalGain).toBe(-500);
  });

  it("does not double-count losses in net capital gain", () => {
    const matches: Match[] = [
      makeMatch("T1", { capitalGain: 500, discountedGain: 500, sellProceeds: 1500, buyCostBase: 1000 }),
      makeMatch("T2", { capitalGain: -200, discountedGain: -200, sellProceeds: 800, buyCostBase: 1000 }),
    ];
    const result = calculateLossOffsets(matches);
    expect(result.totalCapitalGain).toBe(500);
    expect(result.totalCapitalLosses).toBe(200);
    expect(result.netCapitalGain).toBe(300);
    expect(result.totalProceeds).toBe(2300);
    expect(result.totalCostBase).toBe(2000);
  });
});

describe("getFinancialYear / getFinancialYearLabel / getFinancialYearRange", () => {
  it("returns correct financial year for January", () => {
    expect(getFinancialYear("2024-01-15")).toBe(2024);
  });

  it("returns correct financial year for July", () => {
    expect(getFinancialYear("2024-07-01")).toBe(2025);
  });

  it("returns correct financial year for June", () => {
    expect(getFinancialYear("2024-06-30")).toBe(2024);
  });

  it("formats financial year label correctly", () => {
    expect(getFinancialYearLabel(2025)).toBe("FY2024/25");
  });

  it("returns correct financial year range", () => {
    const range = getFinancialYearRange(2025);
    expect(range.start).toBe("2024-07-01");
    expect(range.end).toBe("2025-06-30");
  });
});

describe("formatCurrency", () => {
  it("formats positive values as AUD", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
  });

  it("formats negative values as AUD", () => {
    expect(formatCurrency(-500)).toBe("-$500.00");
  });

  it("formats zero as AUD", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });
});

describe("matchTrades", () => {
  it("delegates to matchAutomatic for non-manual strategy", () => {
    const trades: Trade[] = [
      makeTrade("T1", { date: "2024-01-01", action: "Buy", units: 100, price: 10, brokerage: 0 }),
      makeTrade("T2", { date: "2024-06-01", action: "Sell", units: 100, price: 15, brokerage: 0 }),
    ];
    const { matches } = matchTrades(trades, "fifo");
    expect(matches).toHaveLength(1);
  });

  it("delegates to matchManual for manual strategy", () => {
    const trades: Trade[] = [
      makeTrade("T1", { date: "2024-01-01", action: "Buy", matchId: "M1", units: 100, price: 10, brokerage: 0 }),
      makeTrade("T2", { date: "2024-06-01", action: "Sell", matchId: "M1", units: 100, price: 15, brokerage: 0 }),
    ];
    const { matches } = matchTrades(trades, "manual");
    expect(matches).toHaveLength(1);
  });
});

describe("tradesToParcels", () => {
  it("converts buy trades to parcels", () => {
    const trades: Trade[] = [
      makeTrade("T1", { date: "2024-01-01", action: "Buy", units: 100, price: 10, brokerage: 10 }),
    ];
    const parcels = tradesToParcels(trades);
    expect(parcels).toHaveLength(1);
    expect(parcels[0]).toMatchObject({
      tradeId: "T1",
      unitsRemaining: 100,
      totalUnits: 100,
      costBasePerUnit: 10.1,
      totalCostBase: 1010,
    });
  });

  it("ignores sell trades", () => {
    const trades: Trade[] = [
      makeTrade("T1", { date: "2024-01-01", action: "Sell", units: 100, price: 15, brokerage: 0 }),
    ];
    expect(tradesToParcels(trades)).toHaveLength(0);
  });

  it("handles zero units", () => {
    const trades: Trade[] = [
      makeTrade("T1", { date: "2024-01-01", action: "Buy", units: 0, price: 10, brokerage: 0 }),
    ];
    const parcels = tradesToParcels(trades);
    expect(parcels[0].costBasePerUnit).toBe(0);
    expect(parcels[0].totalCostBase).toBe(0);
  });
});
