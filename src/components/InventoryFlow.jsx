import { useEffect, useMemo, useRef } from "react";
import InventoryRoom from "./InventoryRoom.jsx";
import {
  useInventoryStore,
  initializeInventoryReport,
  setActiveRoom,
  updateInventoryItem,
  setRoomOverallCondition,
  addRoomMedia,
  removeRoomMedia,
  quickCaptureCompleteRoom,
  validateInventoryReport,
  getRoomCompletion,
} from "../store/useInventoryStore.js";
import { generateInventoryPdf } from "../services/pdfGenerator.js";

export default function InventoryFlow({
  propertyId,
  propertyName,
  rooms,
  initialReport,
  onReportChange,
}) {
  const currentReport = useInventoryStore((s) => s.currentReport);
  const activeRoomId = useInventoryStore((s) => s.activeRoomId);
  const autosaveTimer = useRef(null);

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

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
          Inventory Progress
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {completedCount}/{currentReport.rooms.length} rooms complete
        </p>

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
          onAddMedia={(media) => addRoomMedia(activeRoomInventory.roomId, media)}
          onRemoveMedia={(mediaId) => removeRoomMedia(activeRoomInventory.roomId, mediaId)}
          onQuickCapture={(media) => quickCaptureCompleteRoom(activeRoomInventory.roomId, media)}
        />
      ) : null}

      <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-zinc-700">Validation</p>
            <p className="text-xs text-zinc-500">
              {validation.valid ? "Report ready for export" : `${validation.missing.length} room(s) incomplete`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => generateInventoryPdf(currentReport, roomsById, propertyName)}
            disabled={!validation.valid}
            className="h-9 rounded-lg bg-zinc-800 px-3 text-[11px] font-semibold text-white disabled:opacity-50"
          >
            Export Inventory PDF
          </button>
        </div>
      </div>
    </div>
  );
}
