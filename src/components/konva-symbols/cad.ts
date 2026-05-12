export const CAD_STROKE = "#18181b";
export const CAD_DETAIL = "#52525b";
export const CAD_LIGHT = "#a1a1aa";
export const CAD_FILL = "#ffffff";
export const CAD_SURFACE = "#f8fafc";

export function cadStroke(width: number, height: number, factor = 0.028) {
  return Math.max(1, Math.min(width, height) * factor);
}

export function cadDash(stroke: number) {
  return [Math.max(3, stroke * 2.4), Math.max(2, stroke * 1.8)];
}
