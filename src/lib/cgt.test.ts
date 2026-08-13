import { test, expect } from "bun:test";
import {
  parseCsv,
  calculateCgtSummary,
  matchTrades,
} from "./cgt";

const HEADER =
  "trade_id,date,action,code,units,price,brokerage,total,match_id";

function makeTrade(overrides: Partial<import("./types").Trade> = {}): import("./types").Trade {
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
    makeTrade({ tradeId: "T1", date: "2024-01-15", action: "Buy", code: "BHP", units: 100, price: 20, brokerage: 10 }),
    makeTrade({ tradeId: "T2", date: "2024-06-15", action: "Sell", code: "BHP", units: 50, price: 15, brokerage: 5 }),
  ];

  const result = matchTrades(trades, "fifo");
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

  const result = matchTrades(trades, "fifo");
  const match = result.matches[0];

  expect(match.capitalGain).toBeLessThan(0);
  expect(match.discountedGain).toBe(match.capitalGain);
  expect(match.capitalLoss).toBe(Math.abs(match.capitalGain));
});
