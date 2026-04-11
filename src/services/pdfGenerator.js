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

export function generateInventoryPdf(report, roomsById, propertyName = "Property", options = {}) {
  const branding = options.branding || {};
  const doc = new jsPDF();
  const now = new Date().toLocaleString();
  const primaryRgb = hexToRgb(branding.primaryColor, [31, 41, 55]);
  const accentRgb = hexToRgb(branding.accentColor, [226, 232, 240]);

  if (branding.logoDataUrl) {
    try {
      doc.addImage(branding.logoDataUrl, "PNG", 14, 10, 20, 20);
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
          doc.addImage(imageData, "JPEG", 14, y, 90, 50);
        } catch {
          doc.text("Image preview unavailable", 14, y + 4);
        }
      }

      if (media.type === "pano") {
        doc.setTextColor(80, 80, 80);
        doc.text("360 panorama captured", 110, y + 6, { maxWidth: 85 });
        doc.setTextColor(0, 0, 0);
      }

      y += 56;
    });
  });

  doc.save(`${propertyName.toLowerCase().replace(/\s+/g, "_")}_inventory_report.pdf`);
}
