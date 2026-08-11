"use client";

import type { Trade } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/cgt";

interface TradesTableProps {
  trades: Trade[];
}

export default function TradesTable({ trades }: TradesTableProps) {
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
