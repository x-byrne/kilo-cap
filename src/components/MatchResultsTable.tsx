"use client";

import { memo } from "react";
import type { Trade } from "@/lib/types";
import { formatDate, formatCurrency } from "@/lib/cgt";

function matchKey(m: { buyTradeId: string; sellTradeId: string; units: number }): string {
  return `${m.buyTradeId}-${m.sellTradeId}-${m.units}`;
}

const MatchResultsTable = memo(function MatchResultsTable({
  matches,
  unmatchedSells,
  lockedMatchKeys,
  onToggleLock,
  onLockAll,
  onUnlockAll,
}: {
  matches: {
    sellTradeId: string;
    buyTradeId: string;
    code: string;
    units: number;
    sellDate: string;
    buyDate: string;
    sellProceeds: number;
    buyCostBase: number;
    capitalGain: number;
    cgtDiscountEligible: boolean;
    discountedGain: number;
  }[];
  unmatchedSells: Trade[];
  lockedMatchKeys: Set<string>;
  onToggleLock: (m: {
    sellTradeId: string;
    buyTradeId: string;
    code: string;
    units: number;
    sellDate: string;
    buyDate: string;
    sellProceeds: number;
    buyCostBase: number;
    capitalGain: number;
    cgtDiscountEligible: boolean;
    discountedGain: number;
  }) => void;
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
                const heldDays =
                  Math.floor(
                    (new Date(m.sellDate).getTime() - new Date(m.buyDate).getTime()) /
                      (1000 * 60 * 60 * 24),
                  );
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
});

export default MatchResultsTable;
