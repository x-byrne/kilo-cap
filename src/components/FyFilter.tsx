"use client";

import { getFinancialYearLabel } from "@/lib/cgt";

interface FyFilterProps {
  financialYears: number[];
  selectedFy: number | null;
  onFyChange: (fy: number | null) => void;
  onExport: () => void;
  hasResults: boolean;
}

export default function FyFilter({
  financialYears,
  selectedFy,
  onFyChange,
  onExport,
  hasResults,
}: FyFilterProps) {
  return (
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
                onFyChange(
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
          onClick={onExport}
          disabled={!hasResults}
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
  );
}
