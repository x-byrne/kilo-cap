"use client";

import type { MatchStrategy } from "@/lib/types";
import { STRATEGY_LABELS, STRATEGY_DESCRIPTIONS } from "@/lib/cgt";

interface StrategySelectorProps {
  strategy: MatchStrategy;
  onStrategyChange: (s: MatchStrategy) => void;
  lockedCount: number;
}

const strategies: MatchStrategy[] = [
  "fifo",
  "lifo",
  "min-taxable-income",
  "max-taxable-income",
  "min-cost-base",
  "max-cost-base",
  "manual",
];

export default function StrategySelector({
  strategy,
  onStrategyChange,
  lockedCount,
}: StrategySelectorProps) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-4">Matching Strategy</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {strategies.map((s) => (
          <button
            key={s}
            onClick={() => onStrategyChange(s)}
            className={`text-left p-3 rounded-lg border transition-colors ${
              strategy === s
                ? "border-blue-500 bg-blue-500/10 text-blue-300"
                : "border-neutral-700 bg-neutral-900 hover:border-neutral-600 text-neutral-300"
            }`}
          >
            <div className="font-medium text-sm">{STRATEGY_LABELS[s]}</div>
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
  );
}
