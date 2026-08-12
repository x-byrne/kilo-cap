/// <reference types="vitest" />
import { describe, it, expect } from "vitest";
import { calculateEstimatedTax } from "../taxEstimator";

describe("calculateEstimatedTax", () => {
  it("returns zeros for zero income and zero gain", () => {
    const result = calculateEstimatedTax(0, 0);
    expect(result.marginalRate).toBe(0);
    expect(result.taxOnGain).toBe(0);
    expect(result.totalTax).toBe(0);
    expect(result.effectiveRate).toBe(0);
  });

  it("calculates tax for income within first bracket with no gain", () => {
    const result = calculateEstimatedTax(18000, 0);
    expect(result.marginalRate).toBe(0);
    expect(result.taxOnGain).toBe(0);
    expect(result.totalTax).toBeCloseTo(360);
    expect(result.effectiveRate).toBeCloseTo(0.02);
  });

  it("calculates tax for income in second bracket with no gain", () => {
    const result = calculateEstimatedTax(30000, 0);
    const incomeTax = (30000 - 18200) * 0.19;
    const medicare = 30000 * 0.02;
    expect(result.marginalRate).toBe(0.19);
    expect(result.taxOnGain).toBe(0);
    expect(result.totalTax).toBeCloseTo(incomeTax + medicare);
    expect(result.effectiveRate).toBeCloseTo((incomeTax + medicare) / 30000);
  });

  it("calculates tax on gain within same bracket", () => {
    const result = calculateEstimatedTax(30000, 10000);
    const totalIncome = 40000;
    const incomeTax =
      (45000 - 18200) * 0.19 + (40000 - 45000) * 0.19;
    const medicare = totalIncome * 0.02;
    expect(result.marginalRate).toBe(0.19);
    expect(result.taxOnGain).toBeCloseTo(10000 * 0.19);
    expect(result.totalTax).toBeCloseTo(incomeTax + medicare);
  });

  it("calculates tax when gain pushes income into higher bracket", () => {
    const result = calculateEstimatedTax(50000, 60000);
    const totalIncome = 110000;
    const regularTax =
      (45000 - 18200) * 0.19 + (50000 - 45000) * 0.325;
    const totalIncomeTax =
      (45000 - 18200) * 0.19 +
      (50000 - 45000) * 0.325 +
      (110000 - 50000) * 0.325;
    const medicare = totalIncome * 0.02;
    expect(result.marginalRate).toBe(0.325);
    expect(result.taxOnGain).toBeCloseTo(totalIncomeTax - regularTax);
    expect(result.totalTax).toBeCloseTo(totalIncomeTax + medicare);
  });

  it("calculates tax for high income with capital gain", () => {
    const result = calculateEstimatedTax(200000, 50000);
    const totalIncome = 250000;
    const regularTax =
      (45000 - 18200) * 0.19 +
      (120000 - 45000) * 0.325 +
      (180000 - 120000) * 0.37 +
      (200000 - 180000) * 0.45;
    const totalIncomeTax =
      (45000 - 18200) * 0.19 +
      (120000 - 45000) * 0.325 +
      (180000 - 120000) * 0.37 +
      (250000 - 180000) * 0.45;
    const medicare = totalIncome * 0.02;
    expect(result.marginalRate).toBe(0.45);
    expect(result.taxOnGain).toBeCloseTo(totalIncomeTax - regularTax);
    expect(result.totalTax).toBeCloseTo(totalIncomeTax + medicare);
  });

  it("returns zero tax on gain for negative net capital gain", () => {
    const result = calculateEstimatedTax(50000, -10000);
    expect(result.taxOnGain).toBe(0);
    expect(result.totalTax).toBeLessThan(calculateEstimatedTax(50000, 0).totalTax);
  });

  it("calculates effective rate correctly", () => {
    const result = calculateEstimatedTax(50000, 10000);
    expect(result.effectiveRate).toBeCloseTo(result.totalTax / 60000);
  });
});
