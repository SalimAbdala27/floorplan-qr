import type { FloorPlan } from "./constraints";

export { improveLayoutWithAI } from "./ai.js";

export type AIImprover = (plan: FloorPlan) => Promise<FloorPlan>;
