import { useSyncExternalStore } from "react";

const DEFAULT_ITEMS = ["Walls", "Floor", "Ceiling", "Windows", "Doors", "Furniture"];
const DETAIL_CONDITIONS = ["good", "fair", "poor", "na"];
const QUICK_CONDITIONS = ["good", "fair", "poor"];

let state = {
  currentReport: null,
  activeRoomId: null,
  initializedKey: null,
};

const listeners = new Set();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setState(patch) {
  state = {
    ...state,
    ...patch,
  };
  emit();
}

function createDefaultRoomInventory(roomId) {
  return {
    roomId,
    items: DEFAULT_ITEMS.map((itemName) => ({
      id: `${roomId}_${itemName.toLowerCase()}`,
      name: itemName,
      condition: "na",
      notes: "",
    })),
    media: [],
    panoramaImage: "",
    visuallyDocumented: false,
    overallCondition: "na",
  };
}

function mergeRoomInventory(defaultRoom, existingRoom) {
  if (!existingRoom) return defaultRoom;
  const existingItemsByName = new Map((existingRoom.items || []).map((item) => [item.name, item]));
  const mergedItems = defaultRoom.items.map((item) => ({
    ...item,
    ...(existingItemsByName.get(item.name) || {}),
    condition:
      existingItemsByName.get(item.name)?.condition &&
      ["good", "fair", "poor", "na"].includes(existingItemsByName.get(item.name)?.condition)
        ? existingItemsByName.get(item.name).condition
        : "na",
  }));

  const mergedMedia = Array.isArray(existingRoom.media) ? existingRoom.media : [];
  const mergedVisuallyDocumented = Boolean(existingRoom.visuallyDocumented);
  const allNotesEmpty = mergedItems.every((item) => !String(item.notes || "").trim());
  const allLegacyFairOrEmpty = mergedItems.every(
    (item) => !item.condition || item.condition === "fair" || item.condition === "na"
  );
  const shouldMigrateLegacyFairToNa =
    !mergedMedia.length &&
    !mergedVisuallyDocumented &&
    existingRoom.overallCondition === "fair" &&
    allNotesEmpty &&
    allLegacyFairOrEmpty;

  return {
    ...defaultRoom,
    ...existingRoom,
    items: shouldMigrateLegacyFairToNa
      ? mergedItems.map((item) => ({
          ...item,
          condition: "na",
        }))
      : mergedItems,
    media: mergedMedia,
    panoramaImage:
      typeof existingRoom.panoramaImage === "string" ? existingRoom.panoramaImage : "",
    visuallyDocumented: mergedVisuallyDocumented,
    overallCondition: shouldMigrateLegacyFairToNa
      ? "na"
      : ["good", "fair", "poor", "na"].includes(existingRoom.overallCondition)
        ? existingRoom.overallCondition
        : "na",
  };
}

export function initializeInventoryReport(propertyId, rooms, existingReport) {
  const roomList = Array.isArray(rooms) ? rooms : [];
  const key = `${propertyId}:${roomList.map((room) => room.id).join("|")}`;
  if (state.initializedKey === key && state.currentReport) return;

  const existingRoomsById = new Map((existingReport?.rooms || []).map((room) => [room.roomId, room]));
  const report = {
    propertyId,
    createdAt: existingReport?.createdAt || new Date().toISOString(),
    rooms: roomList.map((room) =>
      mergeRoomInventory(createDefaultRoomInventory(room.id), existingRoomsById.get(room.id))
    ),
  };

  setState({
    currentReport: report,
    activeRoomId: roomList[0]?.id || null,
    initializedKey: key,
  });
}

export function setActiveRoom(roomId) {
  setState({ activeRoomId: roomId });
}

export function updateInventoryItem(roomId, itemId, patch) {
  if (!state.currentReport) return;
  const next = {
    ...state.currentReport,
    rooms: state.currentReport.rooms.map((room) =>
      room.roomId === roomId
        ? {
            ...room,
            items: room.items.map((item) =>
              item.id === itemId
                ? {
                    ...item,
                    ...patch,
                  }
                : item
            ),
          }
        : room
    ),
  };

  setState({ currentReport: next });
}

export function setRoomOverallCondition(roomId, condition) {
  if (!state.currentReport) return;
  const next = {
    ...state.currentReport,
    rooms: state.currentReport.rooms.map((room) =>
      room.roomId === roomId
        ? {
            ...room,
            overallCondition: condition,
          }
        : room
    ),
  };
  setState({ currentReport: next });
}

export function addRoomMedia(roomId, media) {
  if (!state.currentReport) return;
  const next = {
    ...state.currentReport,
    rooms: state.currentReport.rooms.map((room) =>
      room.roomId === roomId
        ? {
            ...room,
            media: [...room.media, media],
            panoramaImage:
              media.type === "pano" ? media.preview || media.url || room.panoramaImage : room.panoramaImage,
            visuallyDocumented:
              media.type === "pano" ? true : room.visuallyDocumented,
          }
        : room
    ),
  };
  setState({ currentReport: next });
}

export function removeRoomMedia(roomId, mediaId) {
  if (!state.currentReport) return;
  const next = {
    ...state.currentReport,
    rooms: state.currentReport.rooms.map((room) =>
      room.roomId === roomId
        ? (() => {
            const filtered = room.media.filter((m) => m.id !== mediaId);
            const latestPano =
              filtered.find((m) => m.type === "pano")?.preview ||
              filtered.find((m) => m.type === "pano")?.url ||
              "";
            return {
              ...room,
              media: filtered,
              panoramaImage: latestPano,
              visuallyDocumented: Boolean(latestPano),
            };
          })()
        : room
    ),
  };
  setState({ currentReport: next });
}

export function capturePanoramaForRoom(roomId, media) {
  if (!state.currentReport) return;
  const next = {
    ...state.currentReport,
    rooms: state.currentReport.rooms.map((room) =>
      room.roomId === roomId
        ? {
          ...room,
            media: [...room.media, media],
            panoramaImage: media.preview || media.url || room.panoramaImage,
            visuallyDocumented: true,
          }
        : room
    ),
  };
  setState({ currentReport: next });
}

export function applyRoomConditionToAll(roomId, condition) {
  if (!state.currentReport) return;
  const next = {
    ...state.currentReport,
    rooms: state.currentReport.rooms.map((room) =>
      room.roomId === roomId
        ? {
            ...room,
            overallCondition: condition,
            items: room.items.map((item) => ({
              ...item,
              condition,
            })),
          }
        : room
    ),
  };
  setState({ currentReport: next });
}

export function validateInventoryReport(report) {
  const source = report || state.currentReport;
  if (!source) return { valid: false, missing: [] };

  const missing = source.rooms
    .filter((room) => {
      const hasMedia = room.media.length > 0;
      const allItemsComplete = room.items.every((item) => DETAIL_CONDITIONS.includes(item.condition));
      const hasQuickCondition = QUICK_CONDITIONS.includes(room.overallCondition);
      const canSkipDetails = room.visuallyDocumented && hasQuickCondition;
      return !hasMedia || (!allItemsComplete && !canSkipDetails);
    })
    .map((room) => room.roomId);

  return {
    valid: missing.length === 0,
    missing,
  };
}

export function getRoomCompletion(roomInventory) {
  const filled = roomInventory.items.filter((item) => DETAIL_CONDITIONS.includes(item.condition)).length;
  const total = roomInventory.items.length || 1;
  const checklistPct = Math.round((filled / total) * 100);
  const mediaPct = roomInventory.media.length > 0 ? 100 : 0;
  return Math.round((checklistPct * 0.7) + (mediaPct * 0.3));
}

export function useInventoryStore(selector = (s) => s) {
  return useSyncExternalStore(subscribe, () => selector(state));
}
