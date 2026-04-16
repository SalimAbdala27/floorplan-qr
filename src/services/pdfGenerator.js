import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function hexToRgb(hex, fallback = [31, 41, 55]) {
  const value = String(hex || "").replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return fallback;
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function formatCondition(value) {
  if (!value || value === "na") return "Not stated / N/A";
  return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}

function formatLabel(value) {
  if (!value) return "Not stated";
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
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
  const drawX = align === "left" ? x : x + (maxWidth - drawWidth) / 2;
  const drawY = y + (maxHeight - drawHeight) / 2;
  doc.addImage(imageData, imageFormat, drawX, drawY, drawWidth, drawHeight);
  return {
    x: drawX,
    y: drawY,
    width: drawWidth,
    height: drawHeight,
  };
}

function drawRoomMediaGrid(doc, mediaItems, startY, roomName, overallCondition) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const bottomMargin = 14;
  const columns = 3;
  const rowsPerPage = 3;
  const pageSize = columns * rowsPerPage;
  const gapX = 6;
  const gapY = 10;
  const cellWidth = 58;
  const imageHeight = 38;
  const cellHeight = imageHeight + 10;
  const labelOffsetY = imageHeight + 4;
  let pageStartY = startY;

  mediaItems.forEach((media, index) => {
    if (index > 0 && index % pageSize === 0) {
      doc.addPage();
      pageStartY = 18;
    }

    if (index % pageSize === 0) {
      doc.setFontSize(11);
      doc.setTextColor(40, 40, 40);
      const heading = index === 0 ? "Room media" : `Room media (continued)`;
      doc.text(`${heading}: ${roomName}`, marginX, pageStartY);
      doc.setFontSize(9);
      doc.setTextColor(90, 90, 90);
      doc.text(`Overall condition: ${formatCondition(overallCondition)}`, marginX, pageStartY + 5);
      pageStartY += 10;
    }

    const pageIndex = index % pageSize;
    const row = Math.floor(pageIndex / columns);
    const column = pageIndex % columns;
    const x = marginX + (cellWidth + gapX) * column;
    const y = pageStartY + row * (cellHeight + gapY);

    if (y + cellHeight > pageHeight - bottomMargin) {
      doc.addPage();
      pageStartY = 18;
      doc.setFontSize(11);
      doc.setTextColor(40, 40, 40);
      doc.text(`Room media (continued): ${roomName}`, marginX, pageStartY);
      doc.setFontSize(9);
      doc.setTextColor(90, 90, 90);
      doc.text(`Overall condition: ${formatCondition(overallCondition)}`, marginX, pageStartY + 5);
      const continuedY = pageStartY + 10;
      const continuedRow = 0;
      const continuedColumn = 0;
      const continuedX = marginX + (cellWidth + gapX) * continuedColumn;
      const continuedCellY = continuedY + continuedRow * (cellHeight + gapY);

      if (media.preview || media.url?.startsWith("data:image")) {
        try {
          const imageData = media.preview || media.url;
          addContainedImage(doc, imageData, continuedX, continuedCellY, cellWidth, imageHeight);
        } catch {
          doc.setTextColor(90, 90, 90);
          doc.text("Image preview unavailable", continuedX, continuedCellY + 12, { maxWidth: cellWidth });
        }
      } else {
        doc.setTextColor(90, 90, 90);
        doc.text("Image preview unavailable", continuedX, continuedCellY + 12, { maxWidth: cellWidth });
      }

      doc.setFontSize(8);
      doc.setTextColor(90, 90, 90);
      doc.text(media.type === "pano" ? "Panorama" : "Photo", continuedX, continuedCellY + labelOffsetY, {
        maxWidth: cellWidth,
      });
      if (media.assignment) {
        doc.text(`Assigned: ${media.assignment}`, continuedX, continuedCellY + labelOffsetY + 4, {
          maxWidth: cellWidth,
        });
      }
      return;
    }

    if (media.preview || media.url?.startsWith("data:image")) {
      try {
        const imageData = media.preview || media.url;
        addContainedImage(doc, imageData, x, y, cellWidth, imageHeight);
      } catch {
        doc.setTextColor(90, 90, 90);
        doc.text("Image preview unavailable", x, y + 12, { maxWidth: cellWidth });
      }
    } else {
      doc.setTextColor(90, 90, 90);
      doc.text("Image preview unavailable", x, y + 12, { maxWidth: cellWidth });
    }

    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    doc.text(media.type === "pano" ? "Panorama" : "Photo", x, y + labelOffsetY, { maxWidth: cellWidth });
    if (media.assignment) {
      doc.text(`Assigned: ${media.assignment}`, x, y + labelOffsetY + 4, { maxWidth: cellWidth });
    }
  });
}

export function generateInventoryPdf(report, roomsById, propertyName = "Property", options = {}) {
  const branding = options.branding || {};
  const doc = new jsPDF();
  const now = new Date().toLocaleString();
  const primaryRgb = hexToRgb(branding.primaryColor, [31, 41, 55]);
  const accentRgb = hexToRgb(branding.accentColor, [226, 232, 240]);
  let summaryRendered = false;

  if (branding.logoDataUrl) {
    try {
      addContainedImage(doc, branding.logoDataUrl, 14, 10, 20, 20, "PNG", "left");
    } catch {
      // no-op
    }
  }

  doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
  doc.setFontSize(16);
  doc.text(`${propertyName} - Inventory Report`, branding.logoDataUrl ? 38 : 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(`Generated ${now}`, branding.logoDataUrl ? 38 : 14, 22);
  if (branding.companyName) {
    doc.text(`Prepared by ${branding.companyName}`, branding.logoDataUrl ? 38 : 14, 27);
  }

  let y = branding.companyName ? 34 : 30;

  if (report.summary || report.checks || report.additionalNotes || report.conductedBy) {
    summaryRendered = true;
    autoTable(doc, {
      startY: y,
      head: [["Summary", "Status"]],
      body: [
        ["Cleanliness", formatLabel(report.summary?.cleanliness)],
        ["Smells", formatLabel(report.summary?.smells)],
        ["Tidiness", formatLabel(report.summary?.tidiness)],
        ["Bins", formatLabel(report.summary?.bins)],
        ["Furniture", formatLabel(report.summary?.furniture)],
        ["Appliances", formatLabel(report.summary?.appliances)],
        ["Fire/smoke alarms test", formatLabel(report.checks?.fireSmokeAlarms)],
        ["Hot water", formatLabel(report.checks?.hotWater)],
        ["Ventilation", formatLabel(report.checks?.ventilation)],
        ["Gas smell", formatLabel(report.checks?.gasSmell)],
        ["Report conducted by", report.conductedBy || "Not stated"],
        ["Additional notes", report.additionalNotes || "None"],
      ],
      styles: { fontSize: 9, cellPadding: 2, valign: "top" },
      headStyles: { fillColor: primaryRgb },
      alternateRowStyles: { fillColor: accentRgb },
      columnStyles: {
        0: { cellWidth: 56 },
        1: { cellWidth: 120 },
      },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  report.rooms.forEach((roomInventory, index) => {
    if ((index === 0 && summaryRendered) || index > 0) {
      doc.addPage();
      y = 18;
    }

    const room = roomsById[roomInventory.roomId];
    const roomName = room?.name || roomInventory.roomId;

    doc.setFontSize(13);
    doc.text(roomName, 14, y);
    y += 5;
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.text(`Overall condition: ${formatCondition(roomInventory.overallCondition)}`, 14, y);
    y += 4;
    doc.text(`Visually documented: ${roomInventory.visuallyDocumented ? "Yes" : "No"}`, 14, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      head: [["Item", "Condition", "Notes"]],
      body: roomInventory.items.map((item) => [
        item.name,
        formatCondition(item.condition),
        item.notes || "",
      ]),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: primaryRgb },
      alternateRowStyles: { fillColor: accentRgb },
    });

    y = doc.lastAutoTable.finalY + 6;

    if (!roomInventory.media.length) {
      doc.setFontSize(9);
      doc.text("No media attached", 14, y);
      return;
    }

    drawRoomMediaGrid(doc, roomInventory.media, y, roomName, roomInventory.overallCondition);
  });

  doc.save(`${propertyName.toLowerCase().replace(/\s+/g, "_")}_inventory_report.pdf`);
}
