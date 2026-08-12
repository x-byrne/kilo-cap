"use client";

import type { CgtSummary } from "@/lib/types";
import { formatCurrency } from "@/lib/cgt";

interface SummaryCardsProps {
  summary: CgtSummary;
}

export default function SummaryCards({ summary }: SummaryCardsProps) {
  return (
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
  );
}

interface SummaryCardProps {
  label: string;
  value: string;
  highlight?: string;
}

function SummaryCard({ label, value, highlight = "" }: SummaryCardProps) {
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
