import { useState } from "react";
import FloorplanGenerator from "./FloorplanGenerator.jsx";
import {
  applyConstraints,
  generateConstrainedLayout,
  layoutToStructuredPlan,
  structuredPlanToLayout,
} from "../engine/constraints";
import { improveLayoutWithAI } from "../engine/ai";
import { setFloorplanStoreState, useFloorplanStore } from "../store/floorplanStore";

export default function FloorplanCanvas({
  layout,
  onLayoutChange,
  availableRooms,
  onRoomFloorChange,
}) {
  const [engineMessage, setEngineMessage] = useState("");
  const improving = useFloorplanStore((s) => s.improving);

  const handleLayoutChange = (nextLayout) => {
    onLayoutChange(nextLayout);
  };

  const runImproveLayout = async () => {
    if (!layout) return;

    setFloorplanStoreState({ improving: true, error: null });
    setEngineMessage("Applying constraints...");

    try {
      const structured = layoutToStructuredPlan(layout);
      const constrained = generateConstrainedLayout(structured);
      setEngineMessage("Applying AI refinement...");
      const refined = await improveLayoutWithAI(constrained);
      const finalConstrained = applyConstraints(refined);
      const nextLayout = structuredPlanToLayout(finalConstrained, layout);

      onLayoutChange(nextLayout);
      setFloorplanStoreState({ improving: false, lastPlan: finalConstrained });
      setEngineMessage("Layout improved.");
    } catch {
      setFloorplanStoreState({ improving: false, error: "Failed to improve layout" });
      setEngineMessage("Could not improve layout. Constraints still applied.");

      // Deterministic fallback with no AI.
      try {
        const fallback = applyConstraints(layoutToStructuredPlan(layout));
        onLayoutChange(structuredPlanToLayout(fallback, layout));
      } catch {
        // no-op
      }
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
              Smart Layout
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Enforces rules, then optionally refines with AI.
            </p>
          </div>
          <button
            type="button"
            onClick={runImproveLayout}
            disabled={improving}
            className="h-10 rounded-lg bg-zinc-800 px-3 text-xs font-semibold text-white disabled:opacity-50"
          >
            {improving ? "Improving..." : "Improve Layout"}
          </button>
        </div>
        {engineMessage ? <p className="mt-2 text-xs text-zinc-600">{engineMessage}</p> : null}
      </div>

      <FloorplanGenerator
        layout={layout}
        onLayoutChange={handleLayoutChange}
        availableRooms={availableRooms}
        onRoomFloorChange={onRoomFloorChange}
      />
    </div>
  );
}
