import { zipSync } from "fflate";

function sanitizeSegment(value, fallback = "item") {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, "_");
  return cleaned || fallback;
}

function getExtensionFromMimeType(mimeType = "") {
  const value = String(mimeType).toLowerCase();
  if (value.includes("png")) return "png";
  if (value.includes("webp")) return "webp";
  if (value.includes("heic")) return "heic";
  if (value.includes("heif")) return "heif";
  return "jpg";
}

function getExtensionFromDataUrl(dataUrl = "") {
  const value = String(dataUrl || "").toLowerCase();
  if (value.startsWith("data:image/png")) return "png";
  if (value.startsWith("data:image/webp")) return "webp";
  if (value.startsWith("data:image/heic")) return "heic";
  if (value.startsWith("data:image/heif")) return "heif";
  return "jpg";
}

function getFileName(media, roomName, index) {
  const sourceName = String(media.fileName || "").trim();
  if (sourceName) return sanitizeSegment(sourceName, `image_${index + 1}`);

  const assigned = media.assignment ? sanitizeSegment(media.assignment, "image") : null;
  const typeLabel = media.type === "pano" ? "panorama" : "photo";
  const extension = getExtensionFromMimeType(media.mimeType) || getExtensionFromDataUrl(media.originalUrl || media.url);
  return `${sanitizeSegment(roomName, "room")}_${assigned || typeLabel}_${index + 1}.${extension}`;
}

function dataUrlToUint8Array(dataUrl) {
  const value = String(dataUrl || "");
  const commaIndex = value.indexOf(",");
  if (commaIndex === -1) {
    throw new Error("Invalid image data");
  }
  const base64 = value.slice(commaIndex + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function triggerBlobDownload(blob, fileName) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export function downloadInventoryMediaZip(report, roomsById = {}, propertyName = "property") {
  const zipEntries = {};

  (report?.rooms || []).forEach((roomInventory) => {
    const roomName = roomsById[roomInventory.roomId]?.name || roomInventory.roomId || "room";
    const roomFolder = sanitizeSegment(roomName, "room");

    (roomInventory.media || []).forEach((media, index) => {
      const imageData = media.originalUrl || media.url || media.preview || "";
      if (!String(imageData).startsWith("data:image")) return;
      const fileName = getFileName(media, roomName, index);
      zipEntries[`${roomFolder}/${fileName}`] = dataUrlToUint8Array(imageData);
    });
  });

  const fileCount = Object.keys(zipEntries).length;
  if (!fileCount) {
    throw new Error("No uploaded images available to zip");
  }

  const zipBytes = zipSync(zipEntries, { level: 0 });
  const zipBlob = new Blob([zipBytes], { type: "application/zip" });
  const safePropertyName = sanitizeSegment(propertyName, "property");
  triggerBlobDownload(zipBlob, `${safePropertyName}_inventory_images_full_res.zip`);
  return fileCount;
}
