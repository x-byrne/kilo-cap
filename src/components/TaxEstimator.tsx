"use client";

import { useState, useMemo } from "react";
import { calculateEstimatedTax, type TaxEstimatorResult } from "@/lib/taxEstimator";
import { formatCurrency } from "@/lib/cgt";

interface TaxEstimatorProps {
  netCapitalGain: number;
}

export default function TaxEstimator({ netCapitalGain }: TaxEstimatorProps) {
  const [taxableIncome, setTaxableIncome] = useState("");
  const [isExpanded, setIsExpanded] = useState(true);

  const result: TaxEstimatorResult | null = useMemo(() => {
    const income = parseFloat(taxableIncome.replace(/,/g, ""));
    if (isNaN(income) || income < 0) return null;
    return calculateEstimatedTax(income, netCapitalGain);
  }, [taxableIncome, netCapitalGain]);

  const formatRate = (rate: number) => `${(rate * 100).toFixed(1)}%`;

  return (
    <section className="mb-8">
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full p-4 flex items-center justify-between text-left"
          aria-expanded={isExpanded}
        >
          <h2 className="text-lg font-semibold">Estimated Tax Payable</h2>
          <span className="text-neutral-400 text-sm">
            {isExpanded ? "Hide" : "Show"}
          </span>
        </button>

        {isExpanded && (
          <div className="px-4 pb-4 space-y-4">
            <div>
              <label
                htmlFor="taxable-income"
                className="block text-sm text-neutral-400 mb-1"
              >
                Taxable income (salary, other income)
              </label>
              <input
                id="taxable-income"
                type="text"
                value={taxableIncome}
                onChange={(e) => setTaxableIncome(e.target.value)}
                placeholder="e.g. 85000"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {result && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <ResultCard
                  label="Marginal Tax Rate"
                  value={formatRate(result.marginalRate)}
                />
                <ResultCard
                  label="Tax on Capital Gain"
                  value={formatCurrency(result.taxOnGain)}
                  highlight="text-green-400"
                />
                <ResultCard
                  label="Total Estimated Tax"
                  value={formatCurrency(result.totalTax)}
                />
                <ResultCard
                  label="Effective Tax Rate"
                  value={formatRate(result.effectiveRate)}
                />
              </div>
            )}

            {netCapitalGain !== 0 && result && (
              <div className="text-xs text-neutral-500">
                Net capital gain used:{" "}
                <span className="text-neutral-400 font-medium">
                  {formatCurrency(netCapitalGain)}
                </span>
              </div>
            )}

            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-xs text-neutral-500">
              <strong className="text-neutral-400">Disclaimer:</strong> This
              calculator provides estimates only based on 2024–25 Australian
              marginal tax rates and the Medicare levy. It does not account for
              all individual circumstances, tax offsets, deductions, or changes
              in legislation. Consult a registered tax agent for personalised
              advice.
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

interface ResultCardProps {
  label: string;
  value: string;
  highlight?: string;
}

function ResultCard({ label, value, highlight = "" }: ResultCardProps) {
  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-4">
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
