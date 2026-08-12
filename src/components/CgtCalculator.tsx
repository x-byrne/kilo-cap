"use client";

import { useState, useCallback } from "react";
import type {
  CgtSummary,
  Match,
  MatchStrategy,
  Parcel,
  Trade,
} from "@/lib/types";
import {
  parseCsv,
  tradesToParcels,
  sortParcelsByStrategy,
  calculateCgtSummary,
  isCgtDiscountEligible,
  formatCurrency,
  formatDate,
  STRATEGY_LABELS,
  STRATEGY_DESCRIPTIONS,
  getTradeFinancialYears,
  getFinancialYear,
  getFinancialYearLabel,
  filterTradesByFinancialYear,
  getHeldDays,
  detectBrokerFormat,
} from "@/lib/cgt";

const SAMPLE_CSV = `trade_id,match_id,date,action,code,units,price,brokerage,total
T001,,2021-01-20,Buy,LRSOC,135175,0.03905,9.5,5288.06
T002,,2021-01-20,Buy,LRSOC,110888,0.043,9.5,4777.68
T003,M003,2021-02-15,Sell,LRSOC,194444,0.06,9.5,11657.14
T004,M003,2021-02-15,Buy,LRSOC,194444,0.053631,9.5,10437.68`;

const strategies: MatchStrategy[] = [
  "fifo",
  "lifo",
  "min-taxable-income",
  "max-taxable-income",
  "min-cost-base",
  "max-cost-base",
  "manual",
];

function matchKey(m: Match): string {
  return `${m.buyTradeId}-${m.sellTradeId}-${m.units}`;
}

function buildMatchFromKey(
  key: string,
  trades: Trade[],
): Match | null {
  const parts = key.split("-");
  const units = parseInt(parts[parts.length - 1], 10);
  const sellId = parts[parts.length - 2];
  const buyId = parts.slice(0, parts.length - 2).join("-");

  const buy = trades.find((t) => t.tradeId === buyId);
  const sell = trades.find((t) => t.tradeId === sellId);
  if (!buy || !sell) return null;

  const netProceeds =
    sell.price * units - (units / sell.units) * sell.brokerage;
  const buyCostBase =
    buy.price * units + (units / buy.units) * buy.brokerage;
  const capitalGain = netProceeds - buyCostBase;
  const eligible = isCgtDiscountEligible(buy.date, sell.date);
  const discountedGain = eligible ? capitalGain * 0.5 : capitalGain;

  return {
    sellTradeId: sell.tradeId,
    buyTradeId: buy.tradeId,
    code: sell.code,
    units,
    sellDate: sell.date,
    buyDate: buy.date,
    sellProceeds: netProceeds,
    buyCostBase,
    capitalGain,
    cgtDiscountEligible: eligible,
    discountedGain,
  };
}

function getLockedUnits(
  lockedMatchKeys: Set<string>,
  trades: Trade[],
): Map<string, number> {
  const lockedUnits = new Map<string, number>();
  for (const key of lockedMatchKeys) {
    const m = buildMatchFromKey(key, trades);
    if (!m) continue;
    lockedUnits.set(m.buyTradeId, (lockedUnits.get(m.buyTradeId) || 0) + m.units);
  }
  return lockedUnits;
}

function recalculate(
  currentTrades: Trade[],
  currentStrategy: MatchStrategy,
  lockedMatchKeys: Set<string>,
): {
  matches: Match[];
  unmatchedSells: Trade[];
  remainingParcels: Parcel[];
} {
  // Rebuild locked matches, dropping any whose trades no longer exist
  const lockedMatches: Match[] = [];
  for (const key of lockedMatchKeys) {
    const m = buildMatchFromKey(key, currentTrades);
    if (m) lockedMatches.push(m);
  }

  // Calculate how many units of each buy trade are consumed by locked matches
  const lockedUnits = getLockedUnits(lockedMatchKeys, currentTrades);

  // Build available parcels with locked units subtracted
  const allParcels = tradesToParcels(currentTrades);
  const availableParcels: Parcel[] = [];
  for (const p of allParcels) {
    const locked = lockedUnits.get(p.tradeId) || 0;
    const remaining = p.unitsRemaining - locked;
    if (remaining > 0) {
      availableParcels.push({ ...p, unitsRemaining: remaining });
    }
  }

  // Get sells excluding those fully consumed by locked matches
  const allSells = currentTrades
    .filter((t) => t.action === "Sell")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Calculate sell units consumed by locked matches
  const lockedSellUnits = new Map<string, number>();
  for (const key of lockedMatchKeys) {
    const parts = key.split("-");
    const units = parseInt(parts[parts.length - 1], 10);
    const sellId = parts[parts.length - 2];
    lockedSellUnits.set(sellId, (lockedSellUnits.get(sellId) || 0) + units);
  }

  const unlockedSells: Trade[] = [];
  for (const sell of allSells) {
    const consumed = lockedSellUnits.get(sell.tradeId) || 0;
    const remaining = sell.units - consumed;
    if (remaining > 0) {
      unlockedSells.push({ ...sell, units: remaining });
    }
  }

  // Match unlocked sells
  let newMatches: Match[];
  let unmatchedSells: Trade[];
  let remainingParcels: Parcel[];

  if (currentStrategy === "manual") {
    const result = matchManualWithLocked(
      currentTrades,
      lockedMatchKeys,
    );
    newMatches = result.matches;
    unmatchedSells = result.unmatchedSells;
    remainingParcels = result.remainingParcels;
  } else {
    const result = matchAutomaticWithAvailable(
      unlockedSells,
      availableParcels,
      currentStrategy,
    );
    newMatches = result.matches;
    unmatchedSells = result.unmatchedSells;
    remainingParcels = result.remainingParcels;
  }

  return {
    matches: [...lockedMatches, ...newMatches],
    unmatchedSells,
    remainingParcels,
  };
}

function matchManualWithLocked(
  trades: Trade[],
  lockedMatchKeys: Set<string>,
): { matches: Match[]; unmatchedSells: Trade[]; remainingParcels: Parcel[] } {
  // Determine which trade IDs are consumed by locked matches
  const lockedBuyIds = new Set<string>();
  const lockedSellIds = new Set<string>();
  const lockedBuyUnits = new Map<string, number>();
  const lockedSellUnits = new Map<string, number>();

  for (const key of lockedMatchKeys) {
    const parts = key.split("-");
    const units = parseInt(parts[parts.length - 1], 10);
    const sellId = parts[parts.length - 2];
    const buyId = parts.slice(0, parts.length - 2).join("-");
    lockedBuyIds.add(buyId);
    lockedSellIds.add(sellId);
    lockedBuyUnits.set(buyId, (lockedBuyUnits.get(buyId) || 0) + units);
    lockedSellUnits.set(sellId, (lockedSellUnits.get(sellId) || 0) + units);
  }

  // Group non-locked trades by match_id
  const matchGroups = new Map<string, Trade[]>();
  for (const trade of trades) {
    if (!trade.matchId) continue;
    if (trade.action === "Buy" && lockedBuyIds.has(trade.tradeId)) continue;
    if (trade.action === "Sell" && lockedSellIds.has(trade.tradeId)) continue;
    const group = matchGroups.get(trade.matchId) || [];
    group.push(trade);
    matchGroups.set(trade.matchId, group);
  }

  const matches: Match[] = [];
  const usedBuyIds = new Set<string>();

  for (const [, group] of matchGroups) {
    const buys = group.filter((t) => t.action === "Buy");
    const sells = group.filter((t) => t.action === "Sell");

    for (const sell of sells) {
      let remainingSellUnits = sell.units;

      for (const buy of buys) {
        if (remainingSellUnits <= 0) break;
        usedBuyIds.add(buy.tradeId);

        const matchedUnits = Math.min(remainingSellUnits, buy.units);
        remainingSellUnits -= matchedUnits;

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
        // Add to unmatched below
      }
    }
  }

  const unmatchedSells: Trade[] = [];
  // Sells without match_id that aren't locked
  for (const t of trades) {
    if (
      t.action === "Sell" &&
      !t.matchId &&
      !lockedSellIds.has(t.tradeId)
    ) {
      unmatchedSells.push(t);
    }
  }

  // Remaining parcels: buys not used in manual matching and not locked
  const remainingParcels = tradesToParcels(
    trades.filter(
      (t) =>
        t.action === "Buy" &&
        !usedBuyIds.has(t.tradeId) &&
        !lockedBuyIds.has(t.tradeId),
    ),
  );

  return { matches, unmatchedSells, remainingParcels };
}

function matchAutomaticWithAvailable(
  sells: Trade[],
  parcels: Parcel[],
  strategy: MatchStrategy,
): { matches: Match[]; unmatchedSells: Trade[]; remainingParcels: Parcel[] } {
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
    const validParcels = codeParcels.filter(
      (p) =>
        p.unitsRemaining > 0 &&
        new Date(p.date).getTime() <= new Date(sell.date).getTime(),
    );

    if (validParcels.length === 0) {
      unmatchedSells.push(sell);
      continue;
    }

    const sortedParcels = sortParcelsByStrategy(validParcels, strategy);
    let remainingSellUnits = sell.units;

    for (const parcel of sortedParcels) {
      if (remainingSellUnits <= 0) break;

      const matchedUnits = Math.min(remainingSellUnits, parcel.unitsRemaining);
      parcel.unitsRemaining -= matchedUnits;
      remainingSellUnits -= matchedUnits;

      const sellBrokeragePortion =
        (matchedUnits / sell.units) * sell.brokerage;
      const netProceeds = sell.price * matchedUnits - sellBrokeragePortion;
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
        total: sell.price * remainingSellUnits,
      });
    }
  }

  const remainingParcels = parcels.filter((p) => p.unitsRemaining > 0);

  return { matches, unmatchedSells, remainingParcels };
}

export default function CgtCalculator() {
  const [csvText, setCsvText] = useState("");
  const [trades, setTrades] = useState<Trade[]>([]);
  const [strategy, setStrategy] = useState<MatchStrategy>("fifo");
  const [matches, setMatches] = useState<Match[]>([]);
  const [unmatchedSells, setUnmatchedSells] = useState<Trade[]>([]);
  const [remainingParcels, setRemainingParcels] = useState<Parcel[]>([]);
  const [summary, setSummary] = useState<CgtSummary | null>(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"matches" | "parcels" | "trades">(
    "matches",
  );
  const [lockedMatchKeys, setLockedMatchKeys] = useState<Set<string>>(
    new Set(),
  );
  const [selectedFy, setSelectedFy] = useState<number | null>(null);
  const [financialYears, setFinancialYears] = useState<number[]>([]);
  const [brokerFormat, setBrokerFormat] = useState<string>("unknown");

  const applyResults = useCallback(
    (
      result: {
        matches: Match[];
        unmatchedSells: Trade[];
        remainingParcels: Parcel[];
      },
    ) => {
      setMatches(result.matches);
      setUnmatchedSells(result.unmatchedSells);
      setRemainingParcels(result.remainingParcels);
      setSummary(calculateCgtSummary(result));
    },
    [],
  );

  const handleParse = useCallback(() => {
    setError("");
    try {
      const parsed = parseCsv(csvText);
      if (parsed.length === 0) {
        setError("No valid trades found in CSV. Check the format.");
        return;
      }
      setTrades(parsed);
      setBrokerFormat(detectBrokerFormat(csvText));
      const years = getTradeFinancialYears(parsed);
      setFinancialYears(years);
      const fy = years.length > 0 ? years[0] : null;
      setSelectedFy(fy);
      const filtered = fy ? filterTradesByFinancialYear(parsed, fy) : parsed;
      const result = recalculate(filtered, strategy, lockedMatchKeys);
      applyResults(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse CSV");
    }
  }, [csvText, strategy, lockedMatchKeys, applyResults]);

  const handleStrategyChange = useCallback(
    (newStrategy: MatchStrategy) => {
      setStrategy(newStrategy);
      if (trades.length > 0) {
        const result = recalculate(trades, newStrategy, lockedMatchKeys);
        applyResults(result);
      }
    },
    [trades, lockedMatchKeys, applyResults],
  );

  const handleToggleLock = useCallback(
    (m: Match) => {
      const key = matchKey(m);
      const next = new Set(lockedMatchKeys);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      setLockedMatchKeys(next);
      if (trades.length > 0) {
        const result = recalculate(trades, strategy, next);
        applyResults(result);
      }
    },
    [lockedMatchKeys, trades, strategy, applyResults],
  );

  const handleLockAll = useCallback(() => {
    const next = new Set(lockedMatchKeys);
    for (const m of matches) {
      next.add(matchKey(m));
    }
    setLockedMatchKeys(next);
  }, [matches, lockedMatchKeys]);

  const handleUnlockAll = useCallback(() => {
    setLockedMatchKeys(new Set());
    if (trades.length > 0) {
      const filtered = selectedFy
        ? filterTradesByFinancialYear(trades, selectedFy)
        : trades;
      const result = recalculate(filtered, strategy, new Set());
      applyResults(result);
    }
  }, [trades, strategy, selectedFy, applyResults]);

  const handleFyChange = useCallback(
    (fy: number | null) => {
      setSelectedFy(fy);
      if (trades.length > 0) {
        const filtered = fy
          ? filterTradesByFinancialYear(trades, fy)
          : trades;
        const result = recalculate(filtered, strategy, lockedMatchKeys);
        applyResults(result);
      }
    },
    [trades, strategy, lockedMatchKeys, applyResults],
  );

  const handleExport = useCallback(() => {
    if (!matches.length && !unmatchedSells.length) return;

    const header =
      "Sell ID,Buy ID,Code,Units,Buy Date,Sell Date,Held (days),Proceeds,Cost Base,Capital Gain,CGT Discount,Taxable Gain,Status";
    const rows: string[] = [];

    for (const m of matches) {
      const heldDays = getHeldDays(m.buyDate, m.sellDate);
      rows.push(
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
          "Matched",
        ].join(","),
      );
    }

    for (const s of unmatchedSells) {
      const proceeds = s.price * s.units - s.brokerage;
      rows.push(
        [
          s.tradeId,
          "",
          s.code,
          s.units,
          "",
          s.date,
          "",
          proceeds.toFixed(2),
          "",
          "",
          "",
          "",
          "Unmatched",
        ].join(","),
      );
    }

    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const fyLabel = selectedFy ? `_FY${selectedFy}` : "_all";
    a.href = url;
    a.download = `cgt_report${fyLabel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [matches, unmatchedSells, selectedFy]);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        setCsvText(text);
      };
      reader.readAsText(file);
    },
    [],
  );

  const loadSample = useCallback(() => {
    setCsvText(SAMPLE_CSV);
  }, []);

  const lockedCount = lockedMatchKeys.size;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 bg-neutral-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-2xl font-bold tracking-tight">
            Australian CGT Calculator
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            Match share purchases and sales, calculate capital gains, and
            optimise for CGT discount eligibility
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* CSV Input Section */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Trade Data</h2>
            <div className="flex gap-3">
              <button
                onClick={loadSample}
                className="text-sm px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
              >
                Load Sample
              </button>
              <label className="text-sm px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors cursor-pointer">
                Upload CSV
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="Paste CSV data here...

Expected columns: trade_id, match_id, date, action, code, units, price, brokerage, total

Example:
trade_id,match_id,date,action,code,units,price,brokerage,total
T001,,2021-01-20,Buy,LRSOC,135175,0.03905,9.5,5288.06"
            className="w-full h-40 bg-neutral-900 border border-neutral-700 rounded-lg p-4 font-mono text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
          />

          <div className="mt-3 flex items-center gap-4">
            <button
              onClick={handleParse}
              disabled={!csvText.trim()}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white font-medium text-sm transition-colors"
            >
              Calculate CGT
            </button>
            {error && <span className="text-sm text-red-400">{error}</span>}
            {trades.length > 0 && !error && (
              <span className="text-sm text-neutral-400">
                {trades.length} trades loaded
              </span>
            )}
            {brokerFormat !== "unknown" && (
              <span className="text-xs text-neutral-500 border border-neutral-700 rounded px-2 py-0.5">
                Format: {brokerFormat}
              </span>
            )}
          </div>
        </section>

        {/* FY Filter & Export Toolbar */}
        {trades.length > 0 && (
          <section className="mb-8">
            <div className="flex flex-wrap items-center gap-4">
              {financialYears.length > 1 && (
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="fy-select"
                    className="text-sm text-neutral-400"
                  >
                    Financial Year
                  </label>
                  <select
                    id="fy-select"
                    value={selectedFy ?? ""}
                    onChange={(e) =>
                      handleFyChange(
                        e.target.value ? parseInt(e.target.value, 10) : null,
                      )
                    }
                    className="bg-neutral-900 border border-neutral-700 rounded-md px-3 py-1.5 text-sm text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Years</option>
                    {financialYears.map((fy) => (
                      <option key={fy} value={fy}>
                        {getFinancialYearLabel(fy)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button
                onClick={handleExport}
                disabled={!matches.length && !unmatchedSells.length}
                className="text-sm px-4 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 disabled:bg-neutral-800 disabled:text-neutral-600 text-neutral-300 transition-colors flex items-center gap-2"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Export Report
              </button>
            </div>
          </section>
        )}

        {/* Strategy Selector */}
        {trades.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-4">Matching Strategy</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {strategies.map((s) => (
                <button
                  key={s}
                  onClick={() => handleStrategyChange(s)}
                  className={`text-left p-3 rounded-lg border transition-colors ${
                    strategy === s
                      ? "border-blue-500 bg-blue-500/10 text-blue-300"
                      : "border-neutral-700 bg-neutral-900 hover:border-neutral-600 text-neutral-300"
                  }`}
                >
                  <div className="font-medium text-sm">
                    {STRATEGY_LABELS[s]}
                  </div>
                  <div className="mt-1 text-xs text-neutral-500 leading-relaxed">
                    {STRATEGY_DESCRIPTIONS[s]}
                  </div>
                </button>
              ))}
            </div>
            {lockedCount > 0 && (
              <div className="mt-3 text-sm text-neutral-400">
                <span className="text-amber-400 font-medium">
                  {lockedCount} match{lockedCount !== 1 ? "es" : ""} locked
                </span>{" "}
                — locked matches are preserved when switching strategies
              </div>
            )}
          </section>
        )}

        {/* Summary Cards */}
        {summary && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-4">CGT Summary</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard
                label="Total Proceeds"
                value={formatCurrency(summary.totalProceeds)}
              />
              <SummaryCard
                label="Total Cost Base"
                value={formatCurrency(summary.totalCostBase)}
              />
              <SummaryCard
                label="Capital Gain (Before Discount)"
                value={formatCurrency(summary.totalCapitalGain)}
                highlight={
                  summary.totalCapitalGain > 0
                    ? "text-green-400"
                    : summary.totalCapitalGain < 0
                      ? "text-red-400"
                      : ""
                }
              />
              <SummaryCard
                label="Taxable Capital Gain (After 50% Discount)"
                value={formatCurrency(summary.totalDiscountedGain)}
                highlight={
                  summary.totalDiscountedGain > 0
                    ? "text-green-400"
                    : summary.totalDiscountedGain < 0
                      ? "text-red-400"
                      : ""
                }
              />
            </div>
            {summary.totalDiscountAmount > 0 && (
              <div className="mt-3 text-sm text-neutral-400">
                CGT Discount saved:{" "}
                <span className="text-green-400 font-medium">
                  {formatCurrency(summary.totalDiscountAmount)}
                </span>{" "}
                ({summary.matchCount} matches)
              </div>
            )}
          </section>
        )}

        {/* Tab Navigation */}
        {trades.length > 0 && (
          <section>
            <div className="flex border-b border-neutral-800 mb-4">
              {(
                [
                  ["matches", "Matched Trades"],
                  ["parcels", "Remaining Parcels"],
                  ["trades", "All Trades"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === key
                      ? "border-blue-500 text-blue-400"
                      : "border-transparent text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {activeTab === "matches" && (
              <MatchResultsTable
                matches={matches}
                unmatchedSells={unmatchedSells}
                lockedMatchKeys={lockedMatchKeys}
                onToggleLock={handleToggleLock}
                onLockAll={handleLockAll}
                onUnlockAll={handleUnlockAll}
              />
            )}
            {activeTab === "parcels" && (
              <ParcelsTable parcels={remainingParcels} />
            )}
            {activeTab === "trades" && (
              <TradesTable
                trades={
                  selectedFy
                    ? trades.filter(
                        (t) =>
                          t.action === "Buy" ||
                          getFinancialYear(t.date) === selectedFy,
                      )
                    : trades
                }
              />
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  highlight = "",
}: {
  label: string;
  value: string;
  highlight?: string;
}) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
      <div className="text-xs text-neutral-500 uppercase tracking-wider">
        {label}
      </div>
      <div
        className={`mt-1 text-xl font-semibold ${highlight || "text-neutral-100"}`}
      >
        {value}
      </div>
    </div>
  );
}

function MatchResultsTable({
  matches,
  unmatchedSells,
  lockedMatchKeys,
  onToggleLock,
  onLockAll,
  onUnlockAll,
}: {
  matches: Match[];
  unmatchedSells: Trade[];
  lockedMatchKeys: Set<string>;
  onToggleLock: (m: Match) => void;
  onLockAll: () => void;
  onUnlockAll: () => void;
}) {
  return (
    <div>
      {matches.length > 0 && (
        <div className="flex items-center justify-end gap-2 mb-3">
          <button
            onClick={onLockAll}
            className="text-xs px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
          >
            Lock All
          </button>
          <button
            onClick={onUnlockAll}
            className="text-xs px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
          >
            Unlock All
          </button>
        </div>
      )}

      {matches.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-900 text-neutral-400 text-left">
                <th className="px-4 py-3 font-medium w-10">
                  <span className="sr-only">Lock</span>
                </th>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium text-right">Units</th>
                <th className="px-4 py-3 font-medium">Buy Date</th>
                <th className="px-4 py-3 font-medium">Sell Date</th>
                <th className="px-4 py-3 font-medium">Held</th>
                <th className="px-4 py-3 font-medium text-right">Proceeds</th>
                <th className="px-4 py-3 font-medium text-right">Cost Base</th>
                <th className="px-4 py-3 font-medium text-right">
                  Capital Gain
                </th>
                <th className="px-4 py-3 font-medium text-center">
                  CGT Discount
                </th>
                <th className="px-4 py-3 font-medium text-right">
                  Taxable Gain
                </th>
                <th className="px-4 py-3 font-medium">Sell ID</th>
                <th className="px-4 py-3 font-medium">Buy ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {matches.map((m, i) => {
                const key = matchKey(m);
                const locked = lockedMatchKeys.has(key);
                const heldDays = getHeldDays(m.buyDate, m.sellDate);
                return (
                  <tr
                    key={`${key}-${i}`}
                    className={`transition-colors ${
                      locked
                        ? "bg-amber-500/5"
                        : "bg-neutral-950 hover:bg-neutral-900/50"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onToggleLock(m)}
                        title={locked ? "Unlock match" : "Lock match"}
                        className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                          locked
                            ? "bg-amber-500/20 border-amber-500 text-amber-400"
                            : "border-neutral-600 hover:border-neutral-400"
                        }`}
                      >
                        {locked ? (
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                            />
                          </svg>
                        ) : null}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono font-medium">
                      {m.code}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {m.units.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">{formatDate(m.buyDate)}</td>
                    <td className="px-4 py-3">{formatDate(m.sellDate)}</td>
                    <td className="px-4 py-3 text-neutral-400">
                      {heldDays}d
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatCurrency(m.sellProceeds)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatCurrency(m.buyCostBase)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono ${
                        m.capitalGain >= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {formatCurrency(m.capitalGain)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {m.cgtDiscountEligible ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                          50%
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-neutral-800 text-neutral-500">
                          No
                        </span>
                      )}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono font-medium ${
                        m.discountedGain >= 0
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      {formatCurrency(m.discountedGain)}
                    </td>
                    <td className="px-4 py-3 font-mono text-neutral-400 text-xs">
                      {m.sellTradeId}
                    </td>
                    <td className="px-4 py-3 font-mono text-neutral-400 text-xs">
                      {m.buyTradeId}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-neutral-900 font-medium">
                <td />
                <td className="px-4 py-3" colSpan={4}>
                  Total ({matches.length} matches)
                </td>
                <td />
                <td className="px-4 py-3 text-right font-mono">
                  {formatCurrency(
                    matches.reduce((s, m) => s + m.sellProceeds, 0),
                  )}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {formatCurrency(
                    matches.reduce((s, m) => s + m.buyCostBase, 0),
                  )}
                </td>
                <td
                  className={`px-4 py-3 text-right font-mono ${
                    matches.reduce((s, m) => s + m.capitalGain, 0) >= 0
                      ? "text-green-400"
                      : "text-red-400"
                  }`}
                >
                  {formatCurrency(
                    matches.reduce((s, m) => s + m.capitalGain, 0),
                  )}
                </td>
                <td />
                <td
                  className={`px-4 py-3 text-right font-mono ${
                    matches.reduce((s, m) => s + m.discountedGain, 0) >= 0
                      ? "text-green-400"
                      : "text-red-400"
                  }`}
                >
                  {formatCurrency(
                    matches.reduce((s, m) => s + m.discountedGain, 0),
                  )}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="text-sm text-neutral-500 py-8 text-center border border-neutral-800 rounded-lg">
          No matches found. Try a different strategy or add more buy trades.
        </div>
      )}

      {unmatchedSells.length > 0 && (
        <div className="mt-4 p-4 rounded-lg border border-amber-500/30 bg-amber-500/5">
          <h3 className="text-sm font-medium text-amber-400 mb-2">
            Unmatched Sells ({unmatchedSells.length})
          </h3>
          <div className="text-sm text-neutral-400">
            {unmatchedSells.map((s) => (
              <div key={s.tradeId} className="flex gap-4 py-1">
                <span className="font-mono text-amber-300">{s.tradeId}</span>
                <span>
                  {s.code} &mdash; {s.units.toLocaleString()} units on{" "}
                  {formatDate(s.date)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ParcelsTable({ parcels }: { parcels: Parcel[] }) {
  if (parcels.length === 0) {
    return (
      <div className="text-sm text-neutral-500 py-8 text-center">
        All parcels have been fully matched.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-neutral-900 text-neutral-400 text-left">
            <th className="px-4 py-3 font-medium">Buy ID</th>
            <th className="px-4 py-3 font-medium">Code</th>
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium text-right">Original Units</th>
            <th className="px-4 py-3 font-medium text-right">
              Remaining Units
            </th>
            <th className="px-4 py-3 font-medium text-right">
              Cost Base/Unit
            </th>
            <th className="px-4 py-3 font-medium text-right">
              Remaining Cost Base
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800">
          {parcels.map((p) => (
            <tr
              key={p.tradeId}
              className="bg-neutral-950 hover:bg-neutral-900/50 transition-colors"
            >
              <td className="px-4 py-3 font-mono">{p.tradeId}</td>
              <td className="px-4 py-3 font-mono font-medium">{p.code}</td>
              <td className="px-4 py-3">{formatDate(p.date)}</td>
              <td className="px-4 py-3 text-right font-mono">
                {p.totalUnits.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right font-mono">
                {p.unitsRemaining.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right font-mono">
                {formatCurrency(p.costBasePerUnit)}
              </td>
              <td className="px-4 py-3 text-right font-mono">
                {formatCurrency(p.costBasePerUnit * p.unitsRemaining)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TradesTable({ trades }: { trades: Trade[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-neutral-900 text-neutral-400 text-left">
            <th className="px-4 py-3 font-medium">ID</th>
            <th className="px-4 py-3 font-medium">Match ID</th>
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Action</th>
            <th className="px-4 py-3 font-medium">Code</th>
            <th className="px-4 py-3 font-medium text-right">Units</th>
            <th className="px-4 py-3 font-medium text-right">Price</th>
            <th className="px-4 py-3 font-medium text-right">Brokerage</th>
            <th className="px-4 py-3 font-medium text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800">
          {trades.map((t) => (
            <tr
              key={t.tradeId}
              className="bg-neutral-950 hover:bg-neutral-900/50 transition-colors"
            >
              <td className="px-4 py-3 font-mono">{t.tradeId}</td>
              <td className="px-4 py-3 font-mono text-neutral-500">
                {t.matchId || "\u2014"}
              </td>
              <td className="px-4 py-3">{formatDate(t.date)}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    t.action === "Buy"
                      ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                      : "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                  }`}
                >
                  {t.action}
                </span>
              </td>
              <td className="px-4 py-3 font-mono font-medium">{t.code}</td>
              <td className="px-4 py-3 text-right font-mono">
                {t.units.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right font-mono">
                {formatCurrency(t.price)}
              </td>
              <td className="px-4 py-3 text-right font-mono">
                {formatCurrency(t.brokerage)}
              </td>
              <td className="px-4 py-3 text-right font-mono">
                {formatCurrency(t.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
