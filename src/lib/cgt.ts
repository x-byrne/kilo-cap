import type {
  Action,
  BrokerFormat,
  CgtSummary,
  Match,
  MatchStrategy,
  Parcel,
  Trade,
} from "./types";

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const CGT_DISCOUNT_DAYS = 365;

const YYYY_MM_DD_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateDate(dateStr: string | undefined, row: number): string {
  if (!dateStr) {
    return `Row ${row}: date is required`;
  }
  if (!YYYY_MM_DD_RE.test(dateStr)) {
    return `Row ${row}: date must be in YYYY-MM-DD format, got "${dateStr}"`;
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    return `Row ${row}: date is invalid, got "${dateStr}"`;
  }
  return "";
}

export function parseCsv(csv: string): Trade[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];

  const headerLine = lines[0].toLowerCase();
  const headers = headerLine.split(",").map((h) => h.trim());

  const tradeIdIdx = headers.indexOf("trade_id");
  const matchIdIdx = headers.indexOf("match_id");
  const dateIdx = headers.indexOf("date");
  const actionIdx = headers.indexOf("action");
  const codeIdx = headers.indexOf("code");
  const unitsIdx = headers.indexOf("units");
  const priceIdx = headers.indexOf("price");
  const brokerageIdx = headers.indexOf("brokerage");
  const totalIdx = headers.indexOf("total");

  if (tradeIdIdx === -1 || dateIdx === -1 || actionIdx === -1) {
    throw new Error(
      "CSV must contain at least trade_id, date, and action columns",
    );
  }

  const hasTotalColumn = totalIdx !== -1;
  if (!hasTotalColumn) {
    console.warn(
      "CSV is missing the 'total' column. It will be calculated automatically from units, price, and brokerage.",
    );
  }

  const seenTradeIds = new Set<string>();
  const trades: Trade[] = [];
  const warnings: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCsvLine(line);
    const rawAction = values[actionIdx]?.trim();
    if (rawAction !== "Buy" && rawAction !== "Sell") {
      console.warn(
        `Row ${i + 1}: unrecognised action "${rawAction}" — skipping`,
      );
      continue;
    }
    const action = rawAction as Action;

    const dateErr = validateDate(values[dateIdx]?.trim(), i + 1);
    if (dateErr) {
      throw new Error(dateErr);
    }

    const unitsRaw = values[unitsIdx]?.trim();
    const priceRaw = values[priceIdx]?.trim();
    const units = parseFloat(unitsRaw || "0");
    const price = parseFloat(priceRaw || "0");

    if (units <= 0 || Number.isNaN(units)) {
      throw new Error(
        `Row ${i + 1}: units must be a positive number, got "${unitsRaw}"`,
      );
    }
    if (price <= 0 || Number.isNaN(price)) {
      throw new Error(
        `Row ${i + 1}: price must be a positive number, got "${priceRaw}"`,
      );
    }

    const brokerageRaw = values[brokerageIdx]?.trim();
    const brokerage = parseFloat(brokerageRaw || "0");

    if (action === "Sell" && (Number.isNaN(brokerage) || brokerage === 0)) {
      warnings.push(
        `Row ${i + 1}: sell trade has no brokerage — brokerage reduces sale proceeds and affects capital gains`,
      );
    }

    const total = hasTotalColumn
      ? parseFloat(values[totalIdx] || "0")
      : units * price + (action === "Buy" ? brokerage : -brokerage);

    const tradeId = values[tradeIdIdx]?.trim() || `T${i}`;
    if (seenTradeIds.has(tradeId)) {
      throw new Error(
        `Row ${i + 1}: duplicate trade_id "${tradeId}" found in CSV`,
      );
    }
    seenTradeIds.add(tradeId);

    trades.push({
      tradeId,
      matchId: values[matchIdIdx]?.trim() || "",
      date: values[dateIdx]?.trim()!,
      action,
      code: values[codeIdx]?.trim() || "",
      units,
      price,
      brokerage,
      total: total || units * price + (action === "Buy" ? brokerage : -brokerage),
    });
  }

  for (const w of warnings) {
    console.warn(w);
  }

  return trades;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function detectBrokerFormat(csvText: string): {
  format: BrokerFormat;
  hint: string;
} {
  const lines = csvText.trim().split("\n");
  if (lines.length === 0) {
    return {
      format: "generic",
      hint: "Generic format — please ensure columns match: trade_id, match_id, date, action, code, units, price, brokerage, total",
    };
  }

  const headerLine = lines[0].toLowerCase();
  const headers = headerLine.split(",").map((h) => h.trim());

  const hasCol = (name: string) => headers.includes(name);

  if (hasCol("reference") && (hasCol("debit") || hasCol("credit"))) {
    return {
      format: "commsec",
      hint: "Detected: CommSec format — map Reference → trade_id, Date → date, Debit/Credit → action+price, Code → code, Quantity → units, Brokerage → brokerage, Total → total",
    };
  }

  if (hasCol("activity")) {
    return {
      format: "selfwealth",
      hint: "Detected: SelfWealth format — map Date → date, Activity → action, Code → code, Quantity → units, Price → price, Amount → total, Brokerage → brokerage",
    };
  }

  if (hasCol("type") && !hasCol("action")) {
    return {
      format: "stake",
      hint: "Detected: Stake format — map Date → date, Type → action, Code → code, Quantity → units, Price → price, Fees → brokerage, Amount → total",
    };
  }

  if (hasCol("order id")) {
    return {
      format: "tradezero",
      hint: "Detected: TradeZero format — map Date → date, Order ID → trade_id, Type → action, Symbol → code, Quantity → units, Price → price, Commission → brokerage, Net Amount → total",
    };
  }

  if (
    hasCol("trade_id") &&
    hasCol("date") &&
    hasCol("action") &&
    hasCol("code") &&
    hasCol("units") &&
    hasCol("price") &&
    hasCol("brokerage") &&
    hasCol("total")
  ) {
    return {
      format: "generic",
      hint: "Generic format — columns matched successfully. Ready to calculate.",
    };
  }

  return {
    format: "generic",
    hint: "Generic format — please ensure columns match: trade_id, match_id, date, action, code, units, price, brokerage, total",
  };
}

export function tradesToParcels(trades: Trade[]): Parcel[] {
  return trades
    .filter((t) => t.action === "Buy")
    .map((t) => {
      const costBasePerUnit =
        t.units > 0 ? (t.units * t.price + t.brokerage) / t.units : 0;
      return {
        tradeId: t.tradeId,
        date: t.date,
        code: t.code,
        unitsRemaining: t.units,
        totalUnits: t.units,
        costBasePerUnit,
        totalCostBase: t.units * t.price + t.brokerage,
      };
    });
}

export function isCgtDiscountEligible(
  acquisitionDate: string,
  disposalDate: string,
): boolean {
  const acq = new Date(acquisitionDate);
  const disp = new Date(disposalDate);
  const diffDays = (disp.getTime() - acq.getTime()) / MS_PER_DAY;
  return diffDays > CGT_DISCOUNT_DAYS;
}

export function sortParcelsByStrategy(
  parcels: Parcel[],
  strategy: MatchStrategy,
): Parcel[] {
  const sorted = [...parcels];
  switch (strategy) {
    case "fifo":
      sorted.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
      break;
    case "lifo":
      sorted.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
      break;
    case "min-cost-base":
      // Lowest cost base first -> maximises gains
      sorted.sort((a, b) => a.costBasePerUnit - b.costBasePerUnit);
      break;
    case "max-cost-base":
      // Highest cost base first -> minimises gains
      sorted.sort((a, b) => b.costBasePerUnit - a.costBasePerUnit);
      break;
    case "min-taxable-income":
      // Minimise taxable income: prefer parcels that result in smallest taxable amount
      // After CGT discount, taxable = gain * (eligible ? 0.5 : 1)
      // Sort by effective cost base descending (highest cost = lowest gain)
      // Break ties by preferring discount-eligible (held > 12 months)
      sorted.sort((a, b) => {
        // Higher cost base -> lower gain -> lower taxable income
        if (a.costBasePerUnit !== b.costBasePerUnit) {
          return b.costBasePerUnit - a.costBasePerUnit;
        }
        // Prefer older parcels (more likely to be CGT discount eligible)
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });
      break;
    case "max-taxable-income":
      // Maximise taxable income: prefer parcels that result in largest taxable amount
      sorted.sort((a, b) => {
        // Lower cost base -> higher gain -> higher taxable income
        if (a.costBasePerUnit !== b.costBasePerUnit) {
          return a.costBasePerUnit - b.costBasePerUnit;
        }
        // Prefer newer parcels (less likely to be CGT discount eligible)
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });
      break;
    case "manual":
      // Manual matching doesn't use automatic parcel sorting
      break;
  }
  return sorted;
}

export function matchTrades(
  trades: Trade[],
  strategy: MatchStrategy,
): { matches: Match[]; unmatchedSells: Trade[]; remainingParcels: Parcel[] } {
  if (strategy === "manual") {
    return matchManual(trades);
  }
  return matchAutomatic(trades, strategy);
}

function matchManual(trades: Trade[]): {
  matches: Match[];
  unmatchedSells: Trade[];
  remainingParcels: Parcel[];
} {
  // Group trades by match_id
  const matchGroups = new Map<string, Trade[]>();
  const unmatchedSells: Trade[] = [];

  for (const trade of trades) {
    if (trade.matchId) {
      const group = matchGroups.get(trade.matchId) || [];
      group.push(trade);
      matchGroups.set(trade.matchId, group);
    }
  }

  const matches: Match[] = [];
  const usedBuyIds = new Set<string>();

  for (const [_matchId, group] of matchGroups) {
    const buys = group.filter((t) => t.action === "Buy");
    const sells = group.filter((t) => t.action === "Sell");

    for (const sell of sells) {
      let remainingSellUnits = sell.units;

      for (const buy of buys) {
        if (remainingSellUnits <= 0) break;
        usedBuyIds.add(buy.tradeId);

        const availableUnits = buy.units;
        const matchedUnits = Math.min(remainingSellUnits, availableUnits);
        remainingSellUnits -= matchedUnits;

        const sellProceeds =
          (sell.price * matchedUnits) +
          (matchedUnits / sell.units) * sell.brokerage;
        // For sells, brokerage reduces proceeds
        const netProceeds =
          sell.price * matchedUnits -
          (matchedUnits / sell.units) * sell.brokerage;
        const buyCostBase =
          buy.price * matchedUnits +
          (matchedUnits / buy.units) * buy.brokerage;

        const capitalGain = netProceeds - buyCostBase;
        const eligible = isCgtDiscountEligible(buy.date, sell.date);
        const discountedGain = eligible ? capitalGain * 0.5 : capitalGain;

        matches.push({
          sellTradeId: sell.tradeId,
          buyTradeId: buy.tradeId,
          code: sell.code,
          units: matchedUnits,
          sellDate: sell.date,
          buyDate: buy.date,
          sellProceeds: netProceeds,
          buyCostBase,
          capitalGain,
          isLoss: capitalGain < 0,
          cgtDiscountEligible: eligible,
          discountedGain,
        });
      }

      if (remainingSellUnits > 0) {
        unmatchedSells.push({
          ...sell,
          units: remainingSellUnits,
          total: sell.price * remainingSellUnits,
        });
      }
    }
  }

  // Check for sells without match_id
  const sellsNoMatch = trades.filter(
    (t) => t.action === "Sell" && !t.matchId,
  );
  unmatchedSells.push(...sellsNoMatch);

  // Remaining parcels are buys not used in manual matching
  const allBuys = trades.filter((t) => t.action === "Buy");
  const remainingParcels = tradesToParcels(
    allBuys.filter((b) => !usedBuyIds.has(b.tradeId)),
  );

  return { matches, unmatchedSells, remainingParcels };
}

function matchAutomatic(
  trades: Trade[],
  strategy: MatchStrategy,
): { matches: Match[]; unmatchedSells: Trade[]; remainingParcels: Parcel[] } {
  const parcels = tradesToParcels(trades);
  const sells = trades
    .filter((t) => t.action === "Sell")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const matches: Match[] = [];
  const unmatchedSells: Trade[] = [];

  // Group parcels by code
  const parcelsByCode = new Map<string, Parcel[]>();
  for (const p of parcels) {
    const group = parcelsByCode.get(p.code) || [];
    group.push(p);
    parcelsByCode.set(p.code, group);
  }

  for (const sell of sells) {
    const codeParcels = parcelsByCode.get(sell.code) || [];
    const availableParcels = codeParcels.filter(
      (p) =>
        p.unitsRemaining > 0 &&
        new Date(p.date).getTime() <= new Date(sell.date).getTime(),
    );

    if (availableParcels.length === 0) {
      unmatchedSells.push(sell);
      continue;
    }

    const sortedParcels = sortParcelsByStrategy(availableParcels, strategy);
    let remainingSellUnits = sell.units;
    let totalSellBrokerageAllocated = 0;

    for (const parcel of sortedParcels) {
      if (remainingSellUnits <= 0) break;

      const matchedUnits = Math.min(remainingSellUnits, parcel.unitsRemaining);
      const updatedParcel = { ...parcel, unitsRemaining: parcel.unitsRemaining - matchedUnits };
      remainingSellUnits -= matchedUnits;

      const sellBrokeragePortion =
        (matchedUnits / sell.units) * sell.brokerage;
      totalSellBrokerageAllocated += sellBrokeragePortion;

      const netProceeds = sell.price * matchedUnits - sellBrokeragePortion;
      const buyCostBase =
        (updatedParcel.totalCostBase / updatedParcel.totalUnits) * matchedUnits;

      const capitalGain = netProceeds - buyCostBase;
      const eligible = isCgtDiscountEligible(parcel.date, sell.date);
      const discountedGain = eligible ? capitalGain * 0.5 : capitalGain;

      matches.push({
        sellTradeId: sell.tradeId,
        buyTradeId: parcel.tradeId,
        code: sell.code,
        units: matchedUnits,
        sellDate: sell.date,
        buyDate: parcel.date,
        sellProceeds: netProceeds,
        buyCostBase,
        capitalGain,
        isLoss: capitalGain < 0,
        cgtDiscountEligible: eligible,
        discountedGain,
      });
    }

    if (remainingSellUnits > 0) {
      unmatchedSells.push({
        ...sell,
        units: remainingSellUnits,
        total: sell.price * remainingSellUnits - sell.brokerage * (remainingSellUnits / sell.units),
      });
    }
  }

  const remainingParcels = parcels.filter((p) => p.unitsRemaining > 0);

  return { matches, unmatchedSells, remainingParcels };
}

export function calculateCgtSummary(
  matches: Match[],
  unmatchedSells: Trade[],
  remainingParcels: Parcel[],
): CgtSummary {
  const lossSummary = calculateLossOffsets(matches);
  return {
    totalProceeds: lossSummary.totalProceeds,
    totalCostBase: lossSummary.totalCostBase,
    totalCapitalGain: lossSummary.totalCapitalGain,
    totalDiscountedGain: lossSummary.totalDiscountedGain,
    totalDiscountAmount: lossSummary.totalDiscountAmount,
    matchCount: lossSummary.matchCount,
    unmatchedSells,
    remainingParcels,
    totalCapitalLosses: lossSummary.totalCapitalLosses,
    netCapitalGain: lossSummary.netCapitalGain,
    lossCarryForward: lossSummary.lossCarryForward,
    fycgSummary: lossSummary.fycgSummary,
  };
}

export interface AssetSummary {
  code: string;
  totalMatches: number;
  totalProceeds: number;
  totalCostBase: number;
  grossCapitalGain: number;
  totalCapitalLosses: number;
  cgtDiscountEligibleCount: number;
  netCapitalGain: number;
}

export function calculateAssetBreakdown(
  matches: Match[],
): Map<string, AssetSummary> {
  const breakdown = new Map<string, AssetSummary>();

  for (const m of matches) {
    const existing = breakdown.get(m.code) || {
      code: m.code,
      totalMatches: 0,
      totalProceeds: 0,
      totalCostBase: 0,
      grossCapitalGain: 0,
      totalCapitalLosses: 0,
      cgtDiscountEligibleCount: 0,
      netCapitalGain: 0,
    };

    existing.totalMatches += 1;
    existing.totalProceeds += m.sellProceeds;
    existing.totalCostBase += m.buyCostBase;
    if (m.capitalGain >= 0) {
      existing.grossCapitalGain += m.capitalGain;
    } else {
      existing.totalCapitalLosses += m.capitalGain;
    }
    if (m.cgtDiscountEligible) {
      existing.cgtDiscountEligibleCount += 1;
    }
    existing.netCapitalGain += m.capitalGain;

    breakdown.set(m.code, existing);
  }

  return breakdown;
}

export function calculateFyBreakdown(
  matches: Match[],
): Record<number, { gains: number; losses: number; net: number }> {
  const breakdown: Record<
    number,
    { gains: number; losses: number; net: number }
  > = {};

  for (const m of matches) {
    const fy = getFinancialYear(m.sellDate);
    if (!breakdown[fy]) {
      breakdown[fy] = { gains: 0, losses: 0, net: 0 };
    }
    if (m.capitalGain < 0) {
      breakdown[fy].losses += m.capitalGain;
    } else {
      breakdown[fy].gains += m.capitalGain;
    }
    breakdown[fy].net += m.capitalGain;
  }

  return breakdown;
}

export function calculateDetailedFyBreakdown(
  matches: Match[],
): Record<
  number,
  {
    gains: number;
    losses: number;
    net: number;
    carryForward: number;
    discountApplied: number;
  }
> {
  const matchesByFy = new Map<number, Match[]>();
  for (const m of matches) {
    const fy = getFinancialYear(m.sellDate);
    const group = matchesByFy.get(fy) || [];
    group.push(m);
    matchesByFy.set(fy, group);
  }

  const sortedFys = Array.from(matchesByFy.keys()).sort((a, b) => a - b);
  let runningCarryForward = 0;
  const result: Record<
    number,
    {
      gains: number;
      losses: number;
      net: number;
      carryForward: number;
      discountApplied: number;
    }
  > = {};

  for (const fy of sortedFys) {
    const fyMatches = matchesByFy.get(fy)!;
    let fyGains = 0;
    let fyLosses = 0;
    let fyDiscountApplied = 0;

    for (const m of fyMatches) {
      if (m.capitalGain < 0) {
        fyLosses += m.capitalGain;
      } else {
        fyGains += m.capitalGain;
        if (m.cgtDiscountEligible) {
          fyDiscountApplied += m.capitalGain * 0.5;
        }
      }
    }

    const netBeforeCarry = fyGains + fyLosses;
    const adjustedNet = netBeforeCarry + runningCarryForward;
    let fyCarryForward = 0;

    if (adjustedNet < 0) {
      fyCarryForward = adjustedNet;
    }

    result[fy] = {
      gains: fyGains,
      losses: fyLosses,
      net: adjustedNet,
      carryForward: fyCarryForward,
      discountApplied: fyDiscountApplied,
    };

    runningCarryForward = fyCarryForward;
  }

  return result;
}

export function calculateCgtDiscountBreakdown(matches: Match[]): {
  eligibleGains: number;
  ineligibleGains: number;
  totalLosses: number;
  discountSaved: number;
  netGain: number;
} {
  let eligibleGains = 0;
  let ineligibleGains = 0;
  let totalLosses = 0;
  let discountSaved = 0;

  for (const m of matches) {
    if (m.capitalGain < 0) {
      totalLosses += m.capitalGain;
    } else if (m.cgtDiscountEligible) {
      eligibleGains += m.capitalGain;
      discountSaved += m.capitalGain * 0.5;
    } else {
      ineligibleGains += m.capitalGain;
    }
  }

  return {
    eligibleGains,
    ineligibleGains,
    totalLosses,
    discountSaved,
    netGain: eligibleGains + ineligibleGains + totalLosses,
  };
}

export function calculateLossOffsets(matches: Match[]): CgtSummary {
  let totalProceeds = 0;
  let totalCostBase = 0;
  let totalCapitalGain = 0;
  let totalDiscountedGain = 0;
  let totalCapitalLosses = 0;

  for (const m of matches) {
    totalProceeds += m.sellProceeds;
    totalCostBase += m.buyCostBase;
    totalCapitalGain += m.capitalGain;
    totalDiscountedGain += m.discountedGain;
    if (m.capitalGain < 0) {
      totalCapitalLosses += m.capitalGain;
    }
  }

  const totalDiscountAmount = totalCapitalGain - totalDiscountedGain;

  const matchesByFy = new Map<number, Match[]>();
  for (const m of matches) {
    const fy = getFinancialYear(m.sellDate);
    const group = matchesByFy.get(fy) || [];
    group.push(m);
    matchesByFy.set(fy, group);
  }

  const sortedFys = Array.from(matchesByFy.keys()).sort((a, b) => a - b);
  let runningCarryForward = 0;
  const fycgSummary: Record<
    number,
    { gains: number; losses: number; net: number; carryForward: number }
  > = {};

  for (const fy of sortedFys) {
    const fyMatches = matchesByFy.get(fy)!;
    let fyGains = 0;
    let fyLosses = 0;

    for (const m of fyMatches) {
      if (m.capitalGain < 0) {
        fyLosses += m.capitalGain;
      } else {
        fyGains += m.capitalGain;
      }
    }

    const netBeforeCarry = fyGains + fyLosses;
    const adjustedNet = netBeforeCarry + runningCarryForward;
    let fyCarryForward = 0;

    if (adjustedNet < 0) {
      fyCarryForward = adjustedNet;
    }

    fycgSummary[fy] = {
      gains: fyGains,
      losses: fyLosses,
      net: adjustedNet,
      carryForward: fyCarryForward,
    };

    runningCarryForward = fyCarryForward;
  }

  const netCapitalGain = totalCapitalGain + totalCapitalLosses;
  const lossCarryForward = runningCarryForward;

  return {
    totalProceeds,
    totalCostBase,
    totalCapitalGain,
    totalDiscountedGain,
    totalDiscountAmount,
    matchCount: matches.length,
    unmatchedSells: [],
    remainingParcels: [],
    totalCapitalLosses,
    netCapitalGain,
    lossCarryForward,
    fycgSummary,
  };
}

export function formatCurrency(value: number): string {
  return value.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function getFinancialYear(dateStr: string): number {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  // Months are 0-indexed: 0 = January, 5 = June, 6 = July.
  // FY starts 1 July, so if month >= 6 we're in the next calendar year's FY.
  return d.getMonth() >= 6 ? y + 1 : y;
}

export function getFinancialYearLabel(fy: number): string {
  return `FY${fy - 1}/${String(fy).slice(2)}`;
}

export function getFinancialYearRange(fy: number): {
  start: string;
  end: string;
} {
  return {
    start: `${fy - 1}-07-01`,
    end: `${fy}-06-30`,
  };
}

export function exportCgtReport(
  matches: Match[],
  unmatchedSells: Trade[],
  summary: CgtSummary,
  selectedFy: number | null,
): string {
  const lines: string[] = [];

  lines.push("=== CGT REPORT SUMMARY ===");
  lines.push(`Total Proceeds,${summary.totalProceeds.toFixed(2)}`);
  lines.push(`Total Cost Base,${summary.totalCostBase.toFixed(2)}`);
  lines.push(`Capital Gains,${summary.totalCapitalGain.toFixed(2)}`);
  lines.push(`Capital Losses,${summary.totalCapitalLosses.toFixed(2)}`);
  lines.push(`Net Capital Gain,${summary.netCapitalGain.toFixed(2)}`);
  lines.push(`CGT Discount Amount Saved,${summary.totalDiscountAmount.toFixed(2)}`);
  lines.push(`Loss Carry-Forward,${summary.lossCarryForward.toFixed(2)}`);
  lines.push("");

  lines.push("=== MATCHED TRADES ===");
  const matchHeader =
    "Sell ID,Buy ID,Code,Units,Buy Date,Sell Date,Held (days),Proceeds,Cost Base,Capital Gain,CGT Discount,Taxable Gain,FY,Is Loss,Loss Offset Applied,Net Gain After Offset,Status";
  lines.push(matchHeader);
  for (const m of matches) {
    const fy = getFinancialYear(m.sellDate);
    const heldDays = Math.round(
      (new Date(m.sellDate).getTime() - new Date(m.buyDate).getTime()) /
        86400000,
    );
    const lossOffset = m.isLoss ? m.capitalGain.toFixed(2) : "0.00";
    lines.push(
      [
        m.sellTradeId,
        m.buyTradeId,
        m.code,
        m.units,
        m.buyDate,
        m.sellDate,
        heldDays,
        m.sellProceeds.toFixed(2),
        m.buyCostBase.toFixed(2),
        m.capitalGain.toFixed(2),
        m.cgtDiscountEligible ? "Yes" : "No",
        m.discountedGain.toFixed(2),
        getFinancialYearLabel(fy),
        m.isLoss ? "Yes" : "No",
        lossOffset,
        m.capitalGain.toFixed(2),
        "Matched",
      ].join(","),
    );
  }
  lines.push("");

  lines.push("=== UNMATCHED SELLS ===");
  const unmatchedHeader =
    "Trade ID,Code,Units,Date,Proceeds,Status";
  lines.push(unmatchedHeader);
  for (const s of unmatchedSells) {
    const proceeds = s.price * s.units - s.brokerage;
    lines.push(
      [
        s.tradeId,
        s.code,
        s.units,
        s.date,
        proceeds.toFixed(2),
        "Unmatched",
      ].join(","),
    );
  }
  lines.push("");

  lines.push("=== PER-ASSET SUMMARY ===");
  const assetHeader =
    "Asset Code,FY,Total Gain/Loss,Discount Eligible Count,Net Gain";
  lines.push(assetHeader);
  const assetMap = new Map<
    string,
    { gain: number; discountEligibleCount: number; netGain: number }
  >();
  for (const m of matches) {
    const fy = getFinancialYear(m.sellDate);
    const key = `${m.code}|${fy}`;
    const existing = assetMap.get(key) || {
      gain: 0,
      discountEligibleCount: 0,
      netGain: 0,
    };
    existing.gain += m.capitalGain;
    existing.netGain += m.capitalGain;
    if (m.cgtDiscountEligible) {
      existing.discountEligibleCount += 1;
    }
    assetMap.set(key, existing);
  }
  const sortedAssets = Array.from(assetMap.entries()).sort((a, b) => {
    const [codeA, fyA] = a[0].split("|");
    const [codeB, fyB] = b[0].split("|");
    if (codeA !== codeB) return codeA.localeCompare(codeB);
    return Number(fyA) - Number(fyB);
  });
  for (const [key, data] of sortedAssets) {
    const [code, fy] = key.split("|");
    lines.push(
      [
        code,
        getFinancialYearLabel(Number(fy)),
        data.gain.toFixed(2),
        data.discountEligibleCount,
        data.netGain.toFixed(2),
      ].join(","),
    );
  }
  lines.push("");

  lines.push("=== PER-FY SUMMARY ===");
  const fyHeader =
    "FY,Total Gains,Total Losses,Net Gain,Carry-Forward";
  lines.push(fyHeader);
  const fyBreakdown = calculateDetailedFyBreakdown(matches);
  const sortedFys = Object.keys(fyBreakdown)
    .map(Number)
    .sort((a, b) => a - b);
  for (const fy of sortedFys) {
    const data = fyBreakdown[fy];
    lines.push(
      [
        getFinancialYearLabel(fy),
        data.gains.toFixed(2),
        data.losses.toFixed(2),
        data.net.toFixed(2),
        data.carryForward.toFixed(2),
      ].join(","),
    );
  }

  return lines.join("\n");
}

export function getTradeFinancialYears(trades: Trade[]): number[] {
  const fySet = new Set<number>();
  for (const t of trades) {
    if (t.date) {
      fySet.add(getFinancialYear(t.date));
    }
  }
  return Array.from(fySet).sort((a, b) => b - a);
}

export function filterTradesByFinancialYear(
  trades: Trade[],
  fy: number,
): Trade[] {
  const { start, end } = getFinancialYearRange(fy);
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime() + 86400000; // inclusive end of day

  return trades.map((t) => t).filter((t) => {
    if (t.action === "Sell") {
      const tTime = new Date(t.date).getTime();
      return tTime >= startTime && tTime < endTime;
    }
    // Include all buys - parcels purchased before the FY may be sold within it
    return true;
  });
}

export const STRATEGY_LABELS: Record<MatchStrategy, string> = {
  fifo: "First In, First Out (FIFO)",
  lifo: "Last In, First Out (LIFO)",
  "min-taxable-income": "Minimise Taxable Income",
  "max-taxable-income": "Maximise Taxable Income",
  "min-cost-base": "Minimise Cost Base",
  "max-cost-base": "Maximise Cost Base",
  manual: "Manual Matching (match_id)",
};

export const STRATEGY_DESCRIPTIONS: Record<MatchStrategy, string> = {
  fifo: "Sell the oldest shares first. Most common default approach.",
  lifo: "Sell the newest shares first.",
  "min-taxable-income":
    "Match highest cost base parcels first to minimise capital gains. Prefers older parcels for CGT discount eligibility.",
  "max-taxable-income":
    "Match lowest cost base parcels first to maximise capital gains.",
  "min-cost-base":
    "Match parcels with the lowest cost base per unit first.",
  "max-cost-base":
    "Match parcels with the highest cost base per unit first.",
  manual:
    "Use match_id column from CSV to define which buys match which sells.",
};
