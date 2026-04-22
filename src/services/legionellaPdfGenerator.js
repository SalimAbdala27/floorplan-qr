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

function ensureReadableAccentHex(hex, fallback = "#15803d") {
  const value = String(hex || "").trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) return fallback;
  const [r, g, b] = hexToRgb(value, [21, 128, 61]);
  const luminance = (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
  if (luminance <= 170) return value;
  return fallback;
}

function withAlpha(rgb, alpha = 0.12) {
  return [
    Math.round(255 - ((255 - rgb[0]) * alpha)),
    Math.round(255 - ((255 - rgb[1]) * alpha)),
    Math.round(255 - ((255 - rgb[2]) * alpha)),
  ];
}

function mixRgb(baseRgb, targetRgb, ratio = 0.5) {
  return baseRgb.map((value, index) => Math.round(value + ((targetRgb[index] - value) * ratio)));
}

function createPdfThemeTokens(primaryRgb, accentRgb, preset = "light") {
  const accentDarkRgb = mixRgb(accentRgb, [0, 0, 0], 0.28);
  const accentSoftRgb = withAlpha(accentRgb, preset === "dark" ? 0.22 : 0.18);

  if (preset === "dark") {
    return {
      coverRgb: [5, 10, 18],
      cardRgb: [17, 24, 39],
      cardMutedRgb: [12, 19, 32],
      borderRgb: [51, 65, 85],
      titleTextRgb: [241, 245, 249],
      bodyTextRgb: [203, 213, 225],
      mutedTextRgb: [148, 163, 184],
      footerTextRgb: [148, 163, 184],
      inverseTextRgb: [255, 255, 255],
      sectionBarRgb: accentDarkRgb,
      accentSoftRgb,
    };
  }

  return {
    coverRgb: primaryRgb,
    cardRgb: [255, 255, 255],
    cardMutedRgb: accentSoftRgb,
    borderRgb: [228, 228, 231],
    titleTextRgb: primaryRgb,
    bodyTextRgb: [82, 82, 91],
    mutedTextRgb: [113, 113, 122],
    footerTextRgb: [113, 113, 122],
    inverseTextRgb: [255, 255, 255],
    sectionBarRgb: accentDarkRgb,
    accentSoftRgb,
  };
}

function safeText(value, fallback = "Not stated") {
  const text = String(value || "").trim();
  return text || fallback;
}

function drawFieldCard(doc, label, value, x, y, width, theme) {
  doc.setFillColor(theme.cardRgb[0], theme.cardRgb[1], theme.cardRgb[2]);
  doc.setDrawColor(theme.borderRgb[0], theme.borderRgb[1], theme.borderRgb[2]);
  doc.roundedRect(x, y, width, 20, 5, 5, "FD");
  doc.setFontSize(7);
  doc.setTextColor(theme.mutedTextRgb[0], theme.mutedTextRgb[1], theme.mutedTextRgb[2]);
  doc.text(label.toUpperCase(), x + 4, y + 6);
  doc.setFontSize(10);
  doc.setTextColor(theme.titleTextRgb[0], theme.titleTextRgb[1], theme.titleTextRgb[2]);
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
  const accentRgb = hexToRgb(ensureReadableAccentHex(branding.accentColor, "#15803d"), [21, 128, 61]);
  const theme = createPdfThemeTokens(primaryRgb, accentRgb, branding.themePreset === "dark" ? "dark" : "light");
  const accentSoft = theme.cardMutedRgb;
  const result = assessment?.riskResult ? assessment : { ...assessment, ...assessLegionellaRisk(assessment) };

  doc.setFillColor(theme.coverRgb[0], theme.coverRgb[1], theme.coverRgb[2]);
  doc.rect(0, 0, 210, 297, "F");
  doc.setFillColor(theme.cardRgb[0], theme.cardRgb[1], theme.cardRgb[2]);
  doc.roundedRect(14, 18, 182, 250, 10, 10, "F");
  doc.setFillColor(theme.sectionBarRgb[0], theme.sectionBarRgb[1], theme.sectionBarRgb[2]);
  doc.rect(14, 18, 182, 8, "F");

  doc.setFontSize(9);
  doc.setTextColor(accentRgb[0], accentRgb[1], accentRgb[2]);
  doc.text("LEGIONELLA RISK ASSESSMENT", 22, 38);
  doc.setFontSize(22);
  doc.setTextColor(theme.titleTextRgb[0], theme.titleTextRgb[1], theme.titleTextRgb[2]);
  doc.text(propertyName, 22, 50, { maxWidth: 166 });
  doc.setFontSize(11);
  doc.setTextColor(theme.bodyTextRgb[0], theme.bodyTextRgb[1], theme.bodyTextRgb[2]);
  doc.text(doc.splitTextToSize(safeText(propertyAddress, propertyName), 166), 22, 58);

  drawFieldCard(doc, "Assessor Name", safeText(result.assessorName), 22, 78, 80, theme);
  drawFieldCard(doc, "Assessment Date", safeText(result.assessmentDate), 108, 78, 80, theme);
  drawFieldCard(doc, "Vacancy Duration", formatLegionellaValue(result.vacancyDuration), 22, 104, 80, theme);
  drawFieldCard(doc, "Water System Type", formatLegionellaValue(result.waterSystemType), 108, 104, 80, theme);
  drawFieldCard(doc, "Little-used outlets?", formatLegionellaValue(result.littleUsedOutlets), 22, 130, 80, theme);
  drawFieldCard(doc, "System condition", formatLegionellaValue(result.systemCondition), 108, 130, 80, theme);
  drawFieldCard(doc, "Water temperature adequate?", formatLegionellaValue(result.waterTemperatureAdequate), 22, 156, 166, theme);

  doc.setFillColor(accentSoft[0], accentSoft[1], accentSoft[2]);
  doc.roundedRect(22, 190, 166, 48, 8, 8, "F");
  doc.setFontSize(8);
  doc.setTextColor(theme.mutedTextRgb[0], theme.mutedTextRgb[1], theme.mutedTextRgb[2]);
  doc.text("RESULT", 28, 202);
  doc.setFontSize(24);
  doc.setTextColor(theme.titleTextRgb[0], theme.titleTextRgb[1], theme.titleTextRgb[2]);
  doc.text(result.riskResult || "NOT ASSESSED", 28, 216);
  doc.setFontSize(10);
  doc.setTextColor(theme.bodyTextRgb[0], theme.bodyTextRgb[1], theme.bodyTextRgb[2]);
  doc.text(doc.splitTextToSize(safeText(result.riskSummary, "Assessment has not been completed."), 154), 28, 225);

  doc.setFontSize(8);
  doc.setTextColor(theme.footerTextRgb[0], theme.footerTextRgb[1], theme.footerTextRgb[2]);
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.text(safeText(propertyAddress, propertyName), 14, 289, { maxWidth: 120 });
    doc.text(`Page ${page} of ${totalPages}`, 196, 289, { align: "right" });
  }

  doc.save(`${propertyName.toLowerCase().replace(/\s+/g, "_")}_legionella_risk_assessment.pdf`);
}
