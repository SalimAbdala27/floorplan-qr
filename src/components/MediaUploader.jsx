import { useState } from "react";

const IMAGE_ACCEPT =
  "image/*,.heic,.heif,image/heic,image/heif,image/heic-sequence,image/heif-sequence";

function isHeifLikeFile(file) {
  const type = String(file?.type || "").toLowerCase();
  const name = String(file?.name || "").toLowerCase();
  return type.includes("heic") || type.includes("heif") || name.endsWith(".heic") || name.endsWith(".heif");
}

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
  const [error, setError] = useState("");

  const handleFiles = async (files, mode = "pano") => {
    const selectedFiles = Array.from(files || []).filter(Boolean);
    if (!selectedFiles.length) return;

    setUploading(true);
    setError("");

    let failedFile = null;

    for (const file of selectedFiles) {
      try {
        const sourceDataUrl = await readFileAsDataUrl(file);
        await loadImageMeta(sourceDataUrl);
        const imageEl = await loadImageElement(sourceDataUrl);
        const compressedDataUrl =
          compressDataUrl(imageEl, mode === "pano" ? 2200 : 1600, mode === "pano" ? 0.68 : 0.74) || sourceDataUrl;

        const media = {
          id: `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: mode === "pano" ? "pano" : "photo",
          url: compressedDataUrl,
          preview: compressedDataUrl,
          originalUrl: sourceDataUrl,
          fileName: file.name || `${mode === "pano" ? "panorama" : "photo"}_${Date.now()}.jpg`,
          mimeType: file.type || "image/jpeg",
        };

        if (mode === "pano") {
          onCapturePanorama(media);
        } else if (onCaptureDetailPhoto) {
          onCaptureDetailPhoto(media);
        }
      } catch {
        failedFile = file;
      }
    }

    if (failedFile) {
      setError(
        isHeifLikeFile(failedFile)
          ? "One or more HEIF/HEIC images could not be read. Convert them to JPG or PNG, or try uploading them from Safari/iPhone Photos."
          : "One or more images could not be read. Try JPG or PNG files."
      );
    }

    setUploading(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="h-9 rounded-lg bg-zinc-800 px-3 text-[11px] font-semibold text-white flex items-center cursor-pointer">
        {uploading ? "Adding panoramas..." : "Add Panorama"}
        <input
          type="file"
          multiple
          accept={IMAGE_ACCEPT}
          className="hidden"
          onChange={(event) => {
            handleFiles(event.target.files, "pano");
            event.target.value = "";
          }}
        />
      </label>
      <label className="h-9 rounded-lg bg-zinc-200 px-3 text-[11px] font-semibold text-zinc-700 flex items-center cursor-pointer">
        {uploading ? "Adding photos..." : "Add Photo"}
        <input
          type="file"
          multiple
          accept={IMAGE_ACCEPT}
          className="hidden"
          onChange={(event) => {
            handleFiles(event.target.files, "detail");
            event.target.value = "";
          }}
        />
      </label>
      {error ? <p className="w-full text-[11px] font-medium text-red-600">{error}</p> : null}
    </div>
  );
}
