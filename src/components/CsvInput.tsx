"use client";

import type { Trade } from "@/lib/types";

const SAMPLE_CSV = `trade_id,match_id,date,action,code,units,price,brokerage,total
T001,,2021-01-20,Buy,LRSOC,135175,0.03905,9.5,5288.06
T002,,2021-01-20,Buy,LRSOC,110888,0.043,9.5,4777.68
T003,M003,2021-02-15,Sell,LRSOC,194444,0.06,9.5,11657.14
T004,M003,2021-02-15,Buy,LRSOC,194444,0.053631,9.5,10437.68`;

interface CsvInputProps {
  csvText: string;
  onCsvTextChange: (text: string) => void;
  onParse: () => void;
  onLoadSample: () => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error: string;
  tradesCount: number;
  brokerFormat: string;
}

export default function CsvInput({
  csvText,
  onCsvTextChange,
  onParse,
  onLoadSample,
  onFileUpload,
  error,
  tradesCount,
  brokerFormat,
}: CsvInputProps) {
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Trade Data</h2>
        <div className="flex gap-3">
          <button
            onClick={onLoadSample}
            className="text-sm px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
          >
            Load Sample
          </button>
          <label className="text-sm px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors cursor-pointer">
            Upload CSV
            <input
              type="file"
              accept=".csv,.txt"
              onChange={onFileUpload}
              className="hidden"
            />
          </label>
        </div>
      </div>

      <textarea
        value={csvText}
        onChange={(e) => onCsvTextChange(e.target.value)}
        placeholder="Paste CSV data here...

Expected columns: trade_id, match_id, date, action, code, units, price, brokerage, total

Example:
trade_id,match_id,date,action,code,units,price,brokerage,total
T001,,2021-01-20,Buy,LRSOC,135175,0.03905,9.5,5288.06"
        className="w-full h-40 bg-neutral-900 border border-neutral-700 rounded-lg p-4 font-mono text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
      />

      <div className="mt-3 flex items-center gap-4">
        <button
          onClick={onParse}
          disabled={!csvText.trim()}
          className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white font-medium text-sm transition-colors"
        >
          Calculate CGT
        </button>
        {error && <span className="text-sm text-red-400">{error}</span>}
        {tradesCount > 0 && !error && (
          <span className="text-sm text-neutral-400">
            {tradesCount} trades loaded
          </span>
        )}
        {brokerFormat !== "unknown" && (
          <span className="text-xs text-neutral-500 border border-neutral-700 rounded px-2 py-0.5">
            Format: {brokerFormat}
          </span>
        )}
      </div>
    </section>
  );
}
