import { useSyncExternalStore } from "react";

const DEFAULT_ITEMS = ["Walls", "Floor", "Ceiling", "Windows", "Doors", "Furniture"];

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
      condition: "fair",
      notes: "",
    })),
    media: [],
    overallCondition: "fair",
  };
}

function mergeRoomInventory(defaultRoom, existingRoom) {
  if (!existingRoom) return defaultRoom;
  const existingItemsByName = new Map((existingRoom.items || []).map((item) => [item.name, item]));
  const mergedItems = defaultRoom.items.map((item) => ({
    ...item,
    ...(existingItemsByName.get(item.name) || {}),
  }));

  return {
    ...defaultRoom,
    ...existingRoom,
    items: mergedItems,
    media: Array.isArray(existingRoom.media) ? existingRoom.media : [],
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
        ? {
            ...room,
            media: room.media.filter((m) => m.id !== mediaId),
          }
        : room
    ),
  };
  setState({ currentReport: next });
}

export function quickCaptureCompleteRoom(roomId, media) {
  if (!state.currentReport) return;
  const next = {
    ...state.currentReport,
    rooms: state.currentReport.rooms.map((room) =>
      room.roomId === roomId
        ? {
            ...room,
            items: room.items.map((item) => ({
              ...item,
              condition: item.condition || "good",
            })),
            overallCondition: room.overallCondition || "good",
            media: [...room.media, media],
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
      const allItemsComplete = room.items.every((item) => ["good", "fair", "poor"].includes(item.condition));
      return !hasMedia || !allItemsComplete;
    })
    .map((room) => room.roomId);

  return {
    valid: missing.length === 0,
    missing,
  };
}

export function getRoomCompletion(roomInventory) {
  const filled = roomInventory.items.filter((item) => ["good", "fair", "poor"].includes(item.condition)).length;
  const total = roomInventory.items.length || 1;
  const checklistPct = Math.round((filled / total) * 100);
  const mediaPct = roomInventory.media.length > 0 ? 100 : 0;
  return Math.round((checklistPct * 0.7) + (mediaPct * 0.3));
}

export function useInventoryStore(selector = (s) => s) {
  return useSyncExternalStore(subscribe, () => selector(state));
}
