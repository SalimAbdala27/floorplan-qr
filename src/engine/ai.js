import { applyConstraints, generateConstrainedLayout, normalizePlan } from "./constraints";

function extractJsonObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function collectIds(plan) {
  return new Set((plan?.floors || []).flatMap((floor) => floor.map((room) => room.id)));
}

function idsMatch(before, after) {
  const a = collectIds(before);
  const b = collectIds(after);
  if (a.size !== b.size) return false;
  for (const id of a) {
    if (!b.has(id)) return false;
  }
  return true;
}

export async function improveLayoutWithAI(plan) {
  const constrained = generateConstrainedLayout(plan);
  const apiKey = process.env.REACT_APP_OPENAI_API_KEY;
  const model = process.env.REACT_APP_OPENAI_MODEL || "gpt-4.1-mini";

  // Safe fallback when no client-side API key is configured.
  if (!apiKey) return constrained;

  const prompt = [
    "You are optimizing a building floorplan.",
    "Return ONLY valid JSON with shape: { \"floors\": Room[][] }.",
    "Each Room must have: id, type, floor, x, y, width, height.",
    "Rules:",
    "1) Bedrooms must be on floor > 0.",
    "1b) Kitchens and living rooms should be on ground floor.",
    "2) Stairs near entrance (x:0,y:0) and on ground floor.",
    "2b) Stairs should be vertically aligned through floors.",
    "3) Living room on ground floor.",
    "4) Bathrooms near bedrooms, same floor if possible, and stacked vertically where possible.",
    "5) Keep public/private zoning sensible and avoid overlaps.",
    "6) Never delete rooms; keep same IDs.",
    "Input JSON:",
    JSON.stringify(constrained),
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: prompt,
        temperature: 0.1,
      }),
    });

    if (!response.ok) return constrained;

    const payload = await response.json();
    const outputText = payload.output_text || "";
    const jsonText = extractJsonObject(outputText);
    if (!jsonText) return constrained;

    const parsed = JSON.parse(jsonText);
    const normalized = normalizePlan(parsed);
    if (!idsMatch(constrained, normalized)) return constrained;

    // Enforce deterministic constraints after AI response.
    return applyConstraints(normalized);
  } catch {
    return constrained;
  }
}
