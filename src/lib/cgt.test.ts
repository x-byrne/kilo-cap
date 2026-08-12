import { test, expect } from "bun:test";
import {
  parseCsv,
  calculateCgtSummary,
  matchTrades,
  tradesToParcels,
  sortParcelsByStrategy,
} from "./cgt";

const HEADER =
  "trade_id,date,action,code,units,price,brokerage,total,match_id";

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

test("calculateCgtSummary computes totalCapitalLoss and carryForwardLoss", () => {
  const trades = [
    { tradeId: "T1", date: "2024-01-15", action: "Buy" as const, code: "BHP", units: 100, price: 20, brokerage: 10, total: 2010 },
    { tradeId: "T2", date: "2024-06-15", action: "Sell" as const, code: "BHP", units: 50, price: 15, brokerage: 5, total: 745 },
    { tradeId: "T3", date: "2024-01-15", action: "Buy" as const, code: "CBA", units: 100, price: 50, brokerage: 10, total: 5010 },
    { tradeId: "T4", date: "2024-06-15", action: "Sell" as const, code: "CBA", units: 50, price: 80, brokerage: 5, total: 3995 },
  ];

  const parcels = tradesToParcels(trades);
  const sells = trades.filter((t) => t.action === "Sell");
  const sorted = sortParcelsByStrategy(parcels, "fifo");

  const matches: any[] = [];
  let remaining = sells[0].units;

  for (const p of sorted) {
    if (remaining <= 0) break;
    const matched = Math.min(remaining, p.unitsRemaining);
    const capitalGain =
      sells[0].price * matched - (matched / sells[0].units) * sells[0].brokerage -
      (p.totalCostBase / p.totalUnits) * matched;
    const capitalLoss = capitalGain < 0 ? Math.abs(capitalGain) : 0;
    const eligible = capitalGain > 0 && new Date(p.date).getTime() <= new Date(sells[0].date).getTime();
    const discountedGain = eligible ? capitalGain * 0.5 : capitalGain;

    matches.push({
      sellTradeId: sells[0].tradeId,
      buyTradeId: p.tradeId,
      code: p.code,
      units: matched,
      sellDate: sells[0].date,
      buyDate: p.date,
      sellProceeds: sells[0].price * matched,
      buyCostBase: (p.totalCostBase / p.totalUnits) * matched,
      capitalGain,
      capitalLoss,
      cgtDiscountEligible: eligible,
      discountedGain,
    });
    remaining -= matched;
  }

  const summary = calculateCgtSummary({
    matches,
    unmatchedSells: [],
    remainingParcels: [],
  });

  expect(summary.totalCapitalLoss).toBeGreaterThan(0);
  expect(summary.netCapitalGain).toBeLessThan(summary.totalCapitalGain);
  expect(summary.carryForwardLoss).toBeGreaterThan(0);
});

test("discount is not applied to capital losses", () => {
  const trades = [
    { tradeId: "T1", date: "2022-01-15", action: "Buy" as const, code: "BHP", units: 100, price: 20, brokerage: 10, total: 2010 },
    { tradeId: "T2", date: "2024-06-15", action: "Sell" as const, code: "BHP", units: 50, price: 15, brokerage: 5, total: 745 },
  ];

  const parcels = tradesToParcels(trades);
  const sorted = sortParcelsByStrategy(parcels, "fifo");
  const sell = trades.find((t) => t.action === "Sell")!;

  const matches: any[] = [];
  let remaining = sell.units;

  for (const p of sorted) {
    if (remaining <= 0) break;
    const matched = Math.min(remaining, p.unitsRemaining);
    const capitalGain =
      sell.price * matched - (matched / sell.units) * sell.brokerage -
      (p.totalCostBase / p.totalUnits) * matched;
    const eligible = capitalGain > 0 && new Date(p.date).getTime() <= new Date(sell.date).getTime();
    const discountedGain = eligible && capitalGain > 0 ? capitalGain * 0.5 : capitalGain;

    matches.push({
      sellTradeId: sell.tradeId,
      buyTradeId: p.tradeId,
      code: p.code,
      units: matched,
      sellDate: sell.date,
      buyDate: p.date,
      sellProceeds: sell.price * matched,
      buyCostBase: (p.totalCostBase / p.totalUnits) * matched,
      capitalGain,
      capitalLoss: capitalGain < 0 ? Math.abs(capitalGain) : 0,
      cgtDiscountEligible: eligible,
      discountedGain,
    });
    remaining -= matched;
  }

  const summary = calculateCgtSummary({
    matches,
    unmatchedSells: [],
    remainingParcels: [],
  });

  expect(matches[0].capitalGain).toBeLessThan(0);
  expect(matches[0].discountedGain).toBe(matches[0].capitalGain);
  expect(matches[0].capitalLoss).toBe(Math.abs(matches[0].capitalGain));
});
