"use client";

import type { Parcel } from "@/lib/types";
import { formatDate, formatCurrency } from "@/lib/cgt";

interface ParcelsTableProps {
  parcels: Parcel[];
}

export default function ParcelsTable({ parcels }: ParcelsTableProps) {
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
            <th scope="col" className="px-4 py-3 font-medium">Buy ID</th>
            <th scope="col" className="px-4 py-3 font-medium">Code</th>
            <th scope="col" className="px-4 py-3 font-medium">Date</th>
            <th scope="col" className="px-4 py-3 font-medium text-right">Original Units</th>
            <th scope="col" className="px-4 py-3 font-medium text-right">
              Remaining Units
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-right">
              Cost Base/Unit
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-right">
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
                {formatCurrency(p.costBasePerUnit * p.unitsRemaining)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
