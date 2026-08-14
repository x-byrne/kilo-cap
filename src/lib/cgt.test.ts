import { test, expect } from "bun:test";
import {
  parseCsv,
  formatDate,
  tradesToParcels,
  getHeldDays,
  isCgtDiscountEligible,
  sortParcelsByStrategy,
  matchTrades,
  calculateCgtSummary,
  getFinancialYear,
  getFinancialYearLabel,
  filterTradesByFinancialYear,
} from "./cgt";
import type { Match, MatchStrategy, Parcel, Trade } from "./types";

const HEADER =
  "trade_id,date,action,code,units,price,brokerage,total,match_id";

function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    tradeId: "T1",
    matchId: "",
    date: "2024-01-15",
    action: "Buy",
    code: "BHP",
    units: 100,
    price: 20,
    brokerage: 10,
    total: 2010,
    ...overrides,
  };
}

function makeParcel(overrides: Partial<Parcel> = {}): Parcel {
  return {
    tradeId: "T1",
    date: "2024-01-15",
    code: "BHP",
    unitsRemaining: 100,
    totalUnits: 100,
    costBasePerUnit: 20.1,
    totalCostBase: 2010,
    ...overrides,
  };
}

test("parseCsv accepts a valid trade row", () => {
  const csv = `${HEADER}\nT1,2024-01-15,Buy,BHP,100,20.00,10.00,2010.00,`;
  const trades = parseCsv(csv);
  expect(trades).toHaveLength(1);
  expect(trades[0].units).toBe(100);
  expect(trades[0].price).toBe(20);
  expect(trades[0].brokerage).toBe(10);
});

test("parseCsv rejects non-numeric units", () => {
  const csv = `${HEADER}\nT1,2024-01-15,Buy,BHP,abc,20.00,10.00,2010.00,`;
  expect(() => parseCsv(csv)).toThrow(/Units must be a valid number/);
});

test("parseCsv rejects non-numeric price", () => {
  const csv = `${HEADER}\nT1,2024-01-15,Buy,BHP,100,xyz,10.00,2010.00,`;
  expect(() => parseCsv(csv)).toThrow(/Price must be a valid number/);
});

test("parseCsv rejects non-numeric brokerage", () => {
  const csv = `${HEADER}\nT1,2024-01-15,Buy,BHP,100,20.00,abc,2010.00,`;
  expect(() => parseCsv(csv)).toThrow(/Brokerage must be a valid number/);
});

test("parseCsv rejects zero units", () => {
  const csv = `${HEADER}\nT1,2024-01-15,Buy,BHP,0,20.00,10.00,0.00,`;
  expect(() => parseCsv(csv)).toThrow(/Units must be a positive number/);
});

test("parseCsv rejects negative brokerage", () => {
  const csv = `${HEADER}\nT1,2024-01-15,Buy,BHP,100,20.00,-5.00,1995.00,`;
  expect(() => parseCsv(csv)).toThrow(/Brokerage must be non-negative/);
});

// ─── tradesToParcels ───────────────────────────────────────────────────────────

test("tradesToParcels calculates costBasePerUnit and totalCostBase correctly", () => {
  const trades = [
    makeTrade({ tradeId: "T1", units: 100, price: 20, brokerage: 10 }),
    makeTrade({ tradeId: "T2", units: 50, price: 30, brokerage: 5 }),
  ];
  const parcels = tradesToParcels(trades);
  expect(parcels).toHaveLength(2);
  expect(parcels[0].costBasePerUnit).toBeCloseTo(20.1);
  expect(parcels[0].totalCostBase).toBe(2010);
  expect(parcels[1].costBasePerUnit).toBeCloseTo(30.1);
  expect(parcels[1].totalCostBase).toBe(1505);
});

test("tradesToParcels ignores sell trades", () => {
  const trades = [
    makeTrade({ tradeId: "T1", action: "Buy", units: 100 }),
    makeTrade({ tradeId: "T2", action: "Sell", units: 50 }),
  ];
  const parcels = tradesToParcels(trades);
  expect(parcels).toHaveLength(1);
  expect(parcels[0].tradeId).toBe("T1");
});

// ─── getHeldDays & isCgtDiscountEligible ──────────────────────────────────────

test("getHeldDays returns correct number of days", () => {
  expect(getHeldDays("2023-01-01", "2024-01-01")).toBe(365);
  expect(getHeldDays("2023-06-01", "2023-06-30")).toBe(29);
});

test("isCgtDiscountEligible returns true when held > 365 days", () => {
  expect(isCgtDiscountEligible("2023-01-01", "2024-01-02")).toBe(true);
});

test("isCgtDiscountEligible returns false when held <= 365 days", () => {
  expect(isCgtDiscountEligible("2024-01-01", "2024-12-31")).toBe(false);
  expect(isCgtDiscountEligible("2023-01-01", "2023-12-31")).toBe(false);
});

// ─── sortParcelsByStrategy ────────────────────────────────────────────────────

test("sortParcelsByStrategy fifo sorts by date ascending", () => {
  const parcels = [
    makeParcel({ date: "2024-03-01", costBasePerUnit: 30 }),
    makeParcel({ date: "2023-01-01", costBasePerUnit: 10 }),
    makeParcel({ date: "2024-01-01", costBasePerUnit: 20 }),
  ];
  const sorted = sortParcelsByStrategy(parcels, "fifo");
  expect(sorted.map((p) => p.date)).toEqual(["2023-01-01", "2024-01-01", "2024-03-01"]);
});

test("sortParcelsByStrategy lifo sorts by date descending", () => {
  const parcels = [
    makeParcel({ date: "2024-03-01" }),
    makeParcel({ date: "2023-01-01" }),
    makeParcel({ date: "2024-01-01" }),
  ];
  const sorted = sortParcelsByStrategy(parcels, "lifo");
  expect(sorted.map((p) => p.date)).toEqual(["2024-03-01", "2024-01-01", "2023-01-01"]);
});

test("sortParcelsByStrategy min-cost-base sorts lowest cost first", () => {
  const parcels = [
    makeParcel({ costBasePerUnit: 30 }),
    makeParcel({ costBasePerUnit: 10 }),
    makeParcel({ costBasePerUnit: 20 }),
  ];
  const sorted = sortParcelsByStrategy(parcels, "min-cost-base");
  expect(sorted.map((p) => p.costBasePerUnit)).toEqual([10, 20, 30]);
});

test("sortParcelsByStrategy max-cost-base sorts highest cost first", () => {
  const parcels = [
    makeParcel({ costBasePerUnit: 30 }),
    makeParcel({ costBasePerUnit: 10 }),
    makeParcel({ costBasePerUnit: 20 }),
  ];
  const sorted = sortParcelsByStrategy(parcels, "max-cost-base");
  expect(sorted.map((p) => p.costBasePerUnit)).toEqual([30, 20, 10]);
});

test("sortParcelsByStrategy min-taxable-income sorts highest cost first", () => {
  const parcels = [
    makeParcel({ costBasePerUnit: 30 }),
    makeParcel({ costBasePerUnit: 10 }),
  ];
  const sorted = sortParcelsByStrategy(parcels, "min-taxable-income");
  expect(sorted.map((p) => p.costBasePerUnit)).toEqual([30, 10]);
});

test("sortParcelsByStrategy max-taxable-income sorts lowest cost first", () => {
  const parcels = [
    makeParcel({ costBasePerUnit: 30 }),
    makeParcel({ costBasePerUnit: 10 }),
  ];
  const sorted = sortParcelsByStrategy(parcels, "max-taxable-income");
  expect(sorted.map((p) => p.costBasePerUnit)).toEqual([10, 30]);
});

// ─── matchTrades strategies ───────────────────────────────────────────────────

function buildAutoTrades(): Trade[] {
  return [
    makeTrade({ tradeId: "B1", date: "2023-01-01", units: 100, price: 10, brokerage: 0, total: 1000 }),
    makeTrade({ tradeId: "B2", date: "2023-06-01", units: 100, price: 20, brokerage: 0, total: 2000 }),
    makeTrade({ tradeId: "S1", date: "2024-01-15", action: "Sell", units: 100, price: 30, brokerage: 0, total: 3000 }),
  ];
}

test("matchTrades fifo matches oldest buy first", () => {
  const trades = buildAutoTrades();
  const result = matchTrades(trades, "fifo", 0.5);
  expect(result.matches).toHaveLength(1);
  expect(result.matches[0].buyTradeId).toBe("B1");
  expect(result.matches[0].sellProceeds).toBe(3000);
  expect(result.matches[0].buyCostBase).toBe(1000);
  expect(result.matches[0].capitalGain).toBe(2000);
  expect(result.matches[0].cgtDiscountEligible).toBe(true);
  expect(result.matches[0].discountedGain).toBe(1000);
});

test("matchTrades lifo matches newest buy first", () => {
  const trades = buildAutoTrades();
  const result = matchTrades(trades, "lifo", 0.5);
  expect(result.matches).toHaveLength(1);
  expect(result.matches[0].buyTradeId).toBe("B2");
  expect(result.matches[0].buyCostBase).toBe(2000);
  expect(result.matches[0].capitalGain).toBe(1000);
});

test("matchTrades min-cost-base matches lowest cost first", () => {
  const trades = buildAutoTrades();
  const result = matchTrades(trades, "min-cost-base", 0.5);
  expect(result.matches).toHaveLength(1);
  expect(result.matches[0].buyTradeId).toBe("B1");
});

test("matchTrades max-cost-base matches highest cost first", () => {
  const trades = buildAutoTrades();
  const result = matchTrades(trades, "max-cost-base", 0.5);
  expect(result.matches).toHaveLength(1);
  expect(result.matches[0].buyTradeId).toBe("B2");
});

// ─── Partial parcel matching ─────────────────────────────────────────────────

test("partial parcel matching: sell fewer units than available", () => {
  const trades = [
    makeTrade({ tradeId: "B1", date: "2023-01-01", units: 100, price: 10, brokerage: 0 }),
    makeTrade({ tradeId: "S1", date: "2024-01-15", action: "Sell", units: 40, price: 30, brokerage: 0 }),
  ];
  const result = matchTrades(trades, "fifo", 0.5);
  expect(result.matches).toHaveLength(1);
  expect(result.matches[0].units).toBe(40);
  expect(result.matches[0].sellProceeds).toBe(1200);
  expect(result.matches[0].buyCostBase).toBe(400);
  expect(result.remainingParcels).toHaveLength(1);
  expect(result.remainingParcels[0].unitsRemaining).toBe(60);
});

// ─── Unmatched sells ─────────────────────────────────────────────────────────

test("unmatched sells when no parcels are available", () => {
  const trades = [
    makeTrade({ tradeId: "S1", date: "2024-01-15", action: "Sell", units: 50, price: 30 }),
  ];
  const result = matchTrades(trades, "fifo", 0.5);
  expect(result.matches).toHaveLength(0);
  expect(result.unmatchedSells).toHaveLength(1);
  expect(result.unmatchedSells[0].tradeId).toBe("S1");
});

// ─── CGT discount eligibility ────────────────────────────────────────────────

test("CGT discount applied when held > 365 days", () => {
  const trades = [
    makeTrade({ tradeId: "B1", date: "2023-01-01", units: 100, price: 10, brokerage: 0 }),
    makeTrade({ tradeId: "S1", date: "2024-01-02", action: "Sell", units: 100, price: 30, brokerage: 0 }),
  ];
  const result = matchTrades(trades, "fifo", 0.5);
  expect(result.matches[0].cgtDiscountEligible).toBe(true);
  expect(result.matches[0].discountedGain).toBe(1000);
});

test("no CGT discount when held <= 365 days", () => {
  const trades = [
    makeTrade({ tradeId: "B1", date: "2024-01-01", units: 100, price: 10, brokerage: 0 }),
    makeTrade({ tradeId: "S1", date: "2024-12-31", action: "Sell", units: 100, price: 30, brokerage: 0 }),
  ];
  const result = matchTrades(trades, "fifo", 0.5);
  expect(result.matches[0].cgtDiscountEligible).toBe(false);
  expect(result.matches[0].discountedGain).toBe(2000);
});

// ─── calculateCgtSummary ─────────────────────────────────────────────────────

test("calculateCgtSummary aggregates correctly", () => {
  const matches: Match[] = [
    {
      sellTradeId: "S1",
      buyTradeId: "B1",
      code: "BHP",
      units: 100,
      sellDate: "2024-01-15",
      buyDate: "2023-01-01",
      sellProceeds: 3000,
      buyCostBase: 1000,
      capitalGain: 2000,
      cgtDiscountEligible: true,
      discountedGain: 1000,
    },
    {
      sellTradeId: "S2",
      buyTradeId: "B2",
      code: "BHP",
      units: 50,
      sellDate: "2024-06-01",
      buyDate: "2023-06-01",
      sellProceeds: 1500,
      buyCostBase: 1000,
      capitalGain: 500,
      cgtDiscountEligible: true,
      discountedGain: 250,
    },
  ];
  const summary = calculateCgtSummary({ matches, unmatchedSells: [], remainingParcels: [] });
  expect(summary.totalProceeds).toBe(4500);
  expect(summary.totalCostBase).toBe(2000);
  expect(summary.totalCapitalGain).toBe(2500);
  expect(summary.totalDiscountedGain).toBe(1250);
  expect(summary.totalDiscountAmount).toBe(1250);
  expect(summary.matchCount).toBe(2);
});

// ─── getFinancialYear & getFinancialYearLabel ─────────────────────────────────

test("getFinancialYear returns correct FY for dates before June", () => {
  expect(getFinancialYear("2024-01-15")).toBe(2024);
});

test("getFinancialYear returns correct FY for dates in/after June", () => {
  expect(getFinancialYear("2024-06-30")).toBe(2024);
  expect(getFinancialYear("2024-07-01")).toBe(2025);
});

test("getFinancialYear edge cases around June 30", () => {
  expect(getFinancialYear("2024-06-29")).toBe(2024);
  expect(getFinancialYear("2024-06-30")).toBe(2024);
  expect(getFinancialYear("2024-07-01")).toBe(2025);
});

test("getFinancialYearLabel formats correctly", () => {
  expect(getFinancialYearLabel(2024)).toBe("FY2023/24");
  expect(getFinancialYearLabel(2025)).toBe("FY2024/25");
  expect(getFinancialYearLabel(2000)).toBe("FY1999/00");
});

// ─── filterTradesByFinancialYear ─────────────────────────────────────────────

test("filterTradesByFinancialYear includes all buys and filters sells by FY", () => {
  const trades = [
    makeTrade({ tradeId: "B1", date: "2023-06-01", action: "Buy", code: "BHP" }),
    makeTrade({ tradeId: "B2", date: "2024-06-15", action: "Buy", code: "BHP" }),
    makeTrade({ tradeId: "S1", date: "2024-01-15", action: "Sell", code: "BHP" }),
    makeTrade({ tradeId: "S2", date: "2024-08-01", action: "Sell", code: "BHP" }),
  ];
  const filtered = filterTradesByFinancialYear(trades, 2024);
  const actions = filtered.map((t) => `${t.tradeId}:${t.action}`);
  expect(actions).toContain("B1:Buy");
  expect(actions).toContain("B2:Buy");
  expect(actions).toContain("S1:Sell");
  expect(actions).not.toContain("S2:Sell");
});

test("filterTradesByFinancialYear excludes sells outside FY range", () => {
  const trades = [
    makeTrade({ tradeId: "S1", date: "2023-07-01", action: "Sell" }),
    makeTrade({ tradeId: "S2", date: "2024-07-01", action: "Sell" }),
  ];
  const filtered = filterTradesByFinancialYear(trades, 2024);
  expect(filtered).toHaveLength(1);
  expect(filtered[0].tradeId).toBe("S1");
});

// ─── Manual matching with match_id ───────────────────────────────────────────

test("manual matching with match_id groups", () => {
  const trades = [
    makeTrade({ tradeId: "B1", matchId: "M1", date: "2023-01-01", units: 100, price: 10, brokerage: 0 }),
    makeTrade({ tradeId: "B2", matchId: "M1", date: "2023-06-01", units: 100, price: 20, brokerage: 0 }),
    makeTrade({ tradeId: "S1", matchId: "M1", date: "2024-01-15", action: "Sell", units: 150, price: 30, brokerage: 0 }),
  ];
  const result = matchTrades(trades, "manual", 0.5);
  expect(result.matches).toHaveLength(2);
  expect(result.matches.map((m) => m.buyTradeId).sort()).toEqual(["B1", "B2"]);
  expect(result.matches.map((m) => m.units).sort((a, b) => a - b)).toEqual([50, 100]);
});

test("manual matching ignores trades without match_id", () => {
  const trades = [
    makeTrade({ tradeId: "B1", matchId: "M1", date: "2023-01-01", units: 100, price: 10, brokerage: 0 }),
    makeTrade({ tradeId: "S1", matchId: "M1", date: "2024-01-15", action: "Sell", units: 100, price: 30, brokerage: 0 }),
    makeTrade({ tradeId: "S2", date: "2024-01-16", action: "Sell", units: 50, price: 30, brokerage: 0 }),
  ];
  const result = matchTrades(trades, "manual", 0.5);
  expect(result.matches).toHaveLength(1);
  expect(result.unmatchedSells).toHaveLength(1);
  expect(result.unmatchedSells[0].tradeId).toBe("S2");
});

// ─── parseCsvLine escaped quotes ────────────────────────────────────────────────

test("parseCsvLine handles escaped double-quotes inside quoted fields", () => {
  const csv = `${HEADER}\nT1,2024-01-15,Buy,"BHP ""Big Company""",100,20.00,10.00,2010.00,`;
  const trades = parseCsv(csv);
  expect(trades).toHaveLength(1);
  expect(trades[0].code).toBe('BHP "Big Company"');
});

test("parseCsv handles quoted headers with commas", () => {
  const header = 'trade_id,date,action,"code,name",units,price,brokerage,total,match_id';
  const csv = `${header}\nT1,2024-01-15,Buy,BHP,100,20.00,10.00,2010.00,`;
  const trades = parseCsv(csv);
  expect(trades).toHaveLength(1);
  expect(trades[0].tradeId).toBe("T1");
  expect(trades[0].date).toBe("2024-01-15");
  expect(trades[0].action).toBe("Buy");
});

// ─── total column fallback with 0 ──────────────────────────────────────────────

test("parseCsv preserves total of 0 instead of recalculating", () => {
  const csv = `${HEADER}\nT1,2024-01-15,Buy,BHP,100,20.00,10.00,0.00,`;
  const trades = parseCsv(csv);
  expect(trades).toHaveLength(1);
  expect(trades[0].total).toBe(0);
});

// ─── formatDate with invalid input ─────────────────────────────────────────────

test("formatDate returns raw string for invalid date input", () => {
  expect(formatDate("not-a-date")).toBe("not-a-date");
  expect(formatDate("")).toBe("");
});

// ─── future date validation ────────────────────────────────────────────────────

test("parseCsv rejects future sell dates", () => {
  const futureDate = "2030-01-01";
  const csv = `${HEADER}\nT1,${futureDate},Sell,BHP,100,20.00,10.00,2010.00,`;
  expect(() => parseCsv(csv)).toThrow(/cannot be in the future/);
});

test("parseCsv rejects future buy dates", () => {
  const futureDate = "2030-01-01";
  const csv = `${HEADER}\nT1,${futureDate},Buy,BHP,100,20.00,10.00,2010.00,`;
  expect(() => parseCsv(csv)).toThrow(/cannot be in the future/);
});

// ─── calculateCgtSummary computes totalCapitalLoss and carryForwardLoss ───────

test("calculateCgtSummary computes totalCapitalLoss and carryForwardLoss", () => {
  const trades = [
    makeTrade({ tradeId: "T1", date: "2024-01-15", action: "Buy", code: "BHP", units: 100, price: 20, brokerage: 10 }),
    makeTrade({ tradeId: "T2", date: "2024-06-15", action: "Sell", code: "BHP", units: 50, price: 15, brokerage: 5 }),
  ];

  const result = matchTrades(trades, "fifo", 0.5);
  const summary = calculateCgtSummary(result);

  expect(summary.totalCapitalLoss).toBeGreaterThan(0);
  expect(summary.totalCapitalGain).toBe(0);
  expect(summary.netCapitalGain).toBeLessThan(0);
  expect(summary.carryForwardLoss).toBeGreaterThan(0);
});

test("discount is not applied to capital losses", () => {
  const trades = [
    makeTrade({ tradeId: "T1", date: "2022-01-15", action: "Buy", code: "BHP", units: 100, price: 20, brokerage: 10 }),
    makeTrade({ tradeId: "T2", date: "2024-06-15", action: "Sell", code: "BHP", units: 50, price: 15, brokerage: 5 }),
  ];

  const result = matchTrades(trades, "fifo", 0.5);
  const match = result.matches[0];

  expect(match.capitalGain).toBeLessThan(0);
  expect(match.discountedGain).toBe(match.capitalGain);
  expect(match.capitalLoss).toBe(Math.abs(match.capitalGain));
});
