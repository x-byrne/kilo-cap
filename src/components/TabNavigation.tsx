"use client";

type Tab = "matches" | "parcels" | "trades";

interface TabNavigationProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export default function TabNavigation({
  activeTab,
  onTabChange,
}: TabNavigationProps) {
  return (
    <div className="flex border-b border-neutral-800 mb-4">
      {(
        [
          ["matches", "Matched Trades"],
          ["parcels", "Remaining Parcels"],
          ["trades", "All Trades"],
        ] as const
      ).map(([key, label]) => (
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
  );
}
