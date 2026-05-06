import { useEffect, useState } from "react";

function normalizeHexColor(value) {
  const cleanValue = String(value || "").trim();
  const match = cleanValue.match(/^#?([0-9a-fA-F]{6})$/);
  return match ? `#${match[1].toLowerCase()}` : null;
}

export default function ColorHexField({
  label,
  value,
  onChange,
  fallback = "#1f2937",
  className = "",
  inputClassName = "",
}) {
  const safeValue = normalizeHexColor(value) || normalizeHexColor(fallback) || "#1f2937";
  const [draftValue, setDraftValue] = useState(safeValue);

  useEffect(() => {
    setDraftValue(safeValue);
  }, [safeValue]);

  const commitColor = (nextValue) => {
    const normalized = normalizeHexColor(nextValue);
    setDraftValue(nextValue);
    if (normalized) {
      onChange?.(normalized);
    }
  };

  return (
    <label className={`rounded-lg border border-zinc-200 px-2 py-1 text-[11px] text-zinc-600 ${className}`}>
      {label}
      <div className="mt-1 grid grid-cols-[2.75rem_1fr] gap-2">
        <input
          type="color"
          value={safeValue}
          onChange={(event) => commitColor(event.target.value)}
          aria-label={`${label} colour picker`}
          className={`h-9 w-full cursor-pointer rounded border border-zinc-200 bg-white p-1 ${inputClassName}`}
        />
        <input
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          spellCheck="false"
          value={draftValue}
          onChange={(event) => commitColor(event.target.value)}
          onBlur={() => setDraftValue(safeValue)}
          aria-label={`${label} hex colour`}
          className="h-9 min-w-0 rounded border border-zinc-200 px-2 font-mono text-xs uppercase text-zinc-700 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
        />
      </div>
    </label>
  );
}
