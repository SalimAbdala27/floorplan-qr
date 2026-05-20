import { useSyncExternalStore } from "react";

const DEFAULT_ITEMS = ["Walls", "Floor", "Ceiling", "Windows", "Doors", "Furniture"];
const DETAIL_CONDITIONS = ["good", "fair", "poor", "na"];
const QUICK_CONDITIONS = ["good", "fair", "poor"];
const SUMMARY_KEYS = ["cleanliness", "smells", "tidiness", "bins", "furniture", "appliances"];
const CHECK_KEYS = ["fireSmokeAlarms", "hotWater", "ventilation", "gasSmell"];

function getTodayDateInputValue() {
  return new Date().toISOString().slice(0, 10);
}

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

function createDefaultSummary() {
  return SUMMARY_KEYS.reduce((acc, key) => {
    acc[key] = "";
    return acc;
  }, {});
}

function createDefaultChecks() {
  return CHECK_KEYS.reduce((acc, key) => {
    acc[key] = "";
    return acc;
  }, {});
}

function createDefaultDeclaration() {
  return {
    declarantName: "",
    declarantRole: "",
    declaredAt: "",
    statement:
      "I confirm that this inventory inspection and supporting media accurately reflect the condition of the property at the time of visit.",
    signatureDataUrl: "",
  };
}

function createDefaultLegionellaAssessment() {
  return {
    assessorName: "",
    assessmentDate: getTodayDateInputValue(),
    vacancyDuration: "less_than_1_week",
    waterSystemType: "unvented_cylinder",
    littleUsedOutlets: "no",
    systemCondition: "clean",
    waterTemperatureAdequate: "yes",
    riskResult: "",
    riskScore: 0,
    riskSummary: "",
    assessedAt: "",
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

  const legacyPanoramaImage =
    typeof existingRoom.panoramaImage === "string" && existingRoom.panoramaImage
      ? existingRoom.panoramaImage
      : "";
  const sourceMedia =
    Array.isArray(existingRoom.media) && existingRoom.media.length
      ? existingRoom.media
      : legacyPanoramaImage
        ? [
            {
              id: `legacy_pano_${existingRoom.roomId || defaultRoom.roomId}`,
              type: "pano",
              url: legacyPanoramaImage,
              preview: legacyPanoramaImage,
              fileName: "Recovered panorama.jpg",
              assignment: "",
              capturedAt: "",
              uploadedAt: "",
            },
          ]
        : [];
  const mergedMedia = sourceMedia.length
    ? sourceMedia.map((media) => {
        const url = media?.url || media?.preview || media?.originalUrl || "";
        return {
          ...media,
          url,
          preview: media?.preview || url,
        };
      })
    : [];
  const mergedVisuallyDocumented = Boolean(existingRoom.visuallyDocumented);
  const selectedPano =
    (existingRoom.panoramaMediaId &&
      mergedMedia.find((media) => media.id === existingRoom.panoramaMediaId && media.type === "pano")) ||
    null;
  const fallbackPano = mergedMedia.find((media) => media.type === "pano") || null;
  const mergedPanoramaImage =
    legacyPanoramaImage ||
    selectedPano?.preview ||
    selectedPano?.url ||
    fallbackPano?.preview ||
    fallbackPano?.url ||
    "";
  const allNotesEmpty = mergedItems.every((item) => !String(item.notes || "").trim());
  const allLegacyFairOrEmpty = mergedItems.every(
    (item) => !item.condition || item.condition === "fair" || item.condition === "na"
  );
  const hasLegacyDefaultOverallCondition =
    !existingRoom.overallCondition ||
    existingRoom.overallCondition === "fair" ||
    existingRoom.overallCondition === "na";
  const shouldMigrateLegacyFairToNa =
    !mergedMedia.length &&
    !mergedVisuallyDocumented &&
    hasLegacyDefaultOverallCondition &&
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
    panoramaImage: mergedPanoramaImage,
    panoramaMediaId:
      typeof existingRoom.panoramaMediaId === "string" ? existingRoom.panoramaMediaId : selectedPano?.id || "",
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
    propertyAddress:
      typeof existingReport?.propertyAddress === "string" ? existingReport.propertyAddress : "",
    summary: {
      ...createDefaultSummary(),
      ...(existingReport?.summary || {}),
    },
    checks: {
      ...createDefaultChecks(),
      ...(existingReport?.checks || {}),
    },
    additionalNotes: typeof existingReport?.additionalNotes === "string" ? existingReport.additionalNotes : "",
    conductedBy: typeof existingReport?.conductedBy === "string" ? existingReport.conductedBy : "",
    legionella: {
      ...createDefaultLegionellaAssessment(),
      ...(existingReport?.legionella || {}),
    },
    declaration: {
      ...createDefaultDeclaration(),
      ...(existingReport?.declaration || {}),
    },
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

export function updateInventorySummary(key, value) {
  if (!state.currentReport) return;
  setState({
    currentReport: {
      ...state.currentReport,
      summary: {
        ...(state.currentReport.summary || createDefaultSummary()),
        [key]: value,
      },
    },
  });
}

export function updateInventoryCheck(key, value) {
  if (!state.currentReport) return;
  setState({
    currentReport: {
      ...state.currentReport,
      checks: {
        ...(state.currentReport.checks || createDefaultChecks()),
        [key]: value,
      },
    },
  });
}

export function updateInventoryReportMeta(patch) {
  if (!state.currentReport) return;
  setState({
    currentReport: {
      ...state.currentReport,
      ...patch,
    },
  });
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
            panoramaMediaId: media.type === "pano" ? media.id : room.panoramaMediaId || "",
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
              panoramaMediaId: filtered.find((m) => m.type === "pano")?.id || "",
              visuallyDocumented: Boolean(latestPano),
            };
          })()
        : room
    ),
  };
  setState({ currentReport: next });
}

export function updateRoomMedia(roomId, mediaId, patch) {
  if (!state.currentReport) return;
  const next = {
    ...state.currentReport,
    rooms: state.currentReport.rooms.map((room) =>
      room.roomId === roomId
        ? {
            ...room,
            media: room.media.map((media) =>
              media.id === mediaId
                ? {
                    ...media,
                    ...patch,
                  }
                : media
            ),
          }
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
            panoramaMediaId: media.id,
            visuallyDocumented: true,
          }
        : room
    ),
  };
  setState({ currentReport: next });
}

export function setRoomPanoramaImage(roomId, panoramaImage) {
  if (!state.currentReport) return;
  const next = {
    ...state.currentReport,
    rooms: state.currentReport.rooms.map((room) =>
      room.roomId === roomId
        ? {
            ...room,
            panoramaImage: panoramaImage || "",
            panoramaMediaId:
              room.media.find((media) => media.type === "pano" && (media.preview || media.url || "") === panoramaImage)?.id ||
              room.panoramaMediaId ||
              "",
            visuallyDocumented: Boolean(panoramaImage) || room.visuallyDocumented,
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
