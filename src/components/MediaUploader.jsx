import { useState } from "react";

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function loadImageMeta(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = reject;
    image.onload = () => resolve({ width: image.width, height: image.height });
    image.src = dataUrl;
  });
}

function loadImageElement(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = reject;
    image.onload = () => resolve(image);
    image.src = dataUrl;
  });
}

function compressDataUrl(image, maxLongEdge, quality = 0.72) {
  const longestEdge = Math.max(image.width, image.height);
  const scale = Math.min(1, maxLongEdge / longestEdge);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

export default function MediaUploader({ onCapturePanorama, onCaptureDetailPhoto }) {
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file, mode = "pano") => {
    if (!file) return;

    try {
      setUploading(true);
      const sourceDataUrl = await readFileAsDataUrl(file);
      await loadImageMeta(sourceDataUrl);
      const imageEl = await loadImageElement(sourceDataUrl);
      const compressedDataUrl =
        compressDataUrl(imageEl, mode === "pano" ? 2200 : 1600, mode === "pano" ? 0.68 : 0.74) || sourceDataUrl;

      const media = {
        id: `media_${Date.now()}`,
        type: mode === "pano" ? "pano" : "photo",
        url: compressedDataUrl,
        preview: compressedDataUrl,
      };

      if (mode === "pano") {
        onCapturePanorama(media);
      } else if (onCaptureDetailPhoto) {
        onCaptureDetailPhoto(media);
      }
    } catch {
      // ignore bad files
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="h-9 rounded-lg bg-zinc-800 px-3 text-[11px] font-semibold text-white flex items-center cursor-pointer">
        {uploading ? "Uploading panorama..." : "Capture Room (Panorama)"}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => handleFile(event.target.files?.[0], "pano")}
        />
      </label>
      <label className="h-9 rounded-lg bg-zinc-200 px-3 text-[11px] font-semibold text-zinc-700 flex items-center cursor-pointer">
        Quick Capture Detail
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => handleFile(event.target.files?.[0], "detail")}
        />
      </label>
    </div>
  );
}
