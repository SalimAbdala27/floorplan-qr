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

function formatLabel(value) {
  if (!value) return "Not stated";
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function safeText(value, fallback = "Not stated") {
  const text = String(value || "").trim();
  return text || fallback;
}

function getImageFormat(dataUrl, fallback = "JPEG") {
  const value = String(dataUrl || "").toLowerCase();
  if (value.startsWith("data:image/png")) return "PNG";
  if (value.startsWith("data:image/webp")) return "WEBP";
  return fallback;
}

function addContainedImage(doc, imageData, x, y, maxWidth, maxHeight, fallbackFormat = "JPEG", align = "center") {
  const imageFormat = getImageFormat(imageData, fallbackFormat);
  const props = doc.getImageProperties(imageData);
  const width = props?.width || maxWidth;
  const height = props?.height || maxHeight;
  const scale = Math.min(maxWidth / width, maxHeight / height);
  const drawWidth = Math.max(1, width * scale);
  const drawHeight = Math.max(1, height * scale);
  const drawX = align === "left" ? x : x + ((maxWidth - drawWidth) / 2);
  const drawY = y + ((maxHeight - drawHeight) / 2);
  doc.addImage(imageData, imageFormat, drawX, drawY, drawWidth, drawHeight);
  return {
    x: drawX,
    y: drawY,
    width: drawWidth,
    height: drawHeight,
  };
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
      accentDarkRgb,
      accentSoftRgb,
      canvasRgb: [9, 14, 24],
      sectionBarRgb: [6, 11, 20],
      coverRgb: [5, 10, 18],
      cardRgb: [17, 24, 39],
      cardAltRgb: [24, 34, 54],
      cardMutedRgb: [12, 19, 32],
      borderRgb: [51, 65, 85],
      titleTextRgb: [241, 245, 249],
      bodyTextRgb: [203, 213, 225],
      mutedTextRgb: [148, 163, 184],
      inverseTextRgb: [255, 255, 255],
      footerTextRgb: [148, 163, 184],
      footerLineRgb: [71, 85, 105],
      tableHeadRgb: [6, 11, 20],
      imagePlaceholderRgb: [30, 41, 59],
    };
  }

  return {
    accentDarkRgb,
    accentSoftRgb,
    canvasRgb: [255, 248, 239],
    sectionBarRgb: accentDarkRgb,
    coverRgb: primaryRgb,
    cardRgb: [255, 252, 247],
    cardAltRgb: [247, 242, 232],
    cardMutedRgb: [250, 244, 235],
    borderRgb: [232, 223, 210],
    titleTextRgb: primaryRgb,
    bodyTextRgb: [70, 82, 98],
    mutedTextRgb: [94, 104, 118],
    inverseTextRgb: [255, 255, 255],
    footerTextRgb: [125, 112, 100],
    footerLineRgb: [234, 223, 208],
    tableHeadRgb: primaryRgb,
    imagePlaceholderRgb: [246, 239, 230],
  };
}

function drawEditorialBackdrop(doc, theme, accentRgb, options = {}) {
  const topRight = options.topRight ?? { x: 184, y: 30, r: 28 };
  const bottomLeft = options.bottomLeft ?? { x: 30, y: 252, r: 22 };
  const glow = options.glow ?? { x: 42, y: 44, r: 34 };
  doc.setFillColor(theme.canvasRgb[0], theme.canvasRgb[1], theme.canvasRgb[2]);
  doc.rect(0, 0, 210, 297, "F");
  doc.setFillColor(accentRgb[0], accentRgb[1], accentRgb[2]);
  doc.setGState(new doc.GState({ opacity: 0.14 }));
  doc.circle(topRight.x, topRight.y, topRight.r, "F");
  doc.setFillColor(theme.cardMutedRgb[0], theme.cardMutedRgb[1], theme.cardMutedRgb[2]);
  doc.circle(bottomLeft.x, bottomLeft.y, bottomLeft.r, "F");
  doc.setFillColor(theme.cardAltRgb[0], theme.cardAltRgb[1], theme.cardAltRgb[2]);
  doc.circle(glow.x, glow.y, glow.r, "F");
  doc.setGState(new doc.GState({ opacity: 1 }));
}

function conditionTone(value) {
  if (value === "good") {
    return {
      label: "Good",
      fill: [223, 248, 232],
      text: [23, 92, 50],
    };
  }
  if (value === "fair") {
    return {
      label: "Fair",
      fill: [254, 243, 199],
      text: [146, 99, 18],
    };
  }
  if (value === "poor") {
    return {
      label: "Poor",
      fill: [254, 226, 226],
      text: [153, 27, 27],
    };
  }
  return {
    label: "Not stated",
    fill: [244, 244, 245],
    text: [82, 82, 91],
  };
}

function drawTextBlock(doc, text, x, y, maxWidth, lineHeight = 5) {
  const lines = doc.splitTextToSize(String(text || ""), maxWidth);
  doc.text(lines, x, y);
  return y + (lines.length * lineHeight);
}

function drawPill(doc, label, x, y, fillRgb, textRgb, padX = 4, height = 8) {
  const width = doc.getTextWidth(label) + (padX * 2);
  doc.setFillColor(fillRgb[0], fillRgb[1], fillRgb[2]);
  doc.roundedRect(x, y, width, height, 4, 4, "F");
  doc.setTextColor(textRgb[0], textRgb[1], textRgb[2]);
  doc.text(label, x + (width / 2), y + (height / 2) + 0.2, { align: "center" });
  return width;
}

function drawDivider(doc, y, rgb) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  doc.setLineWidth(0.45);
  doc.line(14, y, 196, y);
}

function drawSectionHeading(doc, title, subtitle, y, primaryRgb, accentRgb, theme) {
  drawEditorialBackdrop(doc, theme, accentRgb);
  doc.setFillColor(theme.sectionBarRgb[0], theme.sectionBarRgb[1], theme.sectionBarRgb[2]);
  doc.rect(0, 0, 210, 16, "F");
  doc.setFontSize(8);
  doc.setTextColor(accentRgb[0], accentRgb[1], accentRgb[2]);
  doc.text(title.toUpperCase(), 14, 10.5);
  doc.setFontSize(20);
  doc.setTextColor(theme.titleTextRgb[0], theme.titleTextRgb[1], theme.titleTextRgb[2]);
  doc.text(subtitle, 14, 31);
  drawDivider(doc, 36, accentRgb);
  return y + 22;
}

function ensureSpace(doc, y, neededHeight, onNewPage) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + neededHeight <= pageHeight - 18) return y;
  doc.addPage();
  return onNewPage();
}

function formatDeclarationDate(value) {
  if (!value) return "Not stated";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function drawLegionellaSection(doc, report, propertyName, propertyAddress, primaryRgb, accentRgb, theme) {
  const accentSoft = theme.cardMutedRgb;
  const legionella = report?.legionella || {};
  const result = legionella.riskResult ? legionella : { ...legionella, ...assessLegionellaRisk(legionella) };
  let y = drawSectionHeading(doc, "Legionella", "Risk Assessment", 18, primaryRgb, accentRgb, theme);

  const cards = [
    ["Property Address", propertyAddress],
    ["Assessor", safeText(result.assessorName)],
    ["Assessment Date", safeText(result.assessmentDate)],
    ["Vacancy Duration", formatLegionellaValue(result.vacancyDuration)],
    ["Water System Type", formatLegionellaValue(result.waterSystemType)],
    ["Little-used outlets?", formatLegionellaValue(result.littleUsedOutlets)],
    ["System condition", formatLegionellaValue(result.systemCondition)],
    ["Water temperature adequate?", formatLegionellaValue(result.waterTemperatureAdequate)],
  ];

  cards.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 14 + (column * 91);
    const cardY = y + (row * 22);
    doc.setFillColor(theme.cardRgb[0], theme.cardRgb[1], theme.cardRgb[2]);
    doc.setDrawColor(theme.borderRgb[0], theme.borderRgb[1], theme.borderRgb[2]);
    doc.roundedRect(x, cardY, 87, 18, 5, 5, "FD");
    doc.setFontSize(7);
    doc.setTextColor(theme.mutedTextRgb[0], theme.mutedTextRgb[1], theme.mutedTextRgb[2]);
    doc.text(label.toUpperCase(), x + 4, cardY + 6);
    doc.setFontSize(10);
    doc.setTextColor(theme.titleTextRgb[0], theme.titleTextRgb[1], theme.titleTextRgb[2]);
    doc.text(doc.splitTextToSize(String(value), 79), x + 4, cardY + 13);
  });

  y += (Math.ceil(cards.length / 2) * 22) + 8;
  doc.setFillColor(accentSoft[0], accentSoft[1], accentSoft[2]);
  doc.roundedRect(14, y, 182, 42, 8, 8, "F");
  doc.setFontSize(8);
  doc.setTextColor(theme.mutedTextRgb[0], theme.mutedTextRgb[1], theme.mutedTextRgb[2]);
  doc.text("RESULT", 18, y + 8);
  doc.setFontSize(22);
  doc.setTextColor(theme.titleTextRgb[0], theme.titleTextRgb[1], theme.titleTextRgb[2]);
  doc.text(result.riskResult || "NOT ASSESSED", 18, y + 22);
  doc.setFontSize(10);
  doc.setTextColor(theme.bodyTextRgb[0], theme.bodyTextRgb[1], theme.bodyTextRgb[2]);
  drawTextBlock(doc, safeText(result.riskSummary, "Assessment has not been completed."), 18, y + 30, 174, 5);
}

function getRoomConditionMap(roomInventory) {
  const map = new Map();
  (roomInventory.items || []).forEach((item) => {
    map.set(String(item.name || "").toLowerCase(), item.condition || "na");
  });
  return map;
}

function groupRoomMedia(roomInventory) {
  const groups = new Map();
  const conditionByItem = getRoomConditionMap(roomInventory);

  (roomInventory.media || []).forEach((media) => {
    const assignment = safeText(media.assignment, "Overall Room");
    if (!groups.has(assignment)) {
      const assignmentKey = assignment.toLowerCase();
      groups.set(assignment, {
        title: assignment,
        condition:
          assignmentKey === "overall room"
            ? roomInventory.overallCondition || "na"
            : conditionByItem.get(assignmentKey) || roomInventory.overallCondition || "na",
        items: [],
      });
    }
    groups.get(assignment).items.push(media);
  });

  if (!groups.size) {
    groups.set("Overall Room", {
      title: "Overall Room",
      condition: roomInventory.overallCondition || "na",
      items: [],
    });
  }

  return Array.from(groups.values());
}

function drawStatCard(doc, label, value, x, y, width, accentRgb, theme, barRgb = accentRgb) {
  doc.setFillColor(theme.cardRgb[0], theme.cardRgb[1], theme.cardRgb[2]);
  doc.setDrawColor(theme.borderRgb[0], theme.borderRgb[1], theme.borderRgb[2]);
  doc.roundedRect(x, y, width, 20, 6, 6, "FD");
  doc.setFillColor(barRgb[0], barRgb[1], barRgb[2]);
  doc.roundedRect(x + 4, y + 4, 3, 12, 1.5, 1.5, "F");
  doc.setFontSize(7);
  doc.setTextColor(theme.mutedTextRgb[0], theme.mutedTextRgb[1], theme.mutedTextRgb[2]);
  doc.text(label.toUpperCase(), x + 11, y + 8);
  doc.setFontSize(12);
  doc.setTextColor(theme.titleTextRgb[0], theme.titleTextRgb[1], theme.titleTextRgb[2]);
  doc.text(String(value), x + 11, y + 15);
}

function drawMediaCard(doc, media, x, y, width, height, primaryRgb, theme) {
  doc.setFillColor(theme.cardRgb[0], theme.cardRgb[1], theme.cardRgb[2]);
  doc.setDrawColor(theme.borderRgb[0], theme.borderRgb[1], theme.borderRgb[2]);
  doc.roundedRect(x, y, width, height, 6, 6, "FD");

  const imageX = x + 3;
  const imageY = y + 3;
  const imageWidth = width - 6;
  const imageHeight = 50;
  doc.setFillColor(theme.imagePlaceholderRgb[0], theme.imagePlaceholderRgb[1], theme.imagePlaceholderRgb[2]);
  doc.roundedRect(imageX, imageY, imageWidth, imageHeight, 5, 5, "F");

  if (media.preview || media.url?.startsWith("data:image")) {
    try {
      addContainedImage(doc, media.preview || media.url, imageX + 1, imageY + 1, imageWidth - 2, imageHeight - 2);
    } catch {
      doc.setFontSize(8);
      doc.setTextColor(theme.mutedTextRgb[0], theme.mutedTextRgb[1], theme.mutedTextRgb[2]);
      doc.text("Image preview unavailable", imageX + 4, imageY + 24, { maxWidth: imageWidth - 8 });
    }
  } else {
    doc.setFontSize(8);
    doc.setTextColor(theme.mutedTextRgb[0], theme.mutedTextRgb[1], theme.mutedTextRgb[2]);
    doc.text("Image preview unavailable", imageX + 4, imageY + 24, { maxWidth: imageWidth - 8 });
  }

  doc.setFontSize(7);
  const tagY = y + 60;
  const typeLabel = media.type === "pano" ? "Panorama" : "Photo";
  const typeWidth = drawPill(doc, typeLabel, x + 3, tagY, theme.cardAltRgb, theme.bodyTextRgb, 3, 7);
  if (media.assignment) {
    drawPill(doc, formatLabel(media.assignment), x + 6 + typeWidth, tagY, withAlpha(primaryRgb, 0.12), primaryRgb, 3, 7);
  }

  doc.setFontSize(8);
  doc.setTextColor(theme.bodyTextRgb[0], theme.bodyTextRgb[1], theme.bodyTextRgb[2]);
  const capturedText = media.capturedAt
    ? `Captured ${new Date(media.capturedAt).toLocaleString()}`
    : "Capture date not recorded";
  drawTextBlock(doc, capturedText, x + 3, y + 73, width - 6, 4);
}

function drawRoomSection(doc, roomInventory, roomName, primaryRgb, accentRgb, theme) {
  const accentSoft = theme.cardMutedRgb;
  let y = drawSectionHeading(doc, "Inventory Room", roomName, 18, primaryRgb, accentRgb, theme);
  const overallTone = conditionTone(roomInventory.overallCondition);
  const mediaCount = roomInventory.media?.length || 0;
  const panoCount = roomInventory.media?.filter((media) => media.type === "pano").length || 0;
  const assignedCount = roomInventory.media?.filter((media) => media.assignment).length || 0;

  drawStatCard(doc, "Overall", overallTone.label, 14, y, 56, accentRgb, theme, overallTone.text);
  drawStatCard(doc, "Photos", mediaCount, 77, y, 56, accentRgb, theme);
  drawStatCard(doc, "Panoramas", panoCount, 140, y, 56, accentRgb, theme);
  y += 28;

  doc.setFillColor(accentSoft[0], accentSoft[1], accentSoft[2]);
  doc.roundedRect(14, y, 182, 18, 6, 6, "F");
  doc.setFontSize(9);
  doc.setTextColor(theme.bodyTextRgb[0], theme.bodyTextRgb[1], theme.bodyTextRgb[2]);
  doc.text(`Visually documented: ${roomInventory.visuallyDocumented ? "Yes" : "No"}`, 18, y + 7);
  doc.text(`Assigned images: ${assignedCount}/${mediaCount}`, 18, y + 13);
  doc.setFontSize(8);
  drawPill(doc, overallTone.label, 152, y + 5, overallTone.fill, overallTone.text, 4, 7);
  y += 26;

  const groups = groupRoomMedia(roomInventory);
  groups.forEach((group, index) => {
    const tone = conditionTone(group.condition);
    const columns = 3;
    const gap = 6;
    const cardWidth = 56;
    const cardHeight = 84;
    const sectionHeaderHeight = group.items.length ? cardHeight + 16 : 20;
    const drawGroupHeader = () => {
      doc.setFontSize(12);
      doc.setTextColor(theme.titleTextRgb[0], theme.titleTextRgb[1], theme.titleTextRgb[2]);
      doc.text(formatLabel(group.title), 14, y);
      doc.setFontSize(8);
      drawPill(doc, tone.label, 108, y - 5, tone.fill, tone.text, 4, 7);
      doc.setTextColor(theme.mutedTextRgb[0], theme.mutedTextRgb[1], theme.mutedTextRgb[2]);
      doc.text(`${group.items.length} image${group.items.length === 1 ? "" : "s"}`, 196, y, { align: "right" });
      drawDivider(doc, y + 3, index % 2 === 0 ? accentRgb : [226, 232, 240]);
      y += 8;
    };

    y = ensureSpace(
          doc,
          y,
          sectionHeaderHeight,
          () => drawSectionHeading(doc, "Inventory Room", `${roomName} continued`, 18, primaryRgb, accentRgb, theme)
        );
    drawGroupHeader();

    if (!group.items.length) {
      doc.setFontSize(9);
      doc.setTextColor(theme.mutedTextRgb[0], theme.mutedTextRgb[1], theme.mutedTextRgb[2]);
      doc.text("No images attached to this section.", 14, y + 4);
      y += 12;
      return;
    }

    group.items.forEach((media, mediaIndex) => {
      if (mediaIndex > 0 && mediaIndex % columns === 0) {
        y += cardHeight + gap;
      }

      if (mediaIndex % columns === 0) {
        y = ensureSpace(
          doc,
          y,
          cardHeight + 8,
          () => {
            y = drawSectionHeading(doc, "Inventory Room", `${roomName} continued`, 18, primaryRgb, accentRgb, theme);
            drawGroupHeader();
            return y;
          }
        );
      }

      const column = mediaIndex % columns;
      const x = 14 + (column * (cardWidth + gap));
      drawMediaCard(doc, media, x, y, cardWidth, cardHeight, primaryRgb, theme);
    });

    y += cardHeight + 12;
  });
}

export function appendInventoryPdf(doc, report, roomsById, propertyName = "Property", options = {}) {
  const branding = options.branding || {};
  const includeLegionella = Boolean(options.includeLegionella);
  const applyPageNumbers = Boolean(options.applyPageNumbers);
  const now = new Date().toLocaleString();
  const primaryRgb = hexToRgb(branding.primaryColor, [31, 41, 55]);
  const accentRgb = hexToRgb(ensureReadableAccentHex(branding.accentColor, "#15803d"), [21, 128, 61]);
  const theme = createPdfThemeTokens(primaryRgb, accentRgb, branding.themePreset === "dark" ? "dark" : "light");
  const accentSoft = theme.cardMutedRgb;
  const companyName = safeText(branding.companyName, "Inventory Team");
  const propertyAddress = safeText(report?.propertyAddress, propertyName);
  const brandImage =
    branding?.brandImageVariant === "header" && branding?.headerLogoDataUrl
      ? { dataUrl: branding.headerLogoDataUrl, variant: "header" }
      : branding?.logoDataUrl
        ? { dataUrl: branding.logoDataUrl, variant: "logo" }
        : branding?.headerLogoDataUrl
          ? { dataUrl: branding.headerLogoDataUrl, variant: "header" }
          : { dataUrl: null, variant: "logo" };

  const rooms = report?.rooms || [];
  const totalMedia = rooms.reduce((count, room) => count + (room.media?.length || 0), 0);
  const totalPanos = rooms.reduce(
    (count, room) => count + (room.media || []).filter((media) => media.type === "pano").length,
    0
  );

  const isHeaderBanner = brandImage.variant === "header" && Boolean(brandImage.dataUrl);
  doc.setFillColor(theme.coverRgb[0], theme.coverRgb[1], theme.coverRgb[2]);
  doc.rect(0, 0, 210, 297, "F");
  doc.setFillColor(accentRgb[0], accentRgb[1], accentRgb[2]);
  doc.circle(178, 34, 34, "F");
  doc.setFillColor(theme.cardMutedRgb[0], theme.cardMutedRgb[1], theme.cardMutedRgb[2]);
  doc.circle(30, 248, 26, "F");
  doc.setFillColor(theme.cardRgb[0], theme.cardRgb[1], theme.cardRgb[2]);
  doc.setGState(new doc.GState({ opacity: 0.12 }));
  doc.roundedRect(14, 18, 182, 250, 18, 18, "F");
  doc.setGState(new doc.GState({ opacity: 1 }));
  doc.setFillColor(theme.cardRgb[0], theme.cardRgb[1], theme.cardRgb[2]);
  doc.roundedRect(14, 18, 182, 110, 10, 10, "F");

  if (brandImage.dataUrl) {
    try {
      if (brandImage.variant === "header") {
        addContainedImage(doc, brandImage.dataUrl, 22, 22, 166, 18, "PNG", "center");
      } else {
        addContainedImage(doc, brandImage.dataUrl, 22, 24, 28, 22, "PNG", "left");
      }
    } catch {
      // no-op
    }
  }

  const titleX = brandImage.dataUrl && brandImage.variant === "logo" ? 56 : 22;
  const titleY = isHeaderBanner ? 52 : 46;
  const addressY = isHeaderBanner ? 60 : 54;
  const metaY = isHeaderBanner ? 82 : 76;
  doc.setFontSize(9);
  doc.setTextColor(accentRgb[0], accentRgb[1], accentRgb[2]);
  doc.text("PROPERTY INVENTORY", titleX, 33);
  doc.setFontSize(24);
  doc.setTextColor(theme.titleTextRgb[0], theme.titleTextRgb[1], theme.titleTextRgb[2]);
  doc.text(propertyName, titleX, titleY, { maxWidth: 124 });
  doc.setFontSize(11);
  doc.setTextColor(theme.bodyTextRgb[0], theme.bodyTextRgb[1], theme.bodyTextRgb[2]);
  drawTextBlock(doc, propertyAddress, titleX, addressY, 124, 5);

  doc.setFillColor(accentSoft[0], accentSoft[1], accentSoft[2]);
  doc.roundedRect(22, metaY, 166, 34, 8, 8, "F");
  doc.setFontSize(9);
  doc.setTextColor(theme.bodyTextRgb[0], theme.bodyTextRgb[1], theme.bodyTextRgb[2]);
  doc.text(`Generated ${now}`, 28, metaY + 12);
  doc.text(`Prepared by ${companyName}`, 28, metaY + 20);
  doc.text(`Rooms inspected ${rooms.length}`, 28, metaY + 28);
  doc.setFontSize(8);
  drawPill(doc, `${totalMedia} images`, 128, metaY + 8, theme.cardRgb, theme.titleTextRgb, 4, 8);
  drawPill(doc, `${totalPanos} panoramas`, 128, metaY + 19, theme.cardRgb, theme.titleTextRgb, 4, 8);

  doc.setFillColor(theme.cardRgb[0], theme.cardRgb[1], theme.cardRgb[2]);
  doc.setGState(new doc.GState({ opacity: 0.14 }));
  doc.roundedRect(14, 138, 182, 34, 10, 10, "F");
  doc.setGState(new doc.GState({ opacity: 1 }));
  doc.setFontSize(10);
  doc.setTextColor(theme.inverseTextRgb[0], theme.inverseTextRgb[1], theme.inverseTextRgb[2]);
  doc.text("A visual record of room condition, grouped by area for quick review.", 20, 151);
  drawDivider(doc, 156, accentRgb);
  doc.setFontSize(9);
  doc.setTextColor(theme.bodyTextRgb[0], theme.bodyTextRgb[1], theme.bodyTextRgb[2]);
  doc.text("Clean image cards, assignment-based subsections, traffic-light condition markers, and a final summary.", 20, 165);

  rooms.forEach((roomInventory) => {
    doc.addPage();
    const room = roomsById[roomInventory.roomId];
    const roomName = room?.name || roomInventory.roomId;
    drawRoomSection(doc, roomInventory, roomName, primaryRgb, accentRgb, theme);
  });

  if (
    report?.declaration?.declarantName ||
    report?.declaration?.declarantRole ||
    report?.declaration?.statement ||
    report?.declaration?.signatureDataUrl
  ) {
    doc.addPage();
    let y = drawSectionHeading(doc, "Declaration", "Signed Statement", 18, primaryRgb, accentRgb, theme);
    const cards = [
      { label: "Declarant", value: safeText(report.declaration?.declarantName) },
      { label: "Role", value: safeText(report.declaration?.declarantRole) },
      { label: "Declared", value: formatDeclarationDate(report.declaration?.declaredAt) },
    ];

    cards.forEach((card, index) => {
      const x = 14 + (index * 60);
      doc.setFillColor(theme.cardRgb[0], theme.cardRgb[1], theme.cardRgb[2]);
      doc.setDrawColor(theme.borderRgb[0], theme.borderRgb[1], theme.borderRgb[2]);
      doc.roundedRect(x, y, 56, 22, 6, 6, "FD");
      doc.setFontSize(7);
      doc.setTextColor(theme.mutedTextRgb[0], theme.mutedTextRgb[1], theme.mutedTextRgb[2]);
      doc.text(card.label.toUpperCase(), x + 4, y + 7);
      doc.setFontSize(10);
      doc.setTextColor(theme.titleTextRgb[0], theme.titleTextRgb[1], theme.titleTextRgb[2]);
      doc.text(doc.splitTextToSize(card.value, 48), x + 4, y + 14);
    });
    y += 30;

    doc.setFillColor(accentSoft[0], accentSoft[1], accentSoft[2]);
    doc.roundedRect(14, y, 182, 40, 8, 8, "F");
    doc.setFontSize(8);
    doc.setTextColor(theme.mutedTextRgb[0], theme.mutedTextRgb[1], theme.mutedTextRgb[2]);
    doc.text("STATEMENT", 18, y + 8);
    doc.setFontSize(10);
    doc.setTextColor(theme.titleTextRgb[0], theme.titleTextRgb[1], theme.titleTextRgb[2]);
    drawTextBlock(doc, safeText(report.declaration?.statement), 18, y + 15, 174, 5);
    y += 52;

    doc.setFontSize(10);
    doc.setTextColor(theme.titleTextRgb[0], theme.titleTextRgb[1], theme.titleTextRgb[2]);
    doc.text("Signature", 14, y);

    if (report.declaration?.signatureDataUrl) {
      try {
        addContainedImage(doc, report.declaration.signatureDataUrl, 14, y + 6, 80, 28, "PNG", "left");
      } catch {
        // no-op
      }
    } else {
      const boxY = y + 6;
      doc.setTextColor(70, 70, 70);
      doc.setDrawColor(160, 160, 160);
      doc.setLineWidth(0.35);
      doc.rect(14, boxY, 80, 28);
      doc.line(18, boxY + 22, 90, boxY + 22);
    }
  }

  const hasLegionellaContent =
    Boolean(report?.legionella?.assessorName) ||
    Boolean(report?.legionella?.assessmentDate) ||
    Boolean(report?.legionella?.riskResult) ||
    Boolean(report?.legionella?.assessedAt);

  if (includeLegionella && hasLegionellaContent) {
    doc.addPage();
    drawLegionellaSection(doc, report, propertyName, propertyAddress, primaryRgb, accentRgb, theme);
  }

  doc.addPage();
  let y = drawSectionHeading(doc, "Summary", "Inspection Overview", 18, primaryRgb, accentRgb, theme);
  const summaryEntries = [
    ["Cleanliness", formatLabel(report?.summary?.cleanliness)],
    ["Smells", formatLabel(report?.summary?.smells)],
    ["Tidiness", formatLabel(report?.summary?.tidiness)],
    ["Bins", formatLabel(report?.summary?.bins)],
    ["Furniture", formatLabel(report?.summary?.furniture)],
    ["Appliances", formatLabel(report?.summary?.appliances)],
    ["Fire/smoke alarms", formatLabel(report?.checks?.fireSmokeAlarms)],
    ["Hot water", formatLabel(report?.checks?.hotWater)],
    ["Ventilation", formatLabel(report?.checks?.ventilation)],
    ["Gas smell", formatLabel(report?.checks?.gasSmell)],
  ];

  summaryEntries.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 14 + (column * 91);
    const cardY = y + (row * 20);
    doc.setFillColor(theme.cardRgb[0], theme.cardRgb[1], theme.cardRgb[2]);
    doc.setDrawColor(theme.borderRgb[0], theme.borderRgb[1], theme.borderRgb[2]);
    doc.roundedRect(x, cardY, 87, 16, 5, 5, "FD");
    doc.setFontSize(7);
    doc.setTextColor(theme.mutedTextRgb[0], theme.mutedTextRgb[1], theme.mutedTextRgb[2]);
    doc.text(label.toUpperCase(), x + 4, cardY + 6);
    doc.setFontSize(10);
    doc.setTextColor(theme.titleTextRgb[0], theme.titleTextRgb[1], theme.titleTextRgb[2]);
    doc.text(String(value), x + 4, cardY + 12, { maxWidth: 79 });
  });
  y += (Math.ceil(summaryEntries.length / 2) * 20) + 4;

  drawDivider(doc, y, accentRgb);
  y += 10;
  doc.setFillColor(accentSoft[0], accentSoft[1], accentSoft[2]);
  doc.roundedRect(14, y, 87, 22, 6, 6, "F");
  doc.roundedRect(109, y, 87, 22, 6, 6, "F");
  doc.setFontSize(7);
  doc.setTextColor(theme.mutedTextRgb[0], theme.mutedTextRgb[1], theme.mutedTextRgb[2]);
  doc.text("CONDUCTED BY", 18, y + 7);
  doc.text("ADDRESS", 113, y + 7);
  doc.setFontSize(11);
  doc.setTextColor(theme.titleTextRgb[0], theme.titleTextRgb[1], theme.titleTextRgb[2]);
  doc.text(safeText(report?.conductedBy), 18, y + 15, { maxWidth: 79 });
  doc.text(doc.splitTextToSize(propertyAddress, 79), 113, y + 15);
  y += 32;

  doc.setFillColor(theme.cardRgb[0], theme.cardRgb[1], theme.cardRgb[2]);
  doc.setDrawColor(theme.borderRgb[0], theme.borderRgb[1], theme.borderRgb[2]);
  doc.roundedRect(14, y, 182, 52, 8, 8, "FD");
  doc.setFontSize(7);
  doc.setTextColor(theme.mutedTextRgb[0], theme.mutedTextRgb[1], theme.mutedTextRgb[2]);
  doc.text("ADDITIONAL NOTES", 18, y + 8);
  doc.setFontSize(10);
  doc.setTextColor(theme.titleTextRgb[0], theme.titleTextRgb[1], theme.titleTextRgb[2]);
  drawTextBlock(doc, safeText(report?.additionalNotes, "No additional notes recorded."), 18, y + 16, 174, 5);

  if (applyPageNumbers) {
    const totalPages = doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      doc.setPage(page);
      doc.setFontSize(8);
      doc.setTextColor(theme.footerTextRgb[0], theme.footerTextRgb[1], theme.footerTextRgb[2]);
      doc.text(propertyAddress, 14, 289, { maxWidth: 120 });
      doc.text(`Page ${page} of ${totalPages}`, 196, 289, { align: "right" });
    }
  }
}

export function generateInventoryPdf(report, roomsById, propertyName = "Property", options = {}) {
  const doc = new jsPDF();
  appendInventoryPdf(doc, report, roomsById, propertyName, {
    ...options,
    applyPageNumbers: true,
  });
  doc.save(`${propertyName.toLowerCase().replace(/\s+/g, "_")}_inventory_report.pdf`);
}
