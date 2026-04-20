import { useMemo, useRef, useState } from "react";

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

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function buildQualitySettings(sliderValue) {
  const normalized = Math.min(100, Math.max(1, Number(sliderValue) || 70)) / 100;
  return {
    photoLongEdge: Math.round(1200 + normalized * 1800),
    photoQuality: Number((0.55 + normalized * 0.35).toFixed(2)),
    panoLongEdge: Math.round(1800 + normalized * 1800),
    panoQuality: Number((0.58 + normalized * 0.32).toFixed(2)),
  };
}

function estimateCompressedBytes(settings, mode) {
  const longEdge = mode === "pano" ? settings.panoLongEdge : settings.photoLongEdge;
  const quality = mode === "pano" ? settings.panoQuality : settings.photoQuality;
  const estimatedPixels = longEdge * (longEdge * 0.66);
  return estimatedPixels * (0.11 + quality * 0.19);
}

export default function MediaUploader({
  onCapturePanorama,
  onCaptureDetailPhoto,
  assignmentOptions = [],
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [qualityValue, setQualityValue] = useState(72);
  const [lastUploadSummary, setLastUploadSummary] = useState("");
  const [defaultAssignment, setDefaultAssignment] = useState("");
  const panoGalleryInputRef = useRef(null);
  const panoFileInputRef = useRef(null);
  const photoCameraInputRef = useRef(null);
  const photoGalleryInputRef = useRef(null);
  const photoFileInputRef = useRef(null);
  const qualitySettings = useMemo(() => buildQualitySettings(qualityValue), [qualityValue]);
  const panoEstimate = useMemo(() => formatBytes(estimateCompressedBytes(qualitySettings, "pano")), [qualitySettings]);
  const photoEstimate = useMemo(() => formatBytes(estimateCompressedBytes(qualitySettings, "detail")), [qualitySettings]);

  const handleFiles = async (files, mode = "pano") => {
    const selectedFiles = Array.from(files || []).filter(Boolean);
    if (!selectedFiles.length) return;

    setUploading(true);
    setError("");

    let failedFile = null;
    let addedCount = 0;
    let totalCompressedBytes = 0;

    for (const file of selectedFiles) {
      try {
        const sourceDataUrl = await readFileAsDataUrl(file);
        await loadImageMeta(sourceDataUrl);
        const imageEl = await loadImageElement(sourceDataUrl);
        const compressedDataUrl =
          compressDataUrl(
            imageEl,
            mode === "pano" ? qualitySettings.panoLongEdge : qualitySettings.photoLongEdge,
            mode === "pano" ? qualitySettings.panoQuality : qualitySettings.photoQuality
          ) || sourceDataUrl;
        const compressedSizeBytes = Math.round((compressedDataUrl.length * 3) / 4);
        const sourceCapturedAt =
          Number.isFinite(file.lastModified) && file.lastModified > 0
            ? new Date(file.lastModified).toISOString()
            : null;

        const media = {
          id: `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: mode === "pano" ? "pano" : "photo",
          url: compressedDataUrl,
          preview: compressedDataUrl,
          originalUrl: sourceDataUrl,
          fileName: file.name || `${mode === "pano" ? "panorama" : "photo"}_${Date.now()}.jpg`,
          mimeType: file.type || "image/jpeg",
          assignment: defaultAssignment || "",
          capturedAt: sourceCapturedAt || new Date().toISOString(),
          uploadedAt: new Date().toISOString(),
          originalSizeBytes: file.size || 0,
          compressedSizeBytes,
          qualityPreset: qualityValue,
        };

        if (mode === "pano") {
          onCapturePanorama(media);
        } else if (onCaptureDetailPhoto) {
          onCaptureDetailPhoto(media);
        }
        addedCount += 1;
        totalCompressedBytes += compressedSizeBytes;
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

    if (addedCount) {
      setLastUploadSummary(
        `${addedCount} ${mode === "pano" ? "panorama" : "photo"}${addedCount === 1 ? "" : "s"} added · approx ${formatBytes(totalCompressedBytes)}`
      );
    }
    setUploading(false);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
        <div className="space-y-2">
          <label className="block text-[11px] font-semibold text-zinc-700">
            Pre-assign new images
            <select
              value={defaultAssignment}
              onChange={(event) => setDefaultAssignment(event.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-zinc-300 bg-white px-2 text-[11px]"
            >
              <option value="">Leave unassigned</option>
              {assignmentOptions.map((option) => (
                <option key={`incoming-${option}`} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[11px] font-semibold text-zinc-700">
            Upload quality: {qualityValue}%
            <input
              type="range"
              min="1"
              max="100"
              step="1"
              value={qualityValue}
              onChange={(event) => setQualityValue(Number(event.target.value))}
              className="mt-2 w-full accent-zinc-800"
            />
          </label>
          <p className="text-[11px] text-zinc-500">
            Estimated size: photo {photoEstimate} each · panorama {panoEstimate} each
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 p-2">
        <p className="text-[11px] font-semibold text-zinc-700">Add Panorama</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => panoGalleryInputRef.current?.click()}
            className="h-9 rounded-lg bg-zinc-200 px-3 text-[11px] font-semibold text-zinc-700"
          >
            Upload Panorama
          </button>
          <button
            type="button"
            onClick={() => panoFileInputRef.current?.click()}
            className="h-9 rounded-lg bg-zinc-100 px-3 text-[11px] font-semibold text-zinc-700"
          >
            Upload File
          </button>
        </div>
        <input
          ref={panoGalleryInputRef}
          type="file"
          multiple
          accept={IMAGE_ACCEPT}
          className="hidden"
          onChange={(event) => {
            handleFiles(event.target.files, "pano");
            event.target.value = "";
          }}
        />
        <input
          ref={panoFileInputRef}
          type="file"
          multiple
          accept={IMAGE_ACCEPT}
          className="hidden"
          onChange={(event) => {
            handleFiles(event.target.files, "pano");
            event.target.value = "";
          }}
        />
      </div>

      <div className="rounded-lg border border-zinc-200 p-2">
        <p className="text-[11px] font-semibold text-zinc-700">Add Photo</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => photoCameraInputRef.current?.click()}
            className="h-9 rounded-lg bg-zinc-800 px-3 text-[11px] font-semibold text-white"
          >
            Take Photo
          </button>
          <button
            type="button"
            onClick={() => photoGalleryInputRef.current?.click()}
            className="h-9 rounded-lg bg-zinc-200 px-3 text-[11px] font-semibold text-zinc-700"
          >
            Upload Photo
          </button>
          <button
            type="button"
            onClick={() => photoFileInputRef.current?.click()}
            className="h-9 rounded-lg bg-zinc-100 px-3 text-[11px] font-semibold text-zinc-700"
          >
            Upload File
          </button>
        </div>
        <input
          ref={photoCameraInputRef}
          type="file"
          multiple
          accept={IMAGE_ACCEPT}
          capture="environment"
          className="hidden"
          onChange={(event) => {
            handleFiles(event.target.files, "detail");
            event.target.value = "";
          }}
        />
        <input
          ref={photoGalleryInputRef}
          type="file"
          multiple
          accept={IMAGE_ACCEPT}
          className="hidden"
          onChange={(event) => {
            handleFiles(event.target.files, "detail");
            event.target.value = "";
          }}
        />
        <input
          ref={photoFileInputRef}
          type="file"
          multiple
          accept={IMAGE_ACCEPT}
          className="hidden"
          onChange={(event) => {
            handleFiles(event.target.files, "detail");
            event.target.value = "";
          }}
        />
      </div>

      {uploading ? <p className="text-[11px] font-medium text-zinc-600">Processing images...</p> : null}
      {lastUploadSummary ? <p className="text-[11px] font-medium text-zinc-600">{lastUploadSummary}</p> : null}
      {error ? <p className="w-full text-[11px] font-medium text-red-600">{error}</p> : null}
    </div>
  );
}
