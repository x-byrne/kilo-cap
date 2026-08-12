import type { CgtSummary, Match, Trade } from "./types";

export function exportAtoReport(
  summary: CgtSummary,
  matches: Match[],
  trades: Trade[],
  fy: number | null,
): string {
  const lines: string[] = [];
  const pad = (n: number) => n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fyLabel = fy !== null ? getFinancialYearLabel(fy) : "All Financial Years";

  const totalCapitalLoss = matches
    .filter((m) => m.capitalGain < 0)
    .reduce((sum, m) => sum + Math.abs(m.capitalGain), 0);

  const netCapitalGain = summary.totalCapitalGain - totalCapitalLoss;
  const carryForwardLoss = netCapitalGain < 0 ? Math.abs(netCapitalGain) : 0;

  const eligibleMatches = matches.filter((m) => m.cgtDiscountEligible).length;
  const nonEligibleMatches = matches.filter((m) => !m.cgtDiscountEligible).length;

  const assetBreakdown = new Map<string, { proceeds: number; costBase: number; gain: number; discountedGain: number }>();
  for (const m of matches) {
    const entry = assetBreakdown.get(m.code) || { proceeds: 0, costBase: 0, gain: 0, discountedGain: 0 };
    entry.proceeds += m.sellProceeds;
    entry.costBase += m.buyCostBase;
    entry.gain += m.capitalGain;
    entry.discountedGain += m.discountedGain;
    assetBreakdown.set(m.code, entry);
  }

  lines.push("=".repeat(70));
  lines.push("            INDIVIDUAL TAX RETURN - CAPITAL GAINS REPORT");
  lines.push("            (ATO Question 18 - Capital Gains)");
  lines.push("=".repeat(70));
  lines.push("");
  lines.push(`Financial Year:    ${fyLabel}`);
  lines.push(`Generated:         ${new Date().toLocaleDateString("en-AU")}`);
  lines.push("");
  lines.push("-".repeat(70));
  lines.push("TAXPAYER SUMMARY");
  lines.push("-".repeat(70));
  lines.push(`  Total Proceeds:                      $${pad(summary.totalProceeds)}`);
  lines.push(`  Total Cost Base:                     $${pad(summary.totalCostBase)}`);
  lines.push(`  Gross Capital Gain:                  $${pad(summary.totalCapitalGain)}`);
  lines.push(`  Total Capital Losses:                $${pad(totalCapitalLoss)}`);
  lines.push(`  Total CGT Discount:                  $${pad(summary.totalDiscountAmount)}`);
  lines.push(`  Net Capital Gain (after discount):   $${pad(summary.totalDiscountedGain)}`);
  lines.push("");
  lines.push("-".repeat(70));
  lines.push("CAPITAL GAIN / LOSS BREAKDOWN BY ASSET CODE");
  lines.push("-".repeat(70));
  lines.push(
    `${"Asset Code".padEnd(12)} ${"Proceeds".padStart(14)} ${"Cost Base".padStart(14)} ${"Gain/Loss".padStart(14)} ${"After Discount".padStart(14)}`,
  );
  lines.push(
    `${"-".repeat(12)} ${"-".repeat(14)} ${"-".repeat(14)} ${"-".repeat(14)} ${"-".repeat(14)}`,
  );

  for (const [code, data] of assetBreakdown) {
    lines.push(
      `${code.padEnd(12)} ${pad(data.proceeds).padStart(14)} ${pad(data.costBase).padStart(14)} ${pad(data.gain).padStart(14)} ${pad(data.discountedGain).padStart(14)}`,
    );
  }
  lines.push("");

  lines.push("-".repeat(70));
  lines.push("CGT DISCOUNT ELIGIBILITY SUMMARY");
  lines.push("-".repeat(70));
  lines.push(`  Matches eligible for 50% CGT discount:     ${eligibleMatches}`);
  lines.push(`  Matches NOT eligible for CGT discount:     ${nonEligibleMatches}`);
  lines.push(`  Total matches:                             ${matches.length}`);
  lines.push("");

  lines.push("-".repeat(70));
  lines.push("NET CAPITAL GAIN / LOSS AFTER CGT DISCOUNT");
  lines.push("-".repeat(70));
  lines.push(`  Net Capital Gain:                          $${pad(summary.totalDiscountedGain)}`);
  lines.push(`  Capital Loss Carry-Forward to Next FY:    $${pad(carryForwardLoss)}`);
  lines.push("");

  if (summary.unmatchedSells.length > 0) {
    lines.push("-".repeat(70));
    lines.push("UNMATCHED SELLS WARNING");
    lines.push("-".repeat(70));
    lines.push("  The following sell trades could not be matched with buy trades.");
    lines.push("  These may require manual review for CGT purposes.");
    lines.push("");
    lines.push(
      `${"Trade ID".padEnd(20)} ${"Date".padStart(12)} ${"Code".padStart(10)} ${"Units".padStart(10)} ${"Proceeds".padStart(14)}`,
    );
    lines.push(
      `${"-".repeat(20)} ${"-".repeat(12)} ${"-".repeat(10)} ${"-".repeat(10)} ${"-".repeat(14)}`,
    );

    for (const s of summary.unmatchedSells) {
      const proceeds = s.price * s.units - s.brokerage;
      lines.push(
        `${s.tradeId.padEnd(20)} ${s.date.padStart(12)} ${s.code.padStart(10)} ${s.units.toString().padStart(10)} ${pad(proceeds).padStart(14)}`,
      );
    }
    lines.push("");
  }

  lines.push("=".repeat(70));
  lines.push("DISCLAIMER");
  lines.push("=".repeat(70));
  lines.push(
    "This report is a calculation tool only and does not constitute",
  );
  lines.push(
    "tax advice. Consult a registered tax agent for your tax return.",
  );
  lines.push("=".repeat(70));

  return lines.join("\n");
}

function getFinancialYearLabel(fy: number): string {
  const startYear = fy;
  const endYear = fy + 1;
  return `1 July ${startYear} - 30 June ${endYear}`;
}
