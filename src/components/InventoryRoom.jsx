import { useEffect, useMemo, useState } from "react";
import InventoryChecklist from "./InventoryChecklist.jsx";
import MediaUploader from "./MediaUploader.jsx";
import PanoViewer from "./PanoViewer.jsx";

const MEDIA_ASSIGNMENT_OPTIONS = [
  "Overall Room",
  "Walls",
  "Ceilings",
  "Floor",
  "Furniture",
  "Doors",
  "Windows",
  "Lights",
  "Decor",
  "Appliances",
  "Sockets & Switches",
  "Radiators",
  "Paintwork",
];

export default function InventoryRoom({
  room,
  roomInventory,
  onUpdateItem,
  onSetOverallCondition,
  onRemoveMedia,
  onCapturePanorama,
  onCaptureDetailPhoto,
  onApplyQuickCondition,
  onUpdateMedia,
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedMediaIds, setSelectedMediaIds] = useState([]);
  const [bulkAssignment, setBulkAssignment] = useState("");
  const primaryPanoSrc = useMemo(
    () =>
      roomInventory.panoramaImage ||
      roomInventory.media.find((media) => media.type === "pano")?.preview ||
      roomInventory.media.find((media) => media.type === "pano")?.url ||
      "",
    [roomInventory.panoramaImage, roomInventory.media]
  );
  const assignmentOptions = useMemo(() => {
    const roomItemNames = (roomInventory.items || []).map((item) => item.name).filter(Boolean);
    return Array.from(new Set([...MEDIA_ASSIGNMENT_OPTIONS, ...roomItemNames]));
  }, [roomInventory.items]);
  const selectedCount = selectedMediaIds.length;

  useEffect(() => {
    setSelectedMediaIds([]);
    setBulkAssignment("");
  }, [roomInventory.roomId]);

  const toggleSelectedMedia = (mediaId) => {
    setSelectedMediaIds((prev) => (
      prev.includes(mediaId) ? prev.filter((id) => id !== mediaId) : [...prev, mediaId]
    ));
  };

  const selectAllMedia = () => {
    setSelectedMediaIds((roomInventory.media || []).map((media) => media.id));
  };

  const clearSelectedMedia = () => {
    setSelectedMediaIds([]);
  };

  const applyBulkAssignment = () => {
    if (!bulkAssignment || !selectedMediaIds.length) return;
    selectedMediaIds.forEach((mediaId) => {
      onUpdateMedia?.(mediaId, { assignment: bulkAssignment });
    });
    setSelectedMediaIds([]);
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
      {primaryPanoSrc ? (
        <div className="mb-3 overflow-hidden rounded-lg border border-zinc-200">
          <PanoViewer src={primaryPanoSrc} alt={`${room?.name || "Room"} panorama`} heightClass="h-[340px]" />
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-zinc-800">{room?.name || roomInventory.roomId}</p>
          <p className="text-xs text-zinc-500">Overall condition</p>
        </div>
        <select
          value={roomInventory.overallCondition || "na"}
          onChange={(event) => onSetOverallCondition(event.target.value)}
          className="h-9 rounded-lg border border-zinc-300 bg-white px-2 text-xs"
        >
          <option value="na">Not stated / N/A</option>
          <option value="good">Good</option>
          <option value="fair">Fair</option>
          <option value="poor">Poor</option>
        </select>
      </div>

      <div className="mt-3 space-y-2">
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
          <p className="text-[11px] font-semibold text-zinc-700">Panorama Guide</p>
          <p className="mt-1 text-[11px] text-zinc-500">
            Upload an existing panoramic image for the room. For best results, stand in the doorway or centre of the
            room when the panorama is taken so it shows as much of the space as possible.
          </p>
        </div>
        <MediaUploader
          onCapturePanorama={onCapturePanorama}
          onCaptureDetailPhoto={onCaptureDetailPhoto}
          assignmentOptions={assignmentOptions}
        />
        {roomInventory.visuallyDocumented ? (
          <p className="text-[11px] font-medium text-emerald-700">Visually documented</p>
        ) : null}
      </div>

      {primaryPanoSrc ? (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-2">
          <p className="text-xs font-semibold text-zinc-700">Quick Condition</p>
          <div className="mt-2 grid grid-cols-3 gap-1">
            {[
              { key: "good", label: "Good" },
              { key: "fair", label: "Fair" },
              { key: "poor", label: "Poor" },
            ].map((option) => (
              <button
                key={`quick-${roomInventory.roomId}-${option.key}`}
                type="button"
                onClick={() => onApplyQuickCondition(option.key)}
                className={`h-9 rounded-lg text-xs font-semibold ${
                  roomInventory.overallCondition === option.key
                    ? "bg-zinc-800 text-white"
                    : "bg-zinc-200 text-zinc-700"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3">
        <button
          type="button"
          onClick={() => setAdvancedOpen((prev) => !prev)}
          className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-left text-xs font-semibold text-zinc-700"
        >
          Advanced Details (Optional) {advancedOpen ? "▲" : "▼"}
        </button>
      </div>

      {advancedOpen ? (
        <div className="mt-2">
          <InventoryChecklist roomInventory={roomInventory} onUpdateItem={onUpdateItem} />
        </div>
      ) : null}

      <div className="mt-3">
        <p className="text-xs font-semibold text-zinc-700">Media</p>
      </div>

      {roomInventory.media.length ? (
        <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={bulkAssignment}
              onChange={(event) => setBulkAssignment(event.target.value)}
              className="h-9 min-w-[180px] rounded-lg border border-zinc-300 bg-white px-2 text-xs"
            >
              <option value="">Bulk assign selected media</option>
              {assignmentOptions.map((option) => (
                <option key={`bulk-${option}`} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={applyBulkAssignment}
              disabled={!bulkAssignment || !selectedCount}
              className="h-9 rounded-lg bg-zinc-800 px-3 text-[11px] font-semibold text-white disabled:opacity-40"
            >
              Apply to {selectedCount || 0}
            </button>
            <button
              type="button"
              onClick={selectAllMedia}
              className="h-9 rounded-lg bg-zinc-200 px-3 text-[11px] font-semibold text-zinc-700"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={clearSelectedMedia}
              className="h-9 rounded-lg bg-zinc-100 px-3 text-[11px] font-semibold text-zinc-700"
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
        {roomInventory.media.map((media) => (
          <div key={media.id} className="rounded-lg border border-zinc-200 p-2">
            <label className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-zinc-700">
              <input
                type="checkbox"
                checked={selectedMediaIds.includes(media.id)}
                onChange={() => toggleSelectedMedia(media.id)}
                className="h-4 w-4 accent-zinc-800"
              />
              Select for bulk assign
            </label>
            {media.type === "pano" ? (
              <PanoViewer src={media.preview || media.url} alt="Panorama" heightClass="h-40" />
            ) : (
              <img
                src={media.preview || media.url}
                alt="Inventory"
                loading="lazy"
                className="h-28 w-full rounded border border-zinc-200 object-cover"
              />
            )}
            <p className="mt-2 text-[11px] text-zinc-500">
              Photo date: {media.capturedAt ? new Date(media.capturedAt).toLocaleString() : "Not recorded"}
            </p>
            <p className="text-[11px] text-zinc-500">
              Uploaded: {media.uploadedAt ? new Date(media.uploadedAt).toLocaleString() : "Not recorded"}
            </p>
            <p className="text-[11px] text-zinc-500">
              Saved size: {media.compressedSizeBytes ? `${(media.compressedSizeBytes / 1024 / 1024).toFixed(2)} MB` : "Unknown"}
            </p>
            <div className="mt-2">
              <p className="text-[11px] font-semibold text-zinc-700">Assign image to</p>
              <select
                value={media.assignment || ""}
                onChange={(event) => onUpdateMedia?.(media.id, { assignment: event.target.value })}
                className="mt-1 h-9 w-full rounded-lg border border-zinc-300 bg-white px-2 text-xs"
              >
                <option value="">Unassigned</option>
                {assignmentOptions.map((option) => (
                  <option key={`${media.id}-${option}`} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => onRemoveMedia(media.id)}
              className="mt-2 h-8 w-full rounded-lg bg-red-100 text-[11px] font-semibold text-red-700"
            >
              Remove Media
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
