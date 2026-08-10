import type { CgtSummary } from "@/lib/types";
import { formatCurrency } from "@/lib/cgt";

export function SummaryCard({
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
      <div
        className={`mt-1 text-xl font-semibold ${highlight || "text-neutral-100"}`}
      >
        {value}
      </div>
    </div>
  );
}
