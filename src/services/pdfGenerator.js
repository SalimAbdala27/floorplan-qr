import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export function generateInventoryPdf(report, roomsById, propertyName = "Property") {
  const doc = new jsPDF();
  const now = new Date().toLocaleString();

  doc.setFontSize(16);
  doc.text(`${propertyName} - Inventory Report`, 14, 16);
  doc.setFontSize(10);
  doc.text(`Generated ${now}`, 14, 22);

  let y = 30;

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

    autoTable(doc, {
      startY: y,
      head: [["Item", "Condition", "Notes"]],
      body: roomInventory.items.map((item) => [
        item.name,
        item.condition,
        item.notes || "",
      ]),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [31, 41, 55] },
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
        doc.setTextColor(20, 90, 180);
        doc.text(`View 360 online: ${media.url}`, 110, y + 6, { maxWidth: 85 });
        doc.setTextColor(0, 0, 0);
      }

      y += 56;
    });
  });

  doc.save(`${propertyName.toLowerCase().replace(/\s+/g, "_")}_inventory_report.pdf`);
}
