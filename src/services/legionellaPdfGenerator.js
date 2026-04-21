import jsPDF from "jspdf";
import { assessLegionellaRisk, formatLegionellaValue } from "./legionellaAssessment.js";

function hexToRgb(hex, fallback = [31, 41, 55]) {
  const value = String(hex || "").replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return fallback;
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function withAlpha(rgb, alpha = 0.12) {
  return [
    Math.round(255 - ((255 - rgb[0]) * alpha)),
    Math.round(255 - ((255 - rgb[1]) * alpha)),
    Math.round(255 - ((255 - rgb[2]) * alpha)),
  ];
}

function safeText(value, fallback = "Not stated") {
  const text = String(value || "").trim();
  return text || fallback;
}

function drawFieldCard(doc, label, value, x, y, width) {
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(228, 228, 231);
  doc.roundedRect(x, y, width, 20, 5, 5, "FD");
  doc.setFontSize(7);
  doc.setTextColor(113, 113, 122);
  doc.text(label.toUpperCase(), x + 4, y + 6);
  doc.setFontSize(10);
  doc.setTextColor(24, 24, 27);
  doc.text(doc.splitTextToSize(value, width - 8), x + 4, y + 13);
}

export function generateLegionellaPdf({
  assessment,
  propertyName = "Property",
  propertyAddress = "",
  branding = {},
}) {
  const doc = new jsPDF();
  const primaryRgb = hexToRgb(branding.primaryColor, [31, 41, 55]);
  const accentRgb = hexToRgb(branding.accentColor, [192, 132, 84]);
  const accentSoft = withAlpha(accentRgb, 0.12);
  const result = assessment?.riskResult ? assessment : { ...assessment, ...assessLegionellaRisk(assessment) };

  doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
  doc.rect(0, 0, 210, 297, "F");
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(14, 18, 182, 250, 10, 10, "F");
  doc.setFillColor(accentRgb[0], accentRgb[1], accentRgb[2]);
  doc.rect(14, 18, 182, 8, "F");

  doc.setFontSize(9);
  doc.setTextColor(accentRgb[0], accentRgb[1], accentRgb[2]);
  doc.text("LEGIONELLA RISK ASSESSMENT", 22, 38);
  doc.setFontSize(22);
  doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
  doc.text(propertyName, 22, 50, { maxWidth: 166 });
  doc.setFontSize(11);
  doc.setTextColor(82, 82, 91);
  doc.text(doc.splitTextToSize(safeText(propertyAddress, propertyName), 166), 22, 58);

  drawFieldCard(doc, "Assessor Name", safeText(result.assessorName), 22, 78, 80);
  drawFieldCard(doc, "Assessment Date", safeText(result.assessmentDate), 108, 78, 80);
  drawFieldCard(doc, "Vacancy Duration", formatLegionellaValue(result.vacancyDuration), 22, 104, 80);
  drawFieldCard(doc, "Water System Type", formatLegionellaValue(result.waterSystemType), 108, 104, 80);
  drawFieldCard(doc, "Little-used outlets?", formatLegionellaValue(result.littleUsedOutlets), 22, 130, 80);
  drawFieldCard(doc, "System condition", formatLegionellaValue(result.systemCondition), 108, 130, 80);
  drawFieldCard(doc, "Water temperature adequate?", formatLegionellaValue(result.waterTemperatureAdequate), 22, 156, 166);

  doc.setFillColor(accentSoft[0], accentSoft[1], accentSoft[2]);
  doc.roundedRect(22, 190, 166, 48, 8, 8, "F");
  doc.setFontSize(8);
  doc.setTextColor(113, 113, 122);
  doc.text("RESULT", 28, 202);
  doc.setFontSize(24);
  doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
  doc.text(result.riskResult || "NOT ASSESSED", 28, 216);
  doc.setFontSize(10);
  doc.setTextColor(82, 82, 91);
  doc.text(doc.splitTextToSize(safeText(result.riskSummary, "Assessment has not been completed."), 154), 28, 225);

  doc.setFontSize(8);
  doc.setTextColor(113, 113, 122);
  doc.text(safeText(propertyAddress, propertyName), 14, 289, { maxWidth: 120 });
  doc.text("Page 1 of 1", 196, 289, { align: "right" });

  doc.save(`${propertyName.toLowerCase().replace(/\s+/g, "_")}_legionella_risk_assessment.pdf`);
}
