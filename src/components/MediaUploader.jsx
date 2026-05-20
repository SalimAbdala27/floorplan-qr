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
  const [pendingUpload, setPendingUpload] = useState(null);
  const [selectedAssignment, setSelectedAssignment] = useState("");
  const panoGalleryInputRef = useRef(null);
  const panoFileInputRef = useRef(null);
  const photoCameraInputRef = useRef(null);
  const photoGalleryInputRef = useRef(null);
  const photoFileInputRef = useRef(null);
  const qualitySettings = useMemo(() => buildQualitySettings(qualityValue), [qualityValue]);
  const panoEstimate = useMemo(() => formatBytes(estimateCompressedBytes(qualitySettings, "pano")), [qualitySettings]);
  const photoEstimate = useMemo(() => formatBytes(estimateCompressedBytes(qualitySettings, "detail")), [qualitySettings]);

  const submitFiles = async (files, mode = "pano", assignment = "") => {
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
          fileName: file.name || `${mode === "pano" ? "panorama" : "photo"}_${Date.now()}.jpg`,
          mimeType: file.type || "image/jpeg",
          assignment: assignment || "",
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
    setPendingUpload(null);
    setSelectedAssignment("");
  };

  const queueFiles = (files, mode = "pano") => {
    const selectedFiles = Array.from(files || []).filter(Boolean);
    if (!selectedFiles.length) return;
    setError("");
    setPendingUpload({
      files: selectedFiles,
      mode,
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
        <div className="space-y-2">
          <div>
            <p className="text-[11px] font-semibold text-zinc-700">Pre-assign new images</p>
            <p className="mt-1 text-[11px] text-zinc-500">
              Select the images first, then choose whether that batch should be added as unassigned or sent straight to a room item.
            </p>
          </div>
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

      {pendingUpload ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">Ready to add</p>
              <p className="mt-1 text-sm font-semibold text-zinc-800">
                {pendingUpload.files.length} {pendingUpload.mode === "pano" ? "panorama" : "photo"}
                {pendingUpload.files.length === 1 ? "" : "s"} selected
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">
                {pendingUpload.files.slice(0, 3).map((file) => file.name || "Image").join(", ")}
                {pendingUpload.files.length > 3 ? ` +${pendingUpload.files.length - 3} more` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setPendingUpload(null);
                setSelectedAssignment("");
              }}
              className="h-9 rounded-lg bg-zinc-100 px-3 text-[11px] font-semibold text-zinc-700"
            >
              Cancel Batch
            </button>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
            <label className="text-[11px] font-semibold text-zinc-700">
              Assign this batch to
              <select
                value={selectedAssignment}
                onChange={(event) => setSelectedAssignment(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-[11px]"
              >
                <option value="">Leave unassigned</option>
                {assignmentOptions.map((option) => (
                  <option key={`pending-${option}`} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => submitFiles(pendingUpload.files, pendingUpload.mode, "")}
              className="h-10 rounded-lg bg-zinc-200 px-4 text-[11px] font-semibold text-zinc-800"
            >
              Add As Unassigned
            </button>
            <button
              type="button"
              onClick={() => submitFiles(pendingUpload.files, pendingUpload.mode, selectedAssignment)}
              disabled={!selectedAssignment}
              className="h-10 rounded-lg bg-zinc-800 px-4 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add To Assignment
            </button>
          </div>
        </div>
      ) : null}

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
            queueFiles(event.target.files, "pano");
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
            queueFiles(event.target.files, "pano");
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
            queueFiles(event.target.files, "detail");
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
            queueFiles(event.target.files, "detail");
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
            queueFiles(event.target.files, "detail");
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
