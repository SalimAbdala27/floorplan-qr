import type { FloorPlan } from "./constraints";

export { generateLayout } from "./layout.js";

export type LayoutGenerator = (plan: FloorPlan) => FloorPlan;
