"use client";

import type { ReactNode } from "react";

interface TabNavigationProps {
  activeTab: "matches" | "parcels" | "trades";
  onTabChange: (tab: "matches" | "parcels" | "trades") => void;
  children: ReactNode;
}

const tabs: { key: "matches" | "parcels" | "trades"; label: string }[] = [
  { key: "matches", label: "Matched Trades" },
  { key: "parcels", label: "Remaining Parcels" },
  { key: "trades", label: "All Trades" },
];

export default function TabNavigation({
  activeTab,
  onTabChange,
  children,
}: TabNavigationProps) {
  return (
    <section>
      <div className="flex border-b border-neutral-800 mb-4">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onTabChange(key)}
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
      {children}
    </section>
  );
}
