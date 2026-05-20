const CONDITION_LABELS = {
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

const CONDITION_BADGE_CLASSES = {
  good: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  fair: "bg-amber-50 text-amber-700 ring-amber-100",
  poor: "bg-red-50 text-red-700 ring-red-100",
};

export default function InventoryChecklist({ roomInventory, onUpdateItem }) {
  return (
    <div className="space-y-2">
      {roomInventory.items.map((item) => {
        const hasCondition = item.condition && item.condition !== "na";
        return (
        <div key={item.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-xs font-semibold text-zinc-700">{item.name}</p>
            {hasCondition ? (
              <span
                className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ring-1 ${
                  CONDITION_BADGE_CLASSES[item.condition] || "bg-zinc-100 text-zinc-600 ring-zinc-200"
                }`}
              >
                {CONDITION_LABELS[item.condition] || item.condition}
              </span>
            ) : null}
          </div>
          <div className="mt-1 grid grid-cols-4 gap-1">
            {[
              { key: "na", label: "N/A" },
              { key: "good", label: "Good" },
              { key: "fair", label: "Fair" },
              { key: "poor", label: "Poor" },
            ].map((option) => (
              <button
                key={`${item.id}-${option.key}`}
                type="button"
                onClick={() => onUpdateItem(item.id, { condition: option.key })}
                className={`h-8 rounded-lg text-[11px] font-semibold ${
                  item.condition === option.key
                    ? "bg-zinc-800 text-white"
                    : "bg-zinc-200 text-zinc-700"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <input
            value={item.notes || ""}
            onChange={(event) => onUpdateItem(item.id, { notes: event.target.value })}
            placeholder="Notes"
            className="mt-2 h-8 w-full rounded-lg border border-zinc-300 px-2 text-xs"
          />
        </div>
        );
      })}
    </div>
  );
}
