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

export function generateInventoryPdf(report, roomsById, propertyName = "Property", options = {}) {
  const branding = options.branding || {};
  const doc = new jsPDF();
  const now = new Date().toLocaleString();
  const primaryRgb = hexToRgb(branding.primaryColor, [31, 41, 55]);
  const accentRgb = hexToRgb(branding.accentColor, [226, 232, 240]);

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
    if (index > 0) {
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

    roomInventory.media.slice(0, 3).forEach((media) => {
      if (y > 250) {
        doc.addPage();
        y = 18;
      }

      doc.setFontSize(9);
      doc.text(media.type === "pano" ? "Panorama" : "Photo", 14, y);
      y += 4;

      if (media.preview || media.url?.startsWith("data:image")) {
        try {
          const imageData = media.preview || media.url;
          addContainedImage(doc, imageData, 14, y, 90, 50);
        } catch {
          doc.text("Image preview unavailable", 14, y + 4);
        }
      }

      if (media.type === "pano") {
        doc.setTextColor(80, 80, 80);
        doc.text("360 panorama captured", 110, y + 6, { maxWidth: 85 });
        doc.setTextColor(0, 0, 0);
      }
      if (media.assignment) {
        doc.setTextColor(80, 80, 80);
        doc.text(`Assigned to: ${media.assignment}`, 110, y + (media.type === "pano" ? 12 : 6), {
          maxWidth: 85,
        });
        doc.setTextColor(0, 0, 0);
      }

      y += 56;
    });
  });

  doc.save(`${propertyName.toLowerCase().replace(/\s+/g, "_")}_inventory_report.pdf`);
}
