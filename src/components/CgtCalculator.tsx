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
  getHeldDays,
  getTradeFinancialYears,
  getFinancialYear,
  getFinancialYearLabel,
  filterTradesByFinancialYear,
  matchKey,
} from "@/lib/cgt";
import CsvInput from "./CsvInput";
import StrategySelector from "./StrategySelector";
import SummaryCards from "./SummaryCards";
import TabNavigation from "./TabNavigation";
import MatchResultsTable from "./MatchResultsTable";
import ParcelsTable from "./ParcelsTable";
import TradesTable from "./TradesTable";
import FyFilter from "./FyFilter";

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
  const lockedMatches: Match[] = [];
  for (const key of lockedMatchKeys) {
    const m = buildMatchFromKey(key, currentTrades);
    if (m) lockedMatches.push(m);
  }

  const lockedUnits = getLockedUnits(lockedMatchKeys, currentTrades);

  const allParcels = tradesToParcels(currentTrades);
  const availableParcels: Parcel[] = [];
  for (const p of allParcels) {
    const locked = lockedUnits.get(p.tradeId) || 0;
    const remaining = p.unitsRemaining - locked;
    if (remaining > 0) {
      availableParcels.push({ ...p, unitsRemaining: remaining });
    }
  }

  const allSells = currentTrades
    .filter((t) => t.action === "Sell")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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
      }
    }
  }

  const unmatchedSells: Trade[] = [];
  for (const t of trades) {
    if (
      t.action === "Sell" &&
      !t.matchId &&
      !lockedSellIds.has(t.tradeId)
    ) {
      unmatchedSells.push(t);
    }
  }

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
        <CsvInput
          csvText={csvText}
          onCsvTextChange={setCsvText}
          onParse={handleParse}
          onLoadSample={loadSample}
          onFileUpload={handleFileUpload}
          error={error}
          tradesCount={trades.length}
        />

        {trades.length > 0 && (
          <FyFilter
            financialYears={financialYears}
            selectedFy={selectedFy}
            onFyChange={handleFyChange}
            onExport={handleExport}
            hasResults={matches.length > 0 || unmatchedSells.length > 0}
          />
        )}

        {trades.length > 0 && (
          <StrategySelector
            strategy={strategy}
            onStrategyChange={handleStrategyChange}
            lockedCount={lockedCount}
          />
        )}

        {summary && <SummaryCards summary={summary} />}

        {trades.length > 0 && (
          <section>
            <TabNavigation
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />

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
