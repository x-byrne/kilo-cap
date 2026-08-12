import type { Match, Trade } from "./types";

export interface CarriedLosses {
  totalCapitalLosses: number;
  lossesAppliedThisFy: number;
  carriedForward: number;
}

export function exportAtoCsv(
  matches: Match[],
  unmatchedSells: Trade[],
  carriedLosses: CarriedLosses,
  strategy: string,
  fy: number | null,
): string {
  const lines: string[] = [];
  const disclaimer = "Estimate only — consult a registered tax agent";
  const fyLabel = fy != null ? `FY${fy - 1}/${String(fy).slice(2)}` : "All Years";

  lines.push(disclaimer);
  lines.push(`Report Type,ATO CGT Report`);
  lines.push(`Financial Year,${fyLabel}`);
  lines.push(`Matching Strategy,${strategy}`);
  lines.push(`Generated,${new Date().toISOString().split("T")[0]}`);
  lines.push("");

  lines.push("=== SUMMARY ===");
  const totalProceeds = matches.reduce((s, m) => s + m.sellProceeds, 0);
  const totalCostBase = matches.reduce((s, m) => s + m.buyCostBase, 0);
  const totalGrossGain = totalProceeds - totalCostBase;
  const totalDiscountAmount = matches.reduce(
    (s, m) => s + (m.cgtDiscountEligible ? m.capitalGain * 0.5 : 0),
    0);
  const totalNetGain = totalGrossGain - totalDiscountAmount;
  const lossOffset = carriedLosses.lossesAppliedThisFy;
  const taxableGain = Math.max(0, totalNetGain - lossOffset);

  lines.push(`Total Proceeds,${totalProceeds.toFixed(2)}`);
  lines.push(`Cost Base,${totalCostBase.toFixed(2)}`);
  lines.push(`Gross Capital Gain,${totalGrossGain.toFixed(2)}`);
  lines.push(`CGT Discount,${totalDiscountAmount.toFixed(2)}`);
  lines.push(`Net Capital Gain,${totalNetGain.toFixed(2)}`);
  lines.push(`Loss Offset,${lossOffset.toFixed(2)}`);
  lines.push(`Taxable Gain,${taxableGain.toFixed(2)}`);
  lines.push("");

  lines.push("=== MATCHED TRADES ===");
  lines.push([
    "Asset Code",
    "Buy Date",
    "Sell Date",
    "Units",
    "Proceeds",
    "Cost Base",
    "Capital Gain",
    "Discount %",
    "Loss Offset",
    "Net Gain",
  ].join(","));

  for (const m of matches) {
    const discountPct = m.cgtDiscountEligible ? "50%" : "0%";
    const lossApplied = m.capitalGain < 0 ? Math.abs(m.capitalGain).toFixed(2) : "0.00";
    const netGain = m.discountedGain < 0
      ? Math.max(0, m.discountedGain + parseFloat(lossApplied)).toFixed(2)
      : m.discountedGain.toFixed(2);
    lines.push([
      m.code,
      m.buyDate,
      m.sellDate,
      m.units.toFixed(2),
      m.sellProceeds.toFixed(2),
      m.buyCostBase.toFixed(2),
      m.capitalGain.toFixed(2),
      discountPct,
      lossApplied,
      netGain,
    ].join(","));
  }
  lines.push("");

  lines.push("=== UNMATCHED SELLS ===");
  lines.push([
    "Trade ID",
    "Code",
    "Date",
    "Units",
    "Proceeds",
  ].join(","));
  for (const s of unmatchedSells) {
    const proceeds = s.price * s.units - s.brokerage;
    lines.push([
      s.tradeId,
      s.code,
      s.date,
      s.units.toFixed(2),
      proceeds.toFixed(2),
    ].join(","));
  }
  lines.push("");

  lines.push("=== PER-ASSET SUMMARY ===");
  lines.push([
    "Asset Code",
    "Total Proceeds",
    "Total Cost Base",
    "Gross Gain",
    "Discount",
    "Net Gain",
    "Matches",
  ].join(","));
  const byAsset = new Map<string, Match[]>();
  for (const m of matches) {
    const group = byAsset.get(m.code) || [];
    group.push(m);
    byAsset.set(m.code, group);
  }
  for (const [code, group] of byAsset) {
    const p = group.reduce((s, m) => s + m.sellProceeds, 0);
    const c = group.reduce((s, m) => s + m.buyCostBase, 0);
    const g = p - c;
    const d = group.reduce((s, m) => s + (m.cgtDiscountEligible ? m.capitalGain * 0.5 : 0), 0);
    const n = g - d;
    lines.push([
      code,
      p.toFixed(2),
      c.toFixed(2),
      g.toFixed(2),
      d.toFixed(2),
      n.toFixed(2),
      String(group.length),
    ].join(","));
  }
  lines.push("");

  lines.push("=== PER-FY SUMMARY ===");
  lines.push([
    "Financial Year",
    "Total Proceeds",
    "Total Cost Base",
    "Gross Gain",
    "CGT Discount",
    "Net Gain",
    "Capital Losses Applied",
    "Taxable Gain",
  ].join(","));
  const byFy = new Map<number, Match[]>();
  for (const m of matches) {
    const mFy = getFinancialYear(m.sellDate);
    const group = byFy.get(mFy) || [];
    group.push(m);
    byFy.set(mFy, group);
  }
  for (const [mFy, group] of byFy) {
    const p = group.reduce((s, m) => s + m.sellProceeds, 0);
    const c = group.reduce((s, m) => s + m.buyCostBase, 0);
    const gross = p - c;
    const discount = group.reduce((s, m) => s + (m.cgtDiscountEligible ? m.capitalGain * 0.5 : 0), 0);
    const netGain = gross - discount;
    const losses = group.filter(m => m.capitalGain < 0).reduce((s, m) => s + Math.abs(m.capitalGain), 0);
    const taxable = Math.max(0, netGain - losses);
    lines.push([
      `FY${mFy - 1}/${String(mFy).slice(2)}`,
      p.toFixed(2),
      c.toFixed(2),
      gross.toFixed(2),
      discount.toFixed(2),
      netGain.toFixed(2),
      losses.toFixed(2),
      taxable.toFixed(2),
    ].join(","));
  }
  lines.push("");

  lines.push("=== CAPITAL LOSSES APPLIED ===");
  lines.push(`Total Capital Losses Available,${carriedLosses.totalCapitalLosses.toFixed(2)}`);
  lines.push(`Losses Applied This FY,${carriedLosses.lossesAppliedThisFy.toFixed(2)}`);
  lines.push(`Remaining Carry-Forward,${carriedLosses.carriedForward.toFixed(2)}`);
  lines.push("");
  lines.push("Loss Details:");
  lines.push(["Match", "Asset Code", "Buy Date", "Sell Date", "Units", "Capital Loss"].join(","));
  let lossIdx = 0;
  for (const m of matches) {
    if (m.capitalGain < 0) {
      lossIdx++;
      lines.push([
        `L${lossIdx}`,
        m.code,
        m.buyDate,
        m.sellDate,
        m.units.toFixed(2),
        Math.abs(m.capitalGain).toFixed(2),
      ].join(","));
    }
  }

  return lines.join("\n");
}

function getFinancialYear(dateStr: string): number {
  const d = new Date(dateStr);
  return d.getMonth() >= 6 ? d.getFullYear() + 1 : d.getFullYear();
}
