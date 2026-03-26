import type {
  Action,
  CgtSummary,
  Match,
  MatchStrategy,
  Parcel,
  Trade,
} from "./types";

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const CGT_DISCOUNT_DAYS = 365;

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

  const trades: Trade[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCsvLine(line);
    const action = values[actionIdx]?.trim() as Action;
    if (action !== "Buy" && action !== "Sell") continue;

    const units = parseFloat(values[unitsIdx] || "0");
    const price = parseFloat(values[priceIdx] || "0");
    const brokerage = parseFloat(values[brokerageIdx] || "0");
    const total = parseFloat(values[totalIdx] || "0");

    trades.push({
      tradeId: values[tradeIdIdx]?.trim() || `T${i}`,
      matchId: values[matchIdIdx]?.trim() || "",
      date: values[dateIdx]?.trim(),
      action,
      code: values[codeIdx]?.trim() || "",
      units,
      price,
      brokerage,
      total: total || units * price + (action === "Buy" ? brokerage : -brokerage),
    });
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
      parcel.unitsRemaining -= matchedUnits;
      remainingSellUnits -= matchedUnits;

      // Proportional brokerage for the sell
      const sellBrokeragePortion =
        (matchedUnits / sell.units) * sell.brokerage;
      totalSellBrokerageAllocated += sellBrokeragePortion;

      // Proceeds = price * units - proportional brokerage
      const netProceeds = sell.price * matchedUnits - sellBrokeragePortion;
      // Cost base = buy price * units + proportional brokerage
      const buyCostBase =
        (parcel.totalCostBase / parcel.totalUnits) * matchedUnits;

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

export function calculateCgtSummary(matches: Match[]): CgtSummary {
  let totalProceeds = 0;
  let totalCostBase = 0;
  let totalCapitalGain = 0;
  let totalDiscountedGain = 0;

  for (const m of matches) {
    totalProceeds += m.sellProceeds;
    totalCostBase += m.buyCostBase;
    totalCapitalGain += m.capitalGain;
    totalDiscountedGain += m.discountedGain;
  }

  const totalDiscountAmount = totalCapitalGain - totalDiscountedGain;

  return {
    totalProceeds,
    totalCostBase,
    totalCapitalGain,
    totalDiscountedGain,
    totalDiscountAmount,
    matchCount: matches.length,
    unmatchedSells: [],
    remainingParcels: [],
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
