import { describe, it, expect } from "vitest";
import {
  parseCsv,
  isCgtDiscountEligible,
  sortParcelsByStrategy,
  matchAutomatic,
  matchTrades,
  calculateCgtSummary,
  getHeldDays,
  MS_PER_DAY,
} from "../cgt";
import type { Parcel, Trade } from "../types";

describe("parseCsv", () => {
  it("parses valid CSV rows", () => {
    const csv = `trade_id,match_id,date,action,code,units,price,brokerage,total
T001,,2021-01-20,Buy,LRSOC,135175,0.03905,9.5,5288.06
T002,,2021-01-20,Buy,LRSOC,110888,0.043,9.5,4777.68`;
    const trades = parseCsv(csv);
    expect(trades).toHaveLength(2);
    expect(trades[0].code).toBe("LRSOC");
    expect(trades[0].units).toBeCloseTo(135175);
    expect(trades[0].price).toBeCloseTo(0.03905);
  });

  it("throws on invalid date", () => {
    expect(() =>
      parseCsv(`trade_id,date,action,code,units,price,brokerage,total
T001,not-a-date,Buy,XYZ,100,1,0,100`),
    ).toThrow("Invalid date");
  });

  it("throws on negative units", () => {
    expect(() =>
      parseCsv(`trade_id,date,action,code,units,price,brokerage,total
T001,2021-01-20,Buy,XYZ,-10,1,0,-10`),
    ).toThrow("Invalid units");
  });

  it("throws on zero units", () => {
    expect(() =>
      parseCsv(`trade_id,date,action,code,units,price,brokerage,total
T001,2021-01-20,Buy,XYZ,0,1,0,0`),
    ).toThrow("Invalid units");
  });

  it("throws on negative price", () => {
    expect(() =>
      parseCsv(`trade_id,date,action,code,units,price,brokerage,total
T001,2021-01-20,Buy,XYZ,10,-5,0,-50`),
    ).toThrow("Invalid price");
  });

  it("throws on non-numeric price", () => {
    expect(() =>
      parseCsv(`trade_id,date,action,code,units,price,brokerage,total
T001,2021-01-20,Buy,XYZ,10,abc,0,0`),
    ).toThrow("Invalid price");
  });

  it("throws on negative brokerage", () => {
    expect(() =>
      parseCsv(`trade_id,date,action,code,units,price,brokerage,total
T001,2021-01-20,Buy,XYZ,10,1,-5,-5`),
    ).toThrow("Invalid brokerage");
  });

  it("throws on invalid total", () => {
    expect(() =>
      parseCsv(`trade_id,date,action,code,units,price,brokerage,total
T001,2021-01-20,Buy,XYZ,10,1,0,-5`),
    ).toThrow("Invalid total");
  });

  it("skips rows with invalid action", () => {
    const csv = `trade_id,date,action,code,units,price,brokerage,total
T001,2021-01-20,Buy,XYZ,10,1,0,10
T002,2021-01-21,Hold,XYZ,10,1,0,10`;
    const trades = parseCsv(csv);
    expect(trades).toHaveLength(1);
  });
});

describe("isCgtDiscountEligible", () => {
  it("returns true when held > 12 months", () => {
    expect(
      isCgtDiscountEligible("2020-01-01", "2021-06-01"),
    ).toBe(true);
  });

  it("returns false when held <= 12 months", () => {
    expect(
      isCgtDiscountEligible("2021-01-01", "2021-06-01"),
    ).toBe(false);
  });

  it("returns false when held exactly 12 months", () => {
    expect(
      isCgtDiscountEligible("2020-06-01", "2021-06-01"),
    ).toBe(false);
  });
});

describe("sortParcelsByStrategy", () => {
  const parcels: Parcel[] = [
    { tradeId: "B1", date: "2021-01-01", code: "XYZ", unitsRemaining: 100, totalUnits: 100, costBasePerUnit: 10, totalCostBase: 1000 },
    { tradeId: "B2", date: "2021-06-01", code: "XYZ", unitsRemaining: 100, totalUnits: 100, costBasePerUnit: 5, totalCostBase: 500 },
    { tradeId: "B3", date: "2022-01-01", code: "XYZ", unitsRemaining: 100, totalUnits: 100, costBasePerUnit: 15, totalCostBase: 1500 },
  ];

  it("sorts fifo by date ascending", () => {
    const sorted = sortParcelsByStrategy(parcels, "fifo");
    expect(sorted[0].tradeId).toBe("B1");
    expect(sorted[2].tradeId).toBe("B3");
  });

  it("sorts lifo by date descending", () => {
    const sorted = sortParcelsByStrategy(parcels, "lifo");
    expect(sorted[0].tradeId).toBe("B3");
    expect(sorted[2].tradeId).toBe("B1");
  });

  it("sorts min-cost-base ascending", () => {
    const sorted = sortParcelsByStrategy(parcels, "min-cost-base");
    expect(sorted[0].costBasePerUnit).toBe(5);
    expect(sorted[2].costBasePerUnit).toBe(15);
  });

  it("sorts max-cost-base descending", () => {
    const sorted = sortParcelsByStrategy(parcels, "max-cost-base");
    expect(sorted[0].costBasePerUnit).toBe(15);
    expect(sorted[2].costBasePerUnit).toBe(5);
  });
});

describe("matchAutomatic", () => {
  const trades: Trade[] = [
    {
      tradeId: "B1",
      matchId: "",
      date: "2021-01-01",
      action: "Buy",
      code: "XYZ",
      units: 100,
      price: 10,
      brokerage: 10,
      total: 1010,
    },
    {
      tradeId: "S1",
      matchId: "",
      date: "2021-06-01",
      action: "Sell",
      code: "XYZ",
      units: 50,
      price: 15,
      brokerage: 5,
      total: 745,
    },
  ];

  it("matches buys to sells with fifo", () => {
    const result = matchAutomatic(trades, "fifo");
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].units).toBe(50);
    expect(result.remainingParcels[0].unitsRemaining).toBe(50);
    expect(result.unmatchedSells).toHaveLength(0);
  });

  it("returns unmatched sells when no parcels available", () => {
    const unmatchedTrades: Trade[] = [
      {
        tradeId: "S1",
        matchId: "",
        date: "2021-06-01",
        action: "Sell",
        code: "XYZ",
        units: 50,
        price: 15,
        brokerage: 5,
        total: 745,
      },
    ];
    const result = matchAutomatic(unmatchedTrades, "fifo");
    expect(result.matches).toHaveLength(0);
    expect(result.unmatchedSells).toHaveLength(1);
  });
});

describe("calculateCgtSummary", () => {
  it("calculates totals from matches and preserves unmatched data", () => {
    const result = {
      matches: [
        {
          sellTradeId: "S1",
          buyTradeId: "B1",
          code: "XYZ",
          units: 50,
          sellDate: "2021-06-01",
          buyDate: "2021-01-01",
          sellProceeds: 745,
          buyCostBase: 505,
          capitalGain: 240,
          cgtDiscountEligible: true,
          discountedGain: 120,
        } as const,
      ],
      unmatchedSells: [
        {
          tradeId: "S2",
          matchId: "",
          date: "2021-07-01",
          action: "Sell" as const,
          code: "XYZ",
          units: 20,
          price: 15,
          brokerage: 5,
          total: 295,
        },
      ],
      remainingParcels: [
        {
          tradeId: "B2",
          date: "2021-02-01",
          code: "XYZ",
          unitsRemaining: 50,
          totalUnits: 100,
          costBasePerUnit: 10,
          totalCostBase: 1000,
        },
      ],
    };

    const summary = calculateCgtSummary(result);
    expect(summary.totalProceeds).toBeCloseTo(745);
    expect(summary.totalCostBase).toBeCloseTo(505);
    expect(summary.totalCapitalGain).toBeCloseTo(240);
    expect(summary.totalDiscountedGain).toBeCloseTo(120);
    expect(summary.matchCount).toBe(1);
    expect(summary.unmatchedSells).toHaveLength(1);
    expect(summary.remainingParcels).toHaveLength(1);
  });
});

describe("getHeldDays", () => {
  it("calculates days between dates", () => {
    expect(getHeldDays("2021-01-01", "2021-01-31")).toBe(30);
  });

  it("uses MS_PER_DAY constant", () => {
    const days = getHeldDays("2021-01-01", "2021-01-02");
    expect(days).toBe(Math.round(MS_PER_DAY / MS_PER_DAY));
  });
});

describe("matchTrades", () => {
  it("delegates to matchAutomatic for non-manual strategies", () => {
    const trades: Trade[] = [
      {
        tradeId: "B1",
        matchId: "",
        date: "2021-01-01",
        action: "Buy",
        code: "XYZ",
        units: 100,
        price: 10,
        brokerage: 10,
        total: 1010,
      },
      {
        tradeId: "S1",
        matchId: "",
        date: "2021-06-01",
        action: "Sell",
        code: "XYZ",
        units: 50,
        price: 15,
        brokerage: 5,
        total: 745,
      },
    ];
    const result = matchTrades(trades, "fifo");
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].units).toBe(50);
  });
});
