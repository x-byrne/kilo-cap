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
  matchTrades,
  calculateCgtSummary,
  formatCurrency,
  formatDate,
  STRATEGY_LABELS,
  STRATEGY_DESCRIPTIONS,
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

  const handleParse = useCallback(() => {
    setError("");
    try {
      const parsed = parseCsv(csvText);
      if (parsed.length === 0) {
        setError("No valid trades found in CSV. Check the format.");
        return;
      }
      setTrades(parsed);
      const result = matchTrades(parsed, strategy);
      setMatches(result.matches);
      setUnmatchedSells(result.unmatchedSells);
      setRemainingParcels(result.remainingParcels);
      setSummary(calculateCgtSummary(result.matches));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse CSV");
    }
  }, [csvText, strategy]);

  const handleStrategyChange = useCallback(
    (newStrategy: MatchStrategy) => {
      setStrategy(newStrategy);
      if (trades.length > 0) {
        const result = matchTrades(trades, newStrategy);
        setMatches(result.matches);
        setUnmatchedSells(result.unmatchedSells);
        setRemainingParcels(result.remainingParcels);
        setSummary(calculateCgtSummary(result.matches));
      }
    },
    [trades],
  );

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
            {error && (
              <span className="text-sm text-red-400">{error}</span>
            )}
            {trades.length > 0 && !error && (
              <span className="text-sm text-neutral-400">
                {trades.length} trades loaded
              </span>
            )}
          </div>
        </section>

        {/* Strategy Selector */}
        {trades.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-4">
              Matching Strategy
            </h2>
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
                    ? "text-red-400"
                    : summary.totalCapitalGain < 0
                      ? "text-green-400"
                      : ""
                }
              />
              <SummaryCard
                label="Taxable Capital Gain (After 50% Discount)"
                value={formatCurrency(summary.totalDiscountedGain)}
                highlight={
                  summary.totalDiscountedGain > 0
                    ? "text-red-400"
                    : summary.totalDiscountedGain < 0
                      ? "text-green-400"
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
        {matches.length > 0 && (
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
              />
            )}
            {activeTab === "parcels" && (
              <ParcelsTable parcels={remainingParcels} />
            )}
            {activeTab === "trades" && <TradesTable trades={trades} />}
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
      <div className={`mt-1 text-xl font-semibold ${highlight || "text-neutral-100"}`}>
        {value}
      </div>
    </div>
  );
}

function MatchResultsTable({
  matches,
  unmatchedSells,
}: {
  matches: Match[];
  unmatchedSells: Trade[];
}) {
  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-900 text-neutral-400 text-left">
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium text-right">Units</th>
              <th className="px-4 py-3 font-medium">Buy Date</th>
              <th className="px-4 py-3 font-medium">Sell Date</th>
              <th className="px-4 py-3 font-medium">Held</th>
              <th className="px-4 py-3 font-medium text-right">
                Proceeds
              </th>
              <th className="px-4 py-3 font-medium text-right">
                Cost Base
              </th>
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
              const heldDays = Math.round(
                (new Date(m.sellDate).getTime() -
                  new Date(m.buyDate).getTime()) /
                  (1000 * 60 * 60 * 24),
              );
              return (
                <tr
                  key={i}
                  className="bg-neutral-950 hover:bg-neutral-900/50 transition-colors"
                >
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
                      m.capitalGain >= 0 ? "text-red-400" : "text-green-400"
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
                        ? "text-red-400"
                        : "text-green-400"
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
              <td className="px-4 py-3" colSpan={5}>
                Total ({matches.length} matches)
              </td>
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
                    ? "text-red-400"
                    : "text-green-400"
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
                    ? "text-red-400"
                    : "text-green-400"
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

      {unmatchedSells.length > 0 && (
        <div className="mt-4 p-4 rounded-lg border border-amber-500/30 bg-amber-500/5">
          <h3 className="text-sm font-medium text-amber-400 mb-2">
            Unmatched Sells ({unmatchedSells.length})
          </h3>
          <div className="text-sm text-neutral-400">
            {unmatchedSells.map((s) => (
              <div key={s.tradeId} className="flex gap-4 py-1">
                <span className="font-mono text-amber-300">
                  {s.tradeId}
                </span>
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
            <th className="px-4 py-3 font-medium text-right">
              Original Units
            </th>
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
                {formatCurrency(
                  p.costBasePerUnit * p.unitsRemaining,
                )}
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
                {t.matchId || "—"}
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
