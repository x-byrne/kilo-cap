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
  calculateCgtSummary,
  calculateLossOffsets,
  detectBrokerFormat,
  filterTradesByFinancialYear,
  getFinancialYear,
  getFinancialYearLabel,
  getTradeFinancialYears,
  matchKey,
  matchAutomaticWithAvailable,
  matchManualWithLocked,
  getHeldDays,
  isCgtDiscountEligible,
  tradesToParcels,
  STRATEGY_LABELS,
  buildMatch,
} from "@/lib/cgt";
import { exportAtoCsv, type CarriedLosses } from "@/lib/export";
import CsvInput from "./CsvInput";
import StrategySelector from "./StrategySelector";
import SummaryCards from "./SummaryCards";
import TaxEstimator from "./TaxEstimator";
import TabNavigation from "./TabNavigation";
import MatchResultsTable from "./MatchResultsTable";
import ParcelsTable from "./ParcelsTable";
import TradesTable from "./TradesTable";
import FyFilter from "./FyFilter";

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
    new Set<string>(),
  );
  const [selectedFy, setSelectedFy] = useState<number | null>(null);
  const [financialYears, setFinancialYears] = useState<number[]>([]);
  const [brokerFormat, setBrokerFormat] = useState<string>("unknown");
  const [preCgtMode, setPreCgtMode] = useState(false);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse CSV");
    }
  }, [csvText]);

  const handleStrategyChange = useCallback(
    (newStrategy: MatchStrategy) => {
      setStrategy(newStrategy);
      if (newStrategy !== "indexation") {
        setPreCgtMode(false);
      }
      if (trades.length > 0) {
        const filtered = selectedFy
          ? filterTradesByFinancialYear(trades, selectedFy)
          : trades;
        const result = recalculate(trades, newStrategy, lockedMatchKeys, preCgtMode);
        applyResults(result);
      }
    },
    [trades, lockedMatchKeys, applyResults, selectedFy, preCgtMode],
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
        const result = recalculate(trades, strategy, next, preCgtMode);
        applyResults(result);
      }
    },
    [lockedMatchKeys, trades, strategy, applyResults, preCgtMode],
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
      const result = recalculate(filtered, strategy, new Set(), preCgtMode);
      applyResults(result);
    }
  }, [trades, strategy, selectedFy, applyResults, preCgtMode]);

  const handleFyChange = useCallback(
    (fy: number | null) => {
      setSelectedFy(fy);
      if (trades.length > 0) {
        const filtered = fy
          ? filterTradesByFinancialYear(trades, fy)
          : trades;
        const result = recalculate(filtered, strategy, lockedMatchKeys, preCgtMode);
        applyResults(result);
      }
    },
    [trades, strategy, lockedMatchKeys, applyResults, preCgtMode],
  );

  const downloadCsv = useCallback(
    (csvContent: string, filename: string) => {
      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    [],
  );

  const handleExportStandard = useCallback(() => {
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
          "Unmatched",
        ].join(","),
      );
    }

    const csv = [header, ...rows].join("\n");
    const fyLabel = selectedFy ? `_FY${selectedFy}` : "_all";
    downloadCsv(csv, `cgt_report_standard${fyLabel}.csv`);
  }, [matches, unmatchedSells, selectedFy, downloadCsv]);

  const handleExportAto = useCallback(() => {
    if (!matches.length && !unmatchedSells.length) return;

    const lossOffsets = calculateLossOffsets(matches);
    const carriedLosses: CarriedLosses = {
      totalCapitalLosses: lossOffsets.totalCapitalLosses,
      lossesAppliedThisFy: lossOffsets.netCapitalGain < 0
        ? lossOffsets.totalCapitalLosses - Math.abs(lossOffsets.netCapitalGain)
        : lossOffsets.totalCapitalLosses,
      carriedForward: lossOffsets.netCapitalGain < 0
        ? Math.abs(lossOffsets.netCapitalGain)
        : 0,
    };

    const fyLabel = selectedFy ? `_FY${selectedFy}` : "_all";
    const strategyLabel =
      STRATEGY_LABELS[strategy] || strategy;
    const csv = exportAtoCsv(matches, unmatchedSells, carriedLosses, strategyLabel, selectedFy);
    downloadCsv(csv, `cgt_report_ato${fyLabel}.csv`);
  }, [matches, unmatchedSells, selectedFy, strategy, downloadCsv]);

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

  const handleCsvTextChange = useCallback((text: string) => {
    setCsvText(text);
  }, []);

  const handleLoadSample = useCallback(() => {
    setCsvText(`trade_id,match_id,date,action,code,units,price,brokerage,total
T001,,2021-01-20,Buy,LRSOC,135175,0.03905,9.5,5288.06
T002,,2021-01-20,Buy,LRSOC,110888,0.043,9.5,4777.68
T003,M003,2021-02-15,Sell,LRSOC,194444,0.06,9.5,11657.14
T004,M003,2021-02-15,Buy,LRSOC,194444,0.053631,9.5,10437.68`);
  }, []);

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
          onCsvTextChange={handleCsvTextChange}
          onParse={handleParse}
          onLoadSample={handleLoadSample}
          onFileUpload={handleFileUpload}
          error={error}
          tradesCount={trades.length}
          brokerFormat={brokerFormat}
        />

        {trades.length > 0 && (
          <>
            <FyFilter
              financialYears={financialYears}
              selectedFy={selectedFy}
              onFyChange={handleFyChange}
              onExportStandard={handleExportStandard}
              onExportAto={handleExportAto}
              hasResults={matches.length > 0 || unmatchedSells.length > 0}
            />

            <StrategySelector
              strategy={strategy}
              onStrategyChange={handleStrategyChange}
              lockedCount={lockedMatchKeys.size}
              preCgtMode={preCgtMode}
              onPreCgtModeChange={setPreCgtMode}
            />

            {summary && <SummaryCards summary={summary} />}

            {summary && (
              <TaxEstimator netCapitalGain={summary.netCapitalGain} />
            )}

            <TabNavigation activeTab={activeTab} onTabChange={setActiveTab}>
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
            </TabNavigation>
          </>
        )}
      </main>
    </div>
  );
}

function recalculate(
  currentTrades: Trade[],
  currentStrategy: MatchStrategy,
  lockedMatchKeys: Set<string>,
  preCgtMode = false,
): {
  matches: Match[];
  unmatchedSells: Trade[];
  remainingParcels: Parcel[];
} {
  const lockedMatches: Match[] = [];
  for (const key of lockedMatchKeys) {
    const parts = key.split("-");
    const units = parseInt(parts[parts.length - 1], 10);
    const sellId = parts[parts.length - 2];
    const buyId = parts.slice(0, parts.length - 2).join("-");
    const buy = currentTrades.find((t) => t.tradeId === buyId);
    const sell = currentTrades.find((t) => t.tradeId === sellId);
    if (!buy || !sell) continue;

    lockedMatches.push(
      buildMatch({
        sell,
        buyTradeId: buy.tradeId,
        buyDate: buy.date,
        buyCostBase: buy.price * units + (units / buy.units) * buy.brokerage,
        units,
        strategy: currentStrategy,
      }),
    );
  }

  const lockedUnits = new Map<string, number>();
  for (const key of lockedMatchKeys) {
    const parts = key.split("-");
    const units = parseInt(parts[parts.length - 1], 10);
    const buyId = parts.slice(0, parts.length - 2).join("-");
    lockedUnits.set(buyId, (lockedUnits.get(buyId) || 0) + units);
  }

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
    .sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

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
    const result = matchManualWithLocked(currentTrades, lockedMatchKeys, currentStrategy, preCgtMode);
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
