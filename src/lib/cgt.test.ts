import { test, expect } from "bun:test";
import { parseCsv } from "./cgt";

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
