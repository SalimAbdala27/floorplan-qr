import { useEffect, useMemo, useRef, useState } from "react";
import InventoryRoom from "./InventoryRoom.jsx";
import {
  useInventoryStore,
  initializeInventoryReport,
  setActiveRoom,
  updateInventoryItem,
  updateInventorySummary,
  updateInventoryCheck,
  updateInventoryReportMeta,
  setRoomOverallCondition,
  addRoomMedia,
  removeRoomMedia,
  updateRoomMedia,
  capturePanoramaForRoom,
  applyRoomConditionToAll,
  validateInventoryReport,
  getRoomCompletion,
} from "../store/useInventoryStore.js";
import { generateInventoryPdf } from "../services/pdfGenerator.js";
import { downloadInventoryMediaZip } from "../services/inventoryMediaZip.js";

const SUMMARY_FIELDS = [
  { key: "cleanliness", label: "Cleanliness" },
  { key: "smells", label: "Smells" },
  { key: "tidiness", label: "Tidiness" },
  { key: "bins", label: "Bins" },
  { key: "furniture", label: "Furniture" },
  { key: "appliances", label: "Appliances" },
];

const SUMMARY_OPTIONS = [
  { key: "urgent_attention", label: "Urgent Attention" },
  { key: "needs_improvement", label: "Needs Improvement" },
  { key: "good", label: "Good" },
];

const CHECK_FIELDS = [
  {
    key: "fireSmokeAlarms",
    label: "Fire/smoke alarms test",
    options: [
      { key: "working", label: "Working" },
      { key: "not_working", label: "Not Working" },
    ],
  },
  {
    key: "hotWater",
    label: "Hot water",
    options: [
      { key: "working", label: "Working" },
      { key: "not_working", label: "Not Working" },
    ],
  },
  {
    key: "ventilation",
    label: "Ventilation",
    options: [
      { key: "good", label: "Good" },
      { key: "adequate", label: "Adequate" },
      { key: "poor", label: "Poor" },
    ],
  },
  {
    key: "gasSmell",
    label: "Gas smell",
    options: [
      { key: "no", label: "No" },
      { key: "yes", label: "Yes" },
    ],
  },
];

export default function InventoryFlow({
  propertyId,
  propertyName,
  rooms,
  initialReport,
  onReportChange,
  defaultBranding,
  onAddRoom,
}) {
  const currentReport = useInventoryStore((s) => s.currentReport);
  const activeRoomId = useInventoryStore((s) => s.activeRoomId);
  const autosaveTimer = useRef(null);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomFloorId, setNewRoomFloorId] = useState("floor_1");
  const [downloadZipBusy, setDownloadZipBusy] = useState(false);
  const [downloadZipMessage, setDownloadZipMessage] = useState("");
  const [inventoryBranding, setInventoryBranding] = useState({
    companyName: defaultBranding?.companyName || "",
    primaryColor: defaultBranding?.primaryColor || "#1f2937",
    accentColor: defaultBranding?.accentColor || "#e2e8f0",
    logoDataUrl: defaultBranding?.logoDataUrl || null,
  });

  const onBrandLogoSelected = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setInventoryBranding((prev) => ({
        ...prev,
        logoDataUrl: String(reader.result || ""),
      }));
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    initializeInventoryReport(propertyId, rooms, initialReport);
  }, [propertyId, rooms, initialReport]);

  useEffect(() => {
    if (!currentReport || !onReportChange) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      onReportChange(currentReport);
    }, 400);

    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [currentReport, onReportChange]);

  const roomsById = useMemo(
    () => Object.fromEntries((rooms || []).map((room) => [room.id, room])),
    [rooms]
  );

  useEffect(() => {
    const activeRoom = roomsById[activeRoomId];
    if (activeRoom?.floorId) {
      setNewRoomFloorId(activeRoom.floorId);
      return;
    }

    if (!(rooms || []).some((room) => room.floorId === newRoomFloorId)) {
      setNewRoomFloorId(rooms?.[0]?.floorId || "floor_1");
    }
  }, [rooms, roomsById, activeRoomId, newRoomFloorId]);

  const floorOptions = useMemo(() => {
    const byId = new Map();
    (rooms || []).forEach((room) => {
      const floorId = room.floorId || "floor_1";
      if (!byId.has(floorId)) {
        byId.set(floorId, {
          id: floorId,
          label:
            floorId === "floor_1"
              ? "Ground Floor"
              : floorId === "floor_2"
                ? "First Floor"
                : floorId === "floor_3"
                  ? "Second Floor"
                  : floorId.replace("floor_", "Floor "),
        });
      }
    });
    return Array.from(byId.values());
  }, [rooms]);

  const addInventoryRoom = () => {
    if (!onAddRoom) return;
    const roomId = onAddRoom(newRoomName, newRoomFloorId);
    if (!roomId) return;
    setNewRoomName("");
    setActiveRoom(roomId);
  };

  if (!currentReport) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
        <p className="text-xs text-zinc-500">Loading inventory...</p>
      </div>
    );
  }

  const activeRoomInventory =
    currentReport.rooms.find((roomInventory) => roomInventory.roomId === activeRoomId) ||
    currentReport.rooms[0] ||
    null;

  const validation = validateInventoryReport(currentReport);
  const completedCount = currentReport.rooms.filter((roomInventory) => getRoomCompletion(roomInventory) === 100).length;
  const uploadedImageCount = currentReport.rooms.reduce(
    (total, roomInventory) => total + (roomInventory.media?.length || 0),
    0
  );

  const handleDownloadImageZip = async () => {
    try {
      setDownloadZipBusy(true);
      setDownloadZipMessage("");
      const fileCount = downloadInventoryMediaZip(currentReport, roomsById, propertyName);
      setDownloadZipMessage(`${fileCount} image${fileCount === 1 ? "" : "s"} downloaded as ZIP`);
    } catch (error) {
      setDownloadZipMessage(error instanceof Error ? error.message : "Could not create image ZIP");
    } finally {
      setDownloadZipBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
          Inventory Progress
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {completedCount}/{currentReport.rooms.length} rooms complete
        </p>

        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_180px_auto]">
          <input
            value={newRoomName}
            onChange={(event) => setNewRoomName(event.target.value)}
            placeholder="Add room to inventory"
            className="h-9 rounded-lg border border-zinc-300 px-3 text-xs"
          />
          <select
            value={newRoomFloorId}
            onChange={(event) => setNewRoomFloorId(event.target.value)}
            className="h-9 rounded-lg border border-zinc-300 bg-white px-2 text-xs"
          >
            {floorOptions.map((floor) => (
              <option key={`inventory-add-floor-${floor.id}`} value={floor.id}>
                {floor.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addInventoryRoom}
            className="h-9 rounded-lg bg-zinc-800 px-3 text-[11px] font-semibold text-white"
          >
            Add Room
          </button>
        </div>

        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {currentReport.rooms.map((roomInventory) => {
            const room = roomsById[roomInventory.roomId];
            const completion = getRoomCompletion(roomInventory);
            const incomplete = completion < 100;

            return (
              <button
                key={`inv-room-${roomInventory.roomId}`}
                type="button"
                onClick={() => setActiveRoom(roomInventory.roomId)}
                className={`shrink-0 rounded-lg border px-3 py-2 text-left ${
                  roomInventory.roomId === activeRoomInventory?.roomId
                    ? "border-zinc-700 bg-zinc-100"
                    : incomplete
                      ? "border-amber-300 bg-amber-50"
                      : "border-zinc-200 bg-white"
                }`}
              >
                <p className="text-xs font-semibold text-zinc-700">{room?.name || roomInventory.roomId}</p>
                <p className="text-[10px] text-zinc-500">{completion}%</p>
              </button>
            );
          })}
        </div>
      </div>

      {activeRoomInventory ? (
        <InventoryRoom
          room={roomsById[activeRoomInventory.roomId]}
          roomInventory={activeRoomInventory}
          onUpdateItem={(itemId, patch) => updateInventoryItem(activeRoomInventory.roomId, itemId, patch)}
          onSetOverallCondition={(condition) => setRoomOverallCondition(activeRoomInventory.roomId, condition)}
          onRemoveMedia={(mediaId) => removeRoomMedia(activeRoomInventory.roomId, mediaId)}
          onCapturePanorama={(media) => capturePanoramaForRoom(activeRoomInventory.roomId, media)}
          onCaptureDetailPhoto={(media) => addRoomMedia(activeRoomInventory.roomId, media)}
          onUpdateMedia={(mediaId, patch) => updateRoomMedia(activeRoomInventory.roomId, mediaId, patch)}
          onApplyQuickCondition={(condition) =>
            applyRoomConditionToAll(activeRoomInventory.roomId, condition)
          }
        />
      ) : null}

      <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">Summary</p>
        <div className="mt-3 rounded-xl border border-zinc-200 p-3">
          <p className="text-sm font-semibold text-zinc-800">General condition</p>
          <div className="mt-3 space-y-4">
            {SUMMARY_FIELDS.map((field) => (
              <div key={field.key}>
                <p className="text-xs text-zinc-600">{field.label}</p>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {SUMMARY_OPTIONS.map((option) => {
                    const active = currentReport.summary?.[field.key] === option.key;
                    return (
                      <button
                        key={`${field.key}-${option.key}`}
                        type="button"
                        onClick={() => updateInventorySummary(field.key, option.key)}
                        className={`rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                          active ? "bg-zinc-800 text-white" : "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-zinc-200 p-3">
          <p className="text-sm font-semibold text-zinc-800">Checks</p>
          <div className="mt-3 space-y-4">
            {CHECK_FIELDS.map((field) => (
              <div key={field.key}>
                <p className="text-xs text-zinc-600">{field.label}</p>
                <div className={`mt-2 grid gap-2 ${field.options.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                  {field.options.map((option) => {
                    const active = currentReport.checks?.[field.key] === option.key;
                    return (
                      <button
                        key={`${field.key}-${option.key}`}
                        type="button"
                        onClick={() => updateInventoryCheck(field.key, option.key)}
                        className={`rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                          active ? "bg-zinc-800 text-white" : "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
              Additional Notes
            </p>
            <textarea
              value={currentReport.additionalNotes || ""}
              onChange={(event) => updateInventoryReportMeta({ additionalNotes: event.target.value })}
              placeholder="Any extra observations or context for this report."
              className="mt-3 min-h-[120px] w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="rounded-xl border border-zinc-200 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
              Report Conducted By
            </p>
            <input
              type="text"
              value={currentReport.conductedBy || ""}
              onChange={(event) => updateInventoryReportMeta({ conductedBy: event.target.value })}
              placeholder="e.g. Jane Doe"
              className="mt-3 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
        <p className="text-xs font-semibold text-zinc-700">PDF Branding</p>
        <div className="mt-2 space-y-2">
          <input
            type="text"
            value={inventoryBranding.companyName}
            onChange={(event) =>
              setInventoryBranding((prev) => ({
                ...prev,
                companyName: event.target.value,
              }))
            }
            placeholder="Company name"
            className="h-9 w-full rounded-lg border border-zinc-300 px-2 text-xs"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="color"
              value={inventoryBranding.primaryColor}
              onChange={(event) =>
                setInventoryBranding((prev) => ({
                  ...prev,
                  primaryColor: event.target.value,
                }))
              }
              className="h-9 w-full rounded border border-zinc-300"
            />
            <input
              type="color"
              value={inventoryBranding.accentColor}
              onChange={(event) =>
                setInventoryBranding((prev) => ({
                  ...prev,
                  accentColor: event.target.value,
                }))
              }
              className="h-9 w-full rounded border border-zinc-300"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="h-9 rounded-lg bg-zinc-200 px-3 text-[11px] font-semibold text-zinc-700 flex items-center cursor-pointer">
              Upload Logo
              <input type="file" accept="image/*" className="hidden" onChange={onBrandLogoSelected} />
            </label>
            {inventoryBranding.logoDataUrl ? (
              <button
                type="button"
                onClick={() =>
                  setInventoryBranding((prev) => ({
                    ...prev,
                    logoDataUrl: null,
                  }))
                }
                className="h-9 rounded-lg bg-zinc-100 px-3 text-[11px] font-semibold text-zinc-700"
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-zinc-700">Validation</p>
            <p className="text-xs text-zinc-500">
              {validation.valid ? "Report ready for export" : `${validation.missing.length} room(s) incomplete`}
            </p>
            <p className="mt-1 text-xs text-zinc-500">{uploadedImageCount} uploaded image(s) available</p>
            {downloadZipMessage ? (
              <p className="mt-1 text-[11px] text-zinc-600">{downloadZipMessage}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleDownloadImageZip}
              disabled={downloadZipBusy || uploadedImageCount === 0}
              className="h-9 rounded-lg bg-zinc-200 px-3 text-[11px] font-semibold text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {downloadZipBusy ? "Preparing ZIP..." : "Download Full-Res ZIP"}
            </button>
            <button
              type="button"
              onClick={() =>
                generateInventoryPdf(currentReport, roomsById, propertyName, {
                  branding: inventoryBranding,
                })
              }
              className="h-9 rounded-lg bg-zinc-800 px-3 text-[11px] font-semibold text-white"
            >
              Export Inventory PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
