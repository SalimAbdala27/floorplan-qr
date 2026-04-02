export type Room = {
  id: string;
  type: "bedroom" | "kitchen" | "bathroom" | "stairs" | "living" | "hallway";
  floor: number;
  x: number;
  y: number;
  width: number;
  height: number;
  name?: string;
};

export type FloorPlan = {
  floors: Room[][];
};

export { applyConstraints, normalizePlan, layoutToStructuredPlan, structuredPlanToLayout, generateConstrainedLayout } from "./constraints.js";
