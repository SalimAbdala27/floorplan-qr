export default function InventoryChecklist({ roomInventory, onUpdateItem }) {
  return (
    <div className="space-y-2">
      {roomInventory.items.map((item) => (
        <div key={item.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
          <p className="text-xs font-semibold text-zinc-700">{item.name}</p>
          <div className="mt-1 grid grid-cols-3 gap-1">
            {[
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
      ))}
    </div>
  );
}
