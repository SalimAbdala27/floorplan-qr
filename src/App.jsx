import { useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import FloorPlan from "./components/Floorplan.jsx";
import FuseBox from "./components/Fusebox.jsx";
import FloorplanCanvas from "./components/FloorplanCanvas.jsx";
import InventoryFlow from "./components/InventoryFlow.jsx";
import MarketingBrochureFlow from "./components/MarketingBrochureFlow.jsx";
import AuthScreen from "./components/AuthScreen.jsx";
import { supabase } from "./lib/supabaseClient";
import {
  applyConstraints,
  layoutToStructuredPlan,
  structuredPlanToLayout,
} from "./engine/constraints";

const STORAGE_KEY_PREFIX = "floorplan_qr_state_v3";
const FLOORPLAN_PIXELS_PER_METER = 40;

function metersToPixels(meters, fallback) {
  const numeric = Number.parseFloat(meters);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.round(numeric * FLOORPLAN_PIXELS_PER_METER);
}

function pixelsToMeters(pixels, fallback) {
  const numeric = Number.parseFloat(pixels);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Number((numeric / FLOORPLAN_PIXELS_PER_METER).toFixed(2));
}

function hexToRgb(hex, fallback = [31, 41, 55]) {
  const value = String(hex || "").replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return fallback;
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function getImageFormat(dataUrl, fallback = "JPEG") {
  const value = String(dataUrl || "").toLowerCase();
  if (value.startsWith("data:image/png")) return "PNG";
  if (value.startsWith("data:image/webp")) return "WEBP";
  return fallback;
}

function formatInventoryCondition(value) {
  if (!value || value === "na") return "Not stated / N/A";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function addContainedImage(doc, imageData, x, y, maxWidth, maxHeight, fallbackFormat = "JPEG", align = "center") {
  const imageFormat = getImageFormat(imageData, fallbackFormat);
  const props = doc.getImageProperties(imageData);
  const width = props?.width || maxWidth;
  const height = props?.height || maxHeight;
  const scale = Math.min(maxWidth / width, maxHeight / height);
  const drawWidth = Math.max(1, width * scale);
  const drawHeight = Math.max(1, height * scale);
  const drawX =
    align === "left"
      ? x
      : x + (maxWidth - drawWidth) / 2;
  const drawY = y + (maxHeight - drawHeight) / 2;
  doc.addImage(imageData, imageFormat, drawX, drawY, drawWidth, drawHeight);
  return {
    x: drawX,
    y: drawY,
    width: drawWidth,
    height: drawHeight,
  };
}

function drawInventoryMediaGrid(doc, mediaItems, startY, roomName, overallCondition, primaryRgb) {
  const marginX = 14;
  const columns = 3;
  const rowsPerPage = 3;
  const pageSize = columns * rowsPerPage;
  const gapX = 6;
  const gapY = 10;
  const cellWidth = 58;
  const imageHeight = 38;
  const cellHeight = imageHeight + 10;
  const labelOffsetY = imageHeight + 4;
  let pageStartY = startY;

  mediaItems.forEach((media, index) => {
    if (index > 0 && index % pageSize === 0) {
      doc.addPage();
      pageStartY = 20;
    }

    if (index % pageSize === 0) {
      doc.setFontSize(11);
      doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
      const heading = index === 0 ? "Inventory Media" : "Inventory Media (continued)";
      doc.text(`${heading}: ${roomName}`, marginX, pageStartY);
      doc.setFontSize(9);
      doc.setTextColor(70, 70, 70);
      doc.text(`Overall condition: ${formatInventoryCondition(overallCondition)}`, marginX, pageStartY + 4);
      pageStartY += 8;
    }

    const pageIndex = index % pageSize;
    const row = Math.floor(pageIndex / columns);
    const column = pageIndex % columns;
    const x = marginX + (cellWidth + gapX) * column;
    const y = pageStartY + row * (cellHeight + gapY);

    if (media.preview || media.url?.startsWith("data:image")) {
      try {
        const imageData = media.preview || media.url;
        addContainedImage(doc, imageData, x, y, cellWidth, imageHeight);
      } catch {
        doc.setTextColor(90, 90, 90);
        doc.text("Image unavailable", x, y + 12, { maxWidth: cellWidth });
      }
    } else {
      doc.setTextColor(90, 90, 90);
      doc.text("Image unavailable", x, y + 12, { maxWidth: cellWidth });
    }

    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    doc.text(media.type === "pano" ? "Panorama" : "Photo", x, y + labelOffsetY, { maxWidth: cellWidth });
    if (media.type === "pano") {
      doc.text("360 panorama captured", x, y + labelOffsetY + 4, { maxWidth: cellWidth });
    }
    if (media.assignment) {
      doc.text(`Assigned: ${media.assignment}`, x, y + labelOffsetY + (media.type === "pano" ? 8 : 4), {
        maxWidth: cellWidth,
      });
    }
  });
}

const HOME_PRESETS = [
  {
    key: "studio_flat",
    group: "Flats",
    label: "Studio Flat",
    roomNames: ["Entrance", "Studio Room", "Kitchenette", "Bathroom", "Storage"],
  },
  {
    key: "flat_1bed",
    group: "Flats",
    label: "Flat (1 bedroom)",
    roomNames: ["Entrance Hall", "Living Room", "Kitchen", "Bathroom", "Bedroom 1"],
  },
  {
    key: "flat_2bed",
    group: "Flats",
    label: "Flat (2 bedroom)",
    roomNames: [
      "Entrance Hall",
      "Living Room",
      "Kitchen",
      "Bathroom",
      "Bedroom 1",
      "Bedroom 2",
    ],
  },
  {
    key: "flat_3bed",
    group: "Flats",
    label: "Flat (3 bedroom)",
    roomNames: [
      "Entrance Hall",
      "Living Room",
      "Kitchen",
      "Bathroom",
      "Bedroom 1",
      "Bedroom 2",
      "Bedroom 3",
    ],
  },
  {
    key: "maisonette_2bed",
    group: "Flats",
    label: "Maisonette (2 bedroom)",
    roomNames: [
      "Entrance",
      "Living Room",
      "Kitchen",
      "Upstairs Landing",
      "Bathroom",
      "Bedroom 1",
      "Bedroom 2",
    ],
  },
  {
    key: "bungalow_2bed",
    group: "Houses",
    label: "Bungalow (2 bedroom)",
    roomNames: [
      "Entrance",
      "Living Room",
      "Kitchen",
      "Bathroom",
      "Bedroom 1",
      "Bedroom 2",
      "Utility Room",
    ],
  },
  {
    key: "house_2bed",
    group: "Houses",
    label: "House (2 bedroom)",
    roomNames: [
      "Entrance",
      "Living Room",
      "Kitchen",
      "Downstairs WC",
      "Upstairs Landing",
      "Bathroom",
      "Bedroom 1",
      "Bedroom 2",
    ],
  },
  {
    key: "house_3bed",
    group: "Houses",
    label: "House (3 bedroom)",
    roomNames: [
      "Entrance",
      "Living Room",
      "Kitchen",
      "Downstairs WC",
      "Upstairs Landing",
      "Bathroom",
      "Bedroom 1",
      "Bedroom 2",
      "Bedroom 3",
    ],
  },
  {
    key: "house_4bed",
    group: "Houses",
    label: "House (4 bedroom)",
    roomNames: [
      "Entrance",
      "Living Room",
      "Dining Room",
      "Kitchen",
      "Utility Room",
      "Downstairs WC",
      "Upstairs Landing",
      "Bathroom",
      "Bedroom 1",
      "Bedroom 2",
      "Bedroom 3",
      "Bedroom 4",
    ],
  },
  {
    key: "house_5bed",
    group: "Houses",
    label: "House (5 bedroom)",
    roomNames: [
      "Entrance",
      "Living Room",
      "Dining Room",
      "Kitchen",
      "Utility Room",
      "Downstairs WC",
      "Upstairs Landing",
      "Bathroom",
      "Ensuite",
      "Bedroom 1",
      "Bedroom 2",
      "Bedroom 3",
      "Bedroom 4",
      "Bedroom 5",
    ],
  },
  {
    key: "townhouse_4bed",
    group: "Houses",
    label: "Townhouse (4 bedroom)",
    roomNames: [
      "Ground Hall",
      "Kitchen",
      "Living Room",
      "First Floor Landing",
      "Second Floor Landing",
      "Bathroom",
      "Ensuite",
      "Bedroom 1",
      "Bedroom 2",
      "Bedroom 3",
      "Bedroom 4",
    ],
  },
  {
    key: "hmo_6bed",
    group: "Special",
    label: "HMO (6 bedroom)",
    roomNames: [
      "Entrance",
      "Communal Living Room",
      "Communal Kitchen",
      "Ground Floor WC",
      "First Floor Bathroom",
      "Second Floor Bathroom",
      "Bedroom 1",
      "Bedroom 2",
      "Bedroom 3",
      "Bedroom 4",
      "Bedroom 5",
      "Bedroom 6",
    ],
  },
];

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function getPresetByKey(key) {
  return HOME_PRESETS.find((preset) => preset.key === key) || HOME_PRESETS[0];
}

function isSingleFloorPresetKey(presetKey) {
  return String(presetKey).startsWith("flat_") ||
    String(presetKey) === "studio_flat" ||
    String(presetKey).startsWith("bungalow_");
}

function isHousePresetKey(presetKey) {
  return String(presetKey).startsWith("house_") || String(presetKey).startsWith("townhouse_");
}

function inferFloorIdFromRoomName(name) {
  const value = String(name || "").toLowerCase();
  if (value.includes("second floor") || value.includes("2nd floor")) return "floor_3";
  if (
    value.includes("upstairs") ||
    value.includes("first floor") ||
    value.includes("1st floor") ||
    value.includes("landing")
  ) {
    return "floor_2";
  }
  return "floor_1";
}

function getDefaultFloorNameById(floorId) {
  if (floorId === "floor_1") return "Ground Floor";
  if (floorId === "floor_2") return "First Floor";
  if (floorId === "floor_3") return "Second Floor";
  return `Floor ${String(floorId).replace("floor_", "")}`;
}

function buildRoomsFromPreset(presetKey) {
  const preset = getPresetByKey(presetKey);
  let names = [...preset.roomNames];

  if (isSingleFloorPresetKey(presetKey)) {
    names = names.filter((name) => {
      const value = String(name).toLowerCase();
      return !value.includes("landing") && !value.includes("stairs");
    });
  }

  if (isHousePresetKey(presetKey)) {
    if (!names.some((name) => String(name).toLowerCase().includes("entrance"))) {
      names.unshift("Entrance");
    }
    if (!names.some((name) => String(name).toLowerCase().includes("stairs"))) {
      const entranceIndex = names.findIndex((name) => String(name).toLowerCase().includes("entrance"));
      names.splice(Math.max(entranceIndex + 1, 1), 0, "Stairs");
    }
    if (!names.some((name) => String(name).toLowerCase().includes("downstairs wc"))) {
      const kitchenIndex = names.findIndex((name) => String(name).toLowerCase().includes("kitchen"));
      names.splice(Math.max(kitchenIndex + 1, 1), 0, "Downstairs WC");
    }
    if (
      !names.some(
        (name) =>
          String(name).toLowerCase().includes("bathroom") ||
          String(name).toLowerCase().includes("upstairs wc")
      )
    ) {
      names.push("Bathroom");
    }

    const bedroomCount = names.filter((name) => String(name).toLowerCase().includes("bedroom")).length;
    if (bedroomCount > 3 && !names.some((name) => String(name).toLowerCase().includes("upstairs wc"))) {
      const upstairsLandingIndex = names.findIndex((name) => String(name).toLowerCase().includes("landing"));
      if (upstairsLandingIndex >= 0) {
        names.splice(upstairsLandingIndex + 1, 0, "Upstairs WC");
      } else {
        names.push("Upstairs WC");
      }
    }
  }

  return names.map((name, index) => {
    const lower = String(name).toLowerCase();
    let floorId = inferFloorIdFromRoomName(name);

    if (isSingleFloorPresetKey(presetKey)) {
      floorId = "floor_1";
    } else if (isHousePresetKey(presetKey)) {
      if (
        lower.includes("entrance") ||
        lower.includes("kitchen") ||
        lower.includes("living") ||
        lower.includes("dining") ||
        lower.includes("utility") ||
        lower.includes("stairs") ||
        lower.includes("downstairs wc") ||
        lower.includes("ground floor")
      ) {
        floorId = "floor_1";
      } else if (
        lower.includes("bed") ||
        lower.includes("bathroom") ||
        lower.includes("upstairs wc") ||
        lower.includes("upstairs") ||
        lower.includes("first floor") ||
        lower.includes("landing")
      ) {
        floorId = "floor_2";
      }
    }

    return {
    id: `room_${slugify(name)}_${index + 1}`,
    name,
    floorId,
    widthMeters: 4,
    heightMeters: 3,
    lightsFuseId: null,
    socketsFuseId: null,
    };
  });
}

function buildBooleanMapFromRooms(rooms, defaultValue = false) {
  const map = {};
  rooms.forEach((room) => {
    map[room.id] = defaultValue;
  });
  return map;
}

function buildLayoutFromRooms(rooms, presetKey = "") {
  const groupedRooms = rooms.reduce((acc, room) => {
    const floorId = room.floorId || "floor_1";
    if (!acc[floorId]) acc[floorId] = [];
    acc[floorId].push(room);
    return acc;
  }, {});

  const floorIds = Object.keys(groupedRooms).length ? Object.keys(groupedRooms) : ["floor_1"];
  const orderedFloorIds = floorIds.sort((a, b) => {
    const aNum = Number.parseInt(a.replace("floor_", ""), 10) || 0;
    const bNum = Number.parseInt(b.replace("floor_", ""), 10) || 0;
    return aNum - bNum;
  });

  const layout = {
    floors: orderedFloorIds.map((floorId) => ({
      id: floorId,
      name: getDefaultFloorNameById(floorId),
      rooms: (groupedRooms[floorId] || []).map((room, index) => ({
        id: `layout_${room.id}`,
        name: room.name,
        x: 24 + (index % 2) * 180,
        y: 24 + Math.floor(index / 2) * 125,
        w: metersToPixels(room.widthMeters, 160),
        h: metersToPixels(room.heightMeters, 110),
      })),
      doors: [],
      windows: [],
      spaces: [],
      stairs: [],
    })),
    activeFloorId: orderedFloorIds[0] || "floor_1",
  };

  if (isSingleFloorPresetKey(presetKey)) {
    return {
      ...layout,
      floors: layout.floors
        .filter((floor) => floor.id === "floor_1")
        .map((floor) => ({ ...floor, stairs: [] })),
      activeFloorId: "floor_1",
    };
  }

  if (isHousePresetKey(presetKey)) {
    const hasFirstFloor = layout.floors.some((floor) => floor.id === "floor_2");
    const nextFloors = hasFirstFloor
      ? layout.floors
      : [
          ...layout.floors,
          {
            id: "floor_2",
            name: "First Floor",
            rooms: [],
            doors: [],
            windows: [],
            spaces: [],
            stairs: [],
          },
        ];

    return {
      ...layout,
      floors: nextFloors,
      activeFloorId: "floor_1",
    };
  }

  return layout;
}

function createDefaultMarketingBrochure(homeName = "") {
  return {
    askingPrice: "",
    addressLine: homeName || "",
    propertyType: "",
    tenure: "",
    councilTaxBand: "",
    epcRating: "",
    headline: "",
    summary: "",
    keyFeaturesText: "",
    branchName: "",
    agentName: "",
    agentPhone: "",
    agentEmail: "",
    heroImage: "",
    galleryImages: [],
    selectedInventoryMediaIds: [],
    floorplanSource: "generated",
    floorplanImage: "",
    accentColor: "#dbeafe",
  };
}

function normalizeMarketingBrochure(value, homeName = "") {
  const defaults = createDefaultMarketingBrochure(homeName);
  return {
    ...defaults,
    ...(value || {}),
    addressLine: String(value?.addressLine || defaults.addressLine),
    galleryImages: Array.isArray(value?.galleryImages) ? value.galleryImages : [],
    selectedInventoryMediaIds: Array.isArray(value?.selectedInventoryMediaIds) ? value.selectedInventoryMediaIds : [],
    floorplanSource: value?.floorplanSource === "uploaded" ? "uploaded" : "generated",
    accentColor: String(value?.accentColor || defaults.accentColor),
  };
}

function countRoomsByKeywords(rooms, keywords) {
  return (rooms || []).filter((room) => {
    const name = String(room.name || "").toLowerCase();
    return keywords.some((keyword) => name.includes(keyword));
  }).length;
}

function deriveMarketingStats(rooms, floors) {
  return {
    bedrooms: countRoomsByKeywords(rooms, ["bedroom", "bed "]),
    bathrooms: countRoomsByKeywords(rooms, ["bathroom", "ensuite", "downstairs wc", "upstairs wc", "wc"]),
    receptions: countRoomsByKeywords(rooms, ["living room", "reception", "lounge", "dining room"]),
    floors: floors?.length || 1,
  };
}

function getBrochureHeroImage(home) {
  if (home?.marketingBrochure?.heroImage) return home.marketingBrochure.heroImage;
  const inventoryRooms = home?.inventoryReport?.rooms || [];
  const firstPano = inventoryRooms.flatMap((room) => room.media || []).find((media) => media.type === "pano");
  if (firstPano?.preview || firstPano?.url) return firstPano.preview || firstPano.url;
  const firstPhoto = inventoryRooms.flatMap((room) => room.media || []).find((media) => media.preview || media.url);
  return firstPhoto?.preview || firstPhoto?.url || "";
}

function getInventoryBrochureMedia(home) {
  const inventoryRooms = home?.inventoryReport?.rooms || [];
  return inventoryRooms.flatMap((roomInventory) => {
    const roomName = home?.rooms?.find((room) => room.id === roomInventory.roomId)?.name || roomInventory.roomId;
    return (roomInventory.media || [])
      .filter((media) => media.preview || media.url)
      .map((media) => ({
        id: media.id,
        url: media.preview || media.url,
        type: media.type || "photo",
        roomName,
      }));
  });
}

function normalizeFloorplanLayout(layout, rooms) {
  const isAutoGeneratedStairs = (item) => {
    const id = String(item?.id || "");
    return id.startsWith("stairs_auto_") || /^stairs_[a-z0-9_]+_main$/i.test(id);
  };

  if (layout && Array.isArray(layout.floors) && layout.floors.length > 0) {
    const floors = layout.floors.map((floor, index) => ({
      id: floor?.id || `floor_${index + 1}`,
      name: floor?.name || `Floor ${index + 1}`,
      rooms: Array.isArray(floor?.rooms) ? floor.rooms : [],
      doors: Array.isArray(floor?.doors) ? floor.doors : [],
      windows: Array.isArray(floor?.windows) ? floor.windows : [],
      spaces: Array.isArray(floor?.spaces) ? floor.spaces : [],
      stairs: Array.isArray(floor?.stairs)
        ? floor.stairs.filter((item) => !isAutoGeneratedStairs(item))
        : [],
    }));

    const activeFloorId = floors.some((floor) => floor.id === layout.activeFloorId)
      ? layout.activeFloorId
      : floors[0].id;

    return {
      floors,
      activeFloorId,
    };
  }

  if (layout && (Array.isArray(layout.rooms) || Array.isArray(layout.doors))) {
    return {
      floors: [
        {
          id: "floor_1",
          name: "Ground Floor",
          rooms: Array.isArray(layout.rooms) ? layout.rooms : [],
          doors: Array.isArray(layout.doors) ? layout.doors : [],
          windows: Array.isArray(layout.windows) ? layout.windows : [],
          spaces: Array.isArray(layout.spaces) ? layout.spaces : [],
          stairs: Array.isArray(layout.stairs)
            ? layout.stairs.filter((item) => !isAutoGeneratedStairs(item))
            : [],
        },
      ],
      activeFloorId: "floor_1",
    };
  }

  return buildLayoutFromRooms(rooms);
}

function applyLayoutRules(layout) {
  const structured = layoutToStructuredPlan(layout);
  const constrained = applyConstraints(structured);
  return structuredPlanToLayout(constrained, layout);
}

function buildPresetLayout(presetKey, rooms) {
  const baseLayout = buildLayoutFromRooms(rooms, presetKey);
  if (isSingleFloorPresetKey(presetKey)) {
    return baseLayout;
  }
  return applyLayoutRules(baseLayout);
}

function createBaseHome(id, name, presetKey) {
  const preset = getPresetByKey(presetKey);
  const rooms = buildRoomsFromPreset(preset.key);

  return {
    id,
    name,
    presetKey: preset.key,
    fuses: [],
    rooms,
    breakers: {},
    nextFuseNumber: 1,
    fuseboxPhoto: null,
    gasChecks: buildBooleanMapFromRooms(rooms, false),
    fireAlarmChecks: buildBooleanMapFromRooms(rooms, false),
    floorplanLayout: buildPresetLayout(preset.key, rooms),
    inventoryReport: null,
    marketingBrochure: createDefaultMarketingBrochure(name),
  };
}

function isValidStateShape(value) {
  return Boolean(value && Array.isArray(value.homes));
}

function getStorageKey(userId) {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

function loadSavedState(userId) {
  if (!userId) return null;

  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return isValidStateShape(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function HomeScreen({
  home,
  onBack,
  userEmail,
  onSignOut,
  onUpdateHome,
  onDeleteHome,
  onRenameHome,
}) {
  const [newFuseRating, setNewFuseRating] = useState("B6");
  const [targetFuseCount, setTargetFuseCount] = useState("12");
  const [activeFlow, setActiveFlow] = useState("fusebox");
  const [generatorPresetKey, setGeneratorPresetKey] = useState(home.presetKey || HOME_PRESETS[0].key);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomFloorId, setNewRoomFloorId] = useState("floor_1");
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [roomMeasurementDraft, setRoomMeasurementDraft] = useState({ width: "", height: "" });
  const [roomListMeasurementDrafts, setRoomListMeasurementDrafts] = useState({});
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [pdfBranding, setPdfBranding] = useState({
    companyName: "",
    primaryColor: "#1f2937",
    accentColor: "#e2e8f0",
    logoDataUrl: null,
  });
  const [floorplanStep, setFloorplanStep] = useState("preset");
  const [reportSections, setReportSections] = useState({
    fusebox: true,
    floorplan: true,
    gas: true,
    fire: true,
    inventory: true,
  });
  const floorplanStepOrder = ["preset", "rooms", "draw", "review"];
  const previousHomeIdRef = useRef(home.id);

  useEffect(() => {
    setGeneratorPresetKey(home.presetKey || HOME_PRESETS[0].key);
    if (previousHomeIdRef.current === home.id) return;

    previousHomeIdRef.current = home.id;
    setNewFuseRating("B6");
    setActiveFlow("fusebox");
    setNewRoomName("");
    setNewRoomFloorId("floor_1");
    setSelectedRoomId(null);
    setRoomMeasurementDraft({ width: "", height: "" });
    setRoomListMeasurementDrafts({});
    setFloorplanStep("preset");
    setExportModalOpen(false);
    setPdfBranding({
      companyName: "",
      primaryColor: "#1f2937",
      accentColor: "#e2e8f0",
      logoDataUrl: null,
    });
  }, [home.id, home.presetKey]);

  useEffect(() => {
    setTargetFuseCount(String(Math.max(home.fuses.length, 1)));
  }, [home.fuses.length]);

  useEffect(() => {
    if (activeFlow !== "floorplan") return;
    setFloorplanStep("preset");
  }, [activeFlow]);

  const skipFloorplanStep = () => {
    const currentIndex = floorplanStepOrder.indexOf(floorplanStep);
    const nextIndex = Math.min(currentIndex + 1, floorplanStepOrder.length - 1);
    setFloorplanStep(floorplanStepOrder[nextIndex]);
  };

  const fuseById = useMemo(
    () => Object.fromEntries(home.fuses.map((fuse) => [fuse.id, fuse])),
    [home.fuses]
  );
  const floors = useMemo(() => {
    const normalized = normalizeFloorplanLayout(home.floorplanLayout, home.rooms);
    return normalized.floors;
  }, [home.floorplanLayout, home.rooms]);
  const floorNameById = useMemo(
    () => Object.fromEntries(floors.map((floor) => [floor.id, floor.name])),
    [floors]
  );
  const selectedRoom = useMemo(
    () => home.rooms.find((room) => room.id === selectedRoomId) || null,
    [home.rooms, selectedRoomId]
  );
  const selectedRoomWidthMeters = selectedRoom?.widthMeters ?? 4;
  const selectedRoomHeightMeters = selectedRoom?.heightMeters ?? 3;
  const marketingBrochure = useMemo(
    () => normalizeMarketingBrochure(home.marketingBrochure, home.name),
    [home.marketingBrochure, home.name]
  );
  const brochureHeroImage = useMemo(() => getBrochureHeroImage({ ...home, marketingBrochure }), [home, marketingBrochure]);
  const inventoryBrochureMedia = useMemo(() => getInventoryBrochureMedia(home), [home]);
  const selectedBrochureImages = useMemo(() => {
    const uploaded = (marketingBrochure.galleryImages || []).map((image) => ({
      id: image.id,
      url: image.url,
      type: "upload",
      roomName: image.caption || "Uploaded image",
    }));
    const selectedInventory = inventoryBrochureMedia.filter((media) =>
      (marketingBrochure.selectedInventoryMediaIds || []).includes(media.id)
    );
    return [...uploaded, ...selectedInventory];
  }, [marketingBrochure.galleryImages, marketingBrochure.selectedInventoryMediaIds, inventoryBrochureMedia]);
  const marketingStats = useMemo(() => deriveMarketingStats(home.rooms, floors), [home.rooms, floors]);

  useEffect(() => {
    if (!floors.some((floor) => floor.id === newRoomFloorId)) {
      setNewRoomFloorId(floors[0]?.id || "floor_1");
    }
  }, [floors, newRoomFloorId]);

  useEffect(() => {
    if (!selectedRoom) {
      setRoomMeasurementDraft({ width: "", height: "" });
      return;
    }

    setRoomMeasurementDraft({
      width: String(selectedRoomWidthMeters),
      height: String(selectedRoomHeightMeters),
    });
  }, [selectedRoomId, selectedRoom, selectedRoomWidthMeters, selectedRoomHeightMeters]);

  useEffect(() => {
    setRoomListMeasurementDrafts(() => {
      const next = {};
      home.rooms.forEach((room) => {
        next[room.id] = {
          width: String(room.widthMeters ?? 4),
          height: String(room.heightMeters ?? 3),
        };
      });
      return next;
    });
  }, [home.rooms]);

  const circuitsByFuse = useMemo(
    () =>
      home.rooms.reduce((acc, room) => {
        if (room.lightsFuseId) {
          if (!acc[room.lightsFuseId]) acc[room.lightsFuseId] = [];
          acc[room.lightsFuseId].push(`${room.name} Lights`);
        }

        if (room.socketsFuseId) {
          if (!acc[room.socketsFuseId]) acc[room.socketsFuseId] = [];
          acc[room.socketsFuseId].push(`${room.name} Sockets`);
        }

        return acc;
      }, {}),
    [home.rooms]
  );

  const affectedCircuits = home.rooms.flatMap((room) => {
    const impacted = [];
    if (room.lightsFuseId && !home.breakers[room.lightsFuseId]) {
      impacted.push(`${room.name} Lights`);
    }
    if (room.socketsFuseId && !home.breakers[room.socketsFuseId]) {
      impacted.push(`${room.name} Sockets`);
    }
    return impacted;
  });

  const affectedRooms = home.rooms
    .filter(
      (room) =>
        (room.lightsFuseId && !home.breakers[room.lightsFuseId]) ||
        (room.socketsFuseId && !home.breakers[room.socketsFuseId])
    )
    .map((room) => room.name);

  const normalizeHome = (nextHome) => {
    const validFuseIds = new Set(nextHome.fuses.map((fuse) => fuse.id));
    const normalizedLayout = normalizeFloorplanLayout(nextHome.floorplanLayout, nextHome.rooms);
    const validFloorIds = new Set(normalizedLayout.floors.map((floor) => floor.id));
    const fallbackFloorId = normalizedLayout.activeFloorId || normalizedLayout.floors[0]?.id || "floor_1";

    const normalizedBreakers = {};
    nextHome.fuses.forEach((fuse) => {
      normalizedBreakers[fuse.id] = nextHome.breakers[fuse.id] ?? true;
    });

    const normalizedRooms = nextHome.rooms.map((room) => ({
      ...room,
      floorId: (() => {
        const roomName = String(room.name || "").toLowerCase();
        const inferredFloorId = inferFloorIdFromRoomName(room.name);
        const hasExplicitFloorName =
          roomName.includes("upstairs") ||
          roomName.includes("landing") ||
          roomName.includes("first floor") ||
          roomName.includes("1st floor") ||
          roomName.includes("second floor") ||
          roomName.includes("2nd floor");
        if (hasExplicitFloorName && validFloorIds.has(inferredFloorId)) return inferredFloorId;
        return room.floorId && validFloorIds.has(room.floorId) ? room.floorId : fallbackFloorId;
      })(),
      widthMeters:
        Number.isFinite(Number.parseFloat(room.widthMeters)) && Number.parseFloat(room.widthMeters) > 0
          ? Number.parseFloat(room.widthMeters)
          : 4,
      heightMeters:
        Number.isFinite(Number.parseFloat(room.heightMeters)) && Number.parseFloat(room.heightMeters) > 0
          ? Number.parseFloat(room.heightMeters)
          : 3,
      lightsFuseId:
        room.lightsFuseId && validFuseIds.has(room.lightsFuseId) ? room.lightsFuseId : null,
      socketsFuseId:
        room.socketsFuseId && validFuseIds.has(room.socketsFuseId) ? room.socketsFuseId : null,
    }));

    const normalizeRoomMap = (map) => {
      const normalized = {};
      normalizedRooms.forEach((room) => {
        normalized[room.id] = Boolean(map?.[room.id]);
      });
      return normalized;
    };

    const normalizedInventoryReport =
      nextHome.inventoryReport &&
      Array.isArray(nextHome.inventoryReport.rooms) &&
      typeof nextHome.inventoryReport.createdAt === "string"
        ? {
            ...nextHome.inventoryReport,
            rooms: nextHome.inventoryReport.rooms.filter((roomInventory) =>
              normalizedRooms.some((room) => room.id === roomInventory.roomId)
            ),
          }
        : null;
    const normalizedMarketingBrochure = normalizeMarketingBrochure(
      nextHome.marketingBrochure,
      nextHome.name
    );

    return {
      ...nextHome,
      fuses: nextHome.fuses.map((fuse) => ({
        ...fuse,
        label: fuse.label || "",
        linkedRoomId:
          fuse.linkedRoomId && normalizedRooms.some((room) => room.id === fuse.linkedRoomId)
            ? fuse.linkedRoomId
            : null,
      })),
      rooms: normalizedRooms,
      breakers: normalizedBreakers,
      gasChecks: normalizeRoomMap(nextHome.gasChecks),
      fireAlarmChecks: normalizeRoomMap(nextHome.fireAlarmChecks),
      floorplanLayout: normalizedLayout,
      inventoryReport: normalizedInventoryReport,
      marketingBrochure: normalizedMarketingBrochure,
    };
  };

  const updateHome = (mutator) => {
    onUpdateHome((prev) => normalizeHome(mutator(prev)));
  };

  const toggleBreaker = (fuseId) => {
    if (!fuseById[fuseId]) return;
    updateHome((prev) => ({
      ...prev,
      breakers: {
        ...prev.breakers,
        [fuseId]: !prev.breakers[fuseId],
      },
    }));
  };

  const addFuse = () => {
    const cleanedRating = newFuseRating.trim().toUpperCase();
    if (!cleanedRating) return;

    updateHome((prev) => {
      const newFuse = {
        id: `fuse${prev.nextFuseNumber}`,
        number: prev.nextFuseNumber,
        rating: cleanedRating,
        label: "",
        linkedRoomId: null,
      };

      return {
        ...prev,
        fuses: [...prev.fuses, newFuse],
        breakers: {
          ...prev.breakers,
          [newFuse.id]: true,
        },
        nextFuseNumber: prev.nextFuseNumber + 1,
      };
    });

    setNewFuseRating("B6");
  };

  const removeFuse = (fuseId) => {
    updateHome((prev) => ({
      ...prev,
      fuses: prev.fuses.filter((fuse) => fuse.id !== fuseId),
      rooms: prev.rooms.map((room) => ({
        ...room,
        lightsFuseId: room.lightsFuseId === fuseId ? null : room.lightsFuseId,
        socketsFuseId: room.socketsFuseId === fuseId ? null : room.socketsFuseId,
      })),
    }));
  };

  const generateFuses = () => {
    const count = Math.max(1, Math.min(64, Number.parseInt(targetFuseCount, 10) || 1));

    updateHome((prev) => {
      const generated = Array.from({ length: count }, (_, index) => {
        const existing = prev.fuses[index];
        return {
          id: `fuse${index + 1}`,
          number: index + 1,
          rating: existing?.rating || "B6",
          label: existing?.label || "",
          linkedRoomId: existing?.linkedRoomId || null,
        };
      });

      return {
        ...prev,
        fuses: generated,
        nextFuseNumber: count + 1,
      };
    });
  };

  const updateFuseDetails = (fuseId, patch) => {
    updateHome((prev) => ({
      ...prev,
      fuses: prev.fuses.map((fuse) =>
        fuse.id === fuseId
          ? {
              ...fuse,
              ...patch,
            }
          : fuse
      ),
    }));
  };

  const updateRoomFuse = (roomId, circuitType, fuseId) => {
    const field = circuitType === "lights" ? "lightsFuseId" : "socketsFuseId";

    updateHome((prev) => ({
      ...prev,
      rooms: prev.rooms.map((room) =>
        room.id === roomId
          ? {
              ...room,
              [field]: fuseId || null,
            }
          : room
      ),
    }));
  };

  const addRoomToHome = (roomName, preferredFloorId, options = {}) => {
    const cleanName = String(roomName || "").trim();
    if (!cleanName) return null;

    const roomId = `room_${slugify(cleanName)}_${Date.now()}`;

    updateHome((prev) => {
      const normalizedLayout = normalizeFloorplanLayout(prev.floorplanLayout, prev.rooms);
      const selectedFloorId =
        normalizedLayout.floors.some((floor) => floor.id === preferredFloorId)
          ? preferredFloorId
          : normalizedLayout.activeFloorId;

      return {
        ...prev,
        rooms: [
          ...prev.rooms,
          {
            id: roomId,
            name: cleanName,
            floorId: selectedFloorId,
            widthMeters: 4,
            heightMeters: 3,
            lightsFuseId: null,
            socketsFuseId: null,
          },
        ],
        gasChecks: {
          ...prev.gasChecks,
          [roomId]: false,
        },
        fireAlarmChecks: {
          ...prev.fireAlarmChecks,
          [roomId]: false,
        },
        floorplanLayout: {
          ...normalizedLayout,
          floors: normalizedLayout.floors.map((floor) =>
            floor.id === selectedFloorId
              ? {
                  ...floor,
                  rooms: [
                    ...floor.rooms,
                    {
                      id: `layout_${roomId}`,
                      name: cleanName,
                      x: 36,
                      y: 36,
                      w: metersToPixels(4, 160),
                      h: metersToPixels(3, 110),
                    },
                  ],
                }
              : floor
          ),
        },
      };
    });

    setSelectedRoomId(roomId);
    if (options.openFloorplan) {
      setFloorplanStep("draw");
    }
    return roomId;
  };

  const addRoom = () => {
    const addedRoomId = addRoomToHome(newRoomName, newRoomFloorId, { openFloorplan: true });
    if (!addedRoomId) return;
    setNewRoomName("");
  };

  const removeRoom = (roomId) => {
    updateHome((prev) => {
      const normalizedLayout = normalizeFloorplanLayout(prev.floorplanLayout, prev.rooms);
      return {
        ...prev,
        rooms: prev.rooms.filter((room) => room.id !== roomId),
        fuses: prev.fuses.map((fuse) => ({
          ...fuse,
          linkedRoomId: fuse.linkedRoomId === roomId ? null : fuse.linkedRoomId,
        })),
        gasChecks: Object.fromEntries(
          Object.entries(prev.gasChecks || {}).filter(([id]) => id !== roomId)
        ),
        fireAlarmChecks: Object.fromEntries(
          Object.entries(prev.fireAlarmChecks || {}).filter(([id]) => id !== roomId)
        ),
        floorplanLayout: {
          ...normalizedLayout,
          floors: normalizedLayout.floors.map((floor) => ({
            ...floor,
            rooms: floor.rooms.filter((layoutRoom) => layoutRoom.id !== `layout_${roomId}`),
          })),
        },
      };
    });
    if (selectedRoomId === roomId) setSelectedRoomId(null);
  };

  const updateRoomFloor = (roomId, floorId) => {
    updateHome((prev) => {
      const targetRoom = prev.rooms.find((room) => room.id === roomId);
      if (!targetRoom) return prev;

      const normalizedLayout = normalizeFloorplanLayout(prev.floorplanLayout, prev.rooms);
      const fromFloorId = targetRoom.floorId || normalizedLayout.activeFloorId;
      const toFloorId = floorId || normalizedLayout.activeFloorId;

      const existingLayoutRoom =
        normalizedLayout.floors
          .find((floor) => floor.id === fromFloorId)
          ?.rooms.find((layoutRoom) => layoutRoom.id === `layout_${roomId}`) || null;

      return {
        ...prev,
        rooms: prev.rooms.map((room) =>
          room.id === roomId
            ? {
                ...room,
                floorId: toFloorId,
              }
            : room
        ),
        floorplanLayout: {
          ...normalizedLayout,
          floors: normalizedLayout.floors.map((floor) => {
            if (floor.id === fromFloorId && floor.id !== toFloorId) {
              return {
                ...floor,
                rooms: floor.rooms.filter((layoutRoom) => layoutRoom.id !== `layout_${roomId}`),
              };
            }

            if (floor.id === toFloorId) {
              const alreadyHere = floor.rooms.some((layoutRoom) => layoutRoom.id === `layout_${roomId}`);
              const nextLayoutRoom = existingLayoutRoom || {
                id: `layout_${roomId}`,
                name: targetRoom.name,
                x: 36,
                y: 36,
                w: 160,
                h: 110,
              };
              return {
                ...floor,
                rooms: alreadyHere ? floor.rooms : [...floor.rooms, nextLayoutRoom],
              };
            }

            return floor;
          }),
        },
      };
    });
  };

  const updateRoomMeasurements = (roomId, widthMeters, heightMeters) => {
    updateHome((prev) => {
      const normalizedLayout = normalizeFloorplanLayout(prev.floorplanLayout, prev.rooms);
      const targetRoom = prev.rooms.find((room) => room.id === roomId);
      if (!targetRoom) return prev;
      const safeWidth = Math.max(1, Math.min(20, Number.parseFloat(widthMeters) || 4));
      const safeHeight = Math.max(1, Math.min(20, Number.parseFloat(heightMeters) || 3));
      const targetFloorId = targetRoom.floorId || normalizedLayout.activeFloorId;

      return {
        ...prev,
        rooms: prev.rooms.map((room) =>
          room.id === roomId
            ? {
                ...room,
                widthMeters: safeWidth,
                heightMeters: safeHeight,
              }
            : room
        ),
        floorplanLayout: {
          ...normalizedLayout,
          floors: normalizedLayout.floors.map((floor) => {
            const existingLayoutRoom = floor.rooms.find((layoutRoom) => layoutRoom.id === `layout_${roomId}`);
            if (existingLayoutRoom) {
              return {
                ...floor,
                rooms: floor.rooms.map((layoutRoom) =>
                  layoutRoom.id === `layout_${roomId}`
                    ? {
                        ...layoutRoom,
                        name: targetRoom.name,
                        w: metersToPixels(safeWidth, layoutRoom.w),
                        h: metersToPixels(safeHeight, layoutRoom.h),
                      }
                    : layoutRoom
                ),
              };
            }

            if (floor.id !== targetFloorId) return floor;

            return {
              ...floor,
              rooms: [
                ...floor.rooms,
                {
                  id: `layout_${roomId}`,
                  name: targetRoom.name,
                  x: 36,
                  y: 36,
                  w: metersToPixels(safeWidth, 160),
                  h: metersToPixels(safeHeight, 110),
                },
              ],
            };
          }),
        },
      };
    });
  };

  const commitRoomMeasurementDraft = (roomId, dimension) => {
    const draftValue = roomMeasurementDraft[dimension];
    const parsed = Number.parseFloat(draftValue);

    if (!Number.isFinite(parsed)) {
      setRoomMeasurementDraft((prev) => ({
        ...prev,
        [dimension]: String(dimension === "width" ? selectedRoomWidthMeters : selectedRoomHeightMeters),
      }));
      return;
    }

    const nextWidth = dimension === "width" ? parsed : selectedRoomWidthMeters;
    const nextHeight = dimension === "height" ? parsed : selectedRoomHeightMeters;
    updateRoomMeasurements(roomId, nextWidth, nextHeight);
  };

  const commitRoomListMeasurementDraft = (roomId, dimension) => {
    const room = home.rooms.find((entry) => entry.id === roomId);
    if (!room) return;

    const draftValue = roomListMeasurementDrafts[roomId]?.[dimension] ?? "";
    const parsed = Number.parseFloat(draftValue);

    if (!Number.isFinite(parsed)) {
      setRoomListMeasurementDrafts((prev) => ({
        ...prev,
        [roomId]: {
          width: prev[roomId]?.width ?? String(room.widthMeters ?? 4),
          height: prev[roomId]?.height ?? String(room.heightMeters ?? 3),
          [dimension]: String(dimension === "width" ? room.widthMeters ?? 4 : room.heightMeters ?? 3),
        },
      }));
      return;
    }

    updateRoomMeasurements(
      roomId,
      dimension === "width" ? parsed : room.widthMeters ?? 4,
      dimension === "height" ? parsed : room.heightMeters ?? 3
    );
  };

  const toggleGasCheck = (roomId) => {
    updateHome((prev) => ({
      ...prev,
      gasChecks: {
        ...prev.gasChecks,
        [roomId]: !prev.gasChecks?.[roomId],
      },
    }));
  };

  const toggleFireAlarmCheck = (roomId) => {
    updateHome((prev) => ({
      ...prev,
      fireAlarmChecks: {
        ...prev.fireAlarmChecks,
        [roomId]: !prev.fireAlarmChecks?.[roomId],
      },
    }));
  };

  const regenerateRoomsFromPreset = () => {
    const nextPreset = getPresetByKey(generatorPresetKey);
    const nextRooms = buildRoomsFromPreset(nextPreset.key);

    updateHome((prev) => ({
      ...prev,
      presetKey: nextPreset.key,
      rooms: nextRooms,
      gasChecks: buildBooleanMapFromRooms(nextRooms, false),
      fireAlarmChecks: buildBooleanMapFromRooms(nextRooms, false),
      floorplanLayout: buildPresetLayout(nextPreset.key, nextRooms),
    }));
    setNewRoomFloorId("floor_1");
    setSelectedRoomId(nextRooms[0]?.id || null);
    setFloorplanStep("rooms");
  };

  const updateFloorplanLayout = (nextLayout) => {
    updateHome((prev) => {
      const normalizedLayout = normalizeFloorplanLayout(nextLayout, prev.rooms);
      const layoutRooms = normalizedLayout.floors.flatMap((floor) =>
        floor.rooms.map((layoutRoom) => ({
          ...layoutRoom,
          floorId: floor.id,
        }))
      );
      const layoutRoomById = Object.fromEntries(layoutRooms.map((room) => [room.id, room]));

      const syncedRooms = prev.rooms
        .filter((room) => Boolean(layoutRoomById[`layout_${room.id}`]))
        .map((room) => {
          const layoutRoom = layoutRoomById[`layout_${room.id}`];
          return {
            ...room,
            name: layoutRoom.name || room.name,
            floorId: layoutRoom.floorId || room.floorId,
            widthMeters: pixelsToMeters(layoutRoom.w, room.widthMeters || 4),
            heightMeters: pixelsToMeters(layoutRoom.h, room.heightMeters || 3),
          };
        });

      const existingRoomIds = new Set(syncedRooms.map((room) => room.id));
      const createdFromLayout = layoutRooms
        .filter((layoutRoom) => layoutRoom.id.startsWith("layout_"))
        .map((layoutRoom) => {
          const rawId = layoutRoom.id.slice("layout_".length);
          const roomId = rawId || `room_${Date.now()}`;
          return {
            id: roomId,
            name: layoutRoom.name || "Room",
            floorId: layoutRoom.floorId || normalizedLayout.activeFloorId,
            widthMeters: pixelsToMeters(layoutRoom.w, 4),
            heightMeters: pixelsToMeters(layoutRoom.h, 3),
            lightsFuseId: null,
            socketsFuseId: null,
          };
        })
        .filter((room) => !existingRoomIds.has(room.id));

      const nextRooms = [...syncedRooms, ...createdFromLayout];
      const nextGasChecks = { ...prev.gasChecks };
      const nextFireChecks = { ...prev.fireAlarmChecks };
      nextRooms.forEach((room) => {
        if (nextGasChecks[room.id] === undefined) nextGasChecks[room.id] = false;
        if (nextFireChecks[room.id] === undefined) nextFireChecks[room.id] = false;
      });

      return {
        ...prev,
        rooms: nextRooms,
        gasChecks: nextGasChecks,
        fireAlarmChecks: nextFireChecks,
        floorplanLayout: normalizedLayout,
      };
    });
  };

  const compressImageFileToDataUrl = async (file, maxSize = 1280, quality = 0.78) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Failed to read image"));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Invalid image"));
        img.onload = () => {
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          const width = Math.round(img.width * scale);
          const height = Math.round(img.height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          if (!context) {
            reject(new Error("Canvas not available"));
            return;
          }
          context.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });

  const onFuseboxPhotoSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      updateHome((prev) => ({
        ...prev,
        fuseboxPhoto: dataUrl,
      }));
    } catch {
      // no-op; keep flow simple for now
    } finally {
      event.target.value = "";
    }
  };

  const onPdfLogoSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const logoDataUrl = await compressImageFileToDataUrl(file, 640, 0.82);
      setPdfBranding((prev) => ({
        ...prev,
        logoDataUrl,
      }));
    } catch {
      // no-op
    } finally {
      event.target.value = "";
    }
  };

  const updateMarketingBrochure = (patch) => {
    updateHome((prev) => ({
      ...prev,
      marketingBrochure: {
        ...normalizeMarketingBrochure(prev.marketingBrochure, prev.name),
        ...patch,
      },
    }));
  };

  const onBrochureHeroSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const heroImage = await compressImageFileToDataUrl(file, 1800, 0.8);
      updateMarketingBrochure({ heroImage });
    } catch {
      // no-op
    } finally {
      event.target.value = "";
    }
  };

  const onBrochureGallerySelected = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    try {
      const nextImages = await Promise.all(
        files.map(async (file, index) => ({
          id: `brochure_upload_${Date.now()}_${index}`,
          url: await compressImageFileToDataUrl(file, 1800, 0.8),
          caption: file.name || "Uploaded image",
        }))
      );
      updateHome((prev) => ({
        ...prev,
        marketingBrochure: {
          ...normalizeMarketingBrochure(prev.marketingBrochure, prev.name),
          galleryImages: [
            ...normalizeMarketingBrochure(prev.marketingBrochure, prev.name).galleryImages,
            ...nextImages,
          ],
        },
      }));
    } catch {
      // no-op
    } finally {
      event.target.value = "";
    }
  };

  const removeBrochureGalleryImage = (imageId) => {
    updateMarketingBrochure({
      galleryImages: marketingBrochure.galleryImages.filter((image) => image.id !== imageId),
    });
  };

  const toggleInventoryBrochureMedia = (mediaId) => {
    const selectedIds = marketingBrochure.selectedInventoryMediaIds || [];
    updateMarketingBrochure({
      selectedInventoryMediaIds: selectedIds.includes(mediaId)
        ? selectedIds.filter((id) => id !== mediaId)
        : [...selectedIds, mediaId],
    });
  };

  const onBrochureFloorplanSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const floorplanImage = await compressImageFileToDataUrl(file, 1800, 0.84);
      updateMarketingBrochure({
        floorplanSource: "uploaded",
        floorplanImage,
      });
    } catch {
      // no-op
    } finally {
      event.target.value = "";
    }
  };

  const exportMarketingBrochurePdf = () => {
    const brochure = normalizeMarketingBrochure(home.marketingBrochure, home.name);
    const doc = new jsPDF();
    const safeHomeName = (home.name || "Home").replace(/[^\w\s-]/g, "").trim() || "home";
    const primaryRgb = hexToRgb(pdfBranding.primaryColor, [31, 41, 55]);
    const accentRgb = hexToRgb(brochure.accentColor, [219, 234, 254]);
    const heroImage = brochureHeroImage;
    const brochureLayout = normalizeFloorplanLayout(home.floorplanLayout, home.rooms);
    const brochureGalleryImages = [
      ...(brochure.galleryImages || []).map((image) => ({
        id: image.id,
        url: image.url,
        label: image.caption || "Uploaded image",
      })),
      ...inventoryBrochureMedia
        .filter((media) => (brochure.selectedInventoryMediaIds || []).includes(media.id))
        .map((media) => ({
          id: media.id,
          url: media.url,
          label: `${media.roomName}${media.type === "pano" ? " panorama" : ""}`,
        })),
    ];
    const featureLines = String(brochure.keyFeaturesText || "")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    const roomRows = home.rooms.map((room) => [
      room.name,
      floorNameById[room.floorId] || getDefaultFloorNameById(room.floorId || "floor_1"),
      `${room.widthMeters || 4}m x ${room.heightMeters || 3}m`,
    ]);
    const statText = [
      marketingStats.bedrooms ? `${marketingStats.bedrooms} bed` : null,
      marketingStats.bathrooms ? `${marketingStats.bathrooms} bath` : null,
      marketingStats.receptions ? `${marketingStats.receptions} reception` : null,
      marketingStats.floors ? `${marketingStats.floors} floor` : null,
    ]
      .filter(Boolean)
      .join("  |  ");
    const drawGeneratedBrochureFloorplanPage = (floor) => {
      const margin = 14;
      const drawX = margin;
      const drawY = 24;
      const drawWidth = 182;
      const drawHeight = 220;
      const allItems = [
        ...(floor.rooms || []),
        ...(floor.doors || []),
        ...(floor.windows || []),
        ...(floor.spaces || []),
        ...(floor.stairs || []),
      ];
      const maxX = Math.max(760, ...allItems.map((item) => (item.x || 0) + (item.w || 0)));
      const maxY = Math.max(520, ...allItems.map((item) => (item.y || 0) + (item.h || 0)));
      const scale = Math.min(drawWidth / maxX, drawHeight / maxY);
      const offsetX = drawX + (drawWidth - maxX * scale) / 2;
      const offsetY = drawY + (drawHeight - maxY * scale) / 2;
      const sx = (value) => offsetX + value * scale;
      const sy = (value) => offsetY + value * scale;
      const sw = (value) => value * scale;

      doc.addPage();
      doc.setFillColor(...primaryRgb);
      doc.rect(0, 0, 210, 18, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.text(`Floorplan: ${floor.name}`, 14, 12);
      doc.setDrawColor(210, 210, 210);
      doc.setLineWidth(0.3);
      doc.rect(drawX, drawY, drawWidth, drawHeight);

      doc.setDrawColor(230, 230, 230);
      doc.setLineWidth(0.2);
      for (let gx = 0; gx <= maxX; gx += 40) {
        doc.line(sx(gx), drawY, sx(gx), drawY + drawHeight);
      }
      for (let gy = 0; gy <= maxY; gy += 40) {
        doc.line(drawX, sy(gy), drawX + drawWidth, sy(gy));
      }

      (floor.rooms || []).forEach((room) => {
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(1);
        doc.rect(sx(room.x), sy(room.y), sw(room.w), sw(room.h), "FD");
        doc.setTextColor(40, 40, 40);
        doc.setFontSize(8);
        doc.text(
          `${String(room.name || "Room")} (${pixelsToMeters(room.w, 4)}m x ${pixelsToMeters(room.h, 3)}m)`,
          sx(room.x) + 2,
          sy(room.y) + 4,
          { maxWidth: Math.max(12, sw(room.w) - 4) }
        );
      });

      (floor.windows || []).forEach((windowItem) => {
        doc.setDrawColor(80, 80, 80);
        doc.setLineWidth(1);
        doc.rect(sx(windowItem.x), sy(windowItem.y), sw(windowItem.w), sw(windowItem.h));
      });

      (floor.doors || []).forEach((door) => {
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.9);
        doc.line(sx(door.x), sy((door.y || 0) + (door.h || 0)), sx((door.x || 0) + (door.w || 0)), sy((door.y || 0) + (door.h || 0)));
      });

      (floor.spaces || []).forEach((space) => {
        doc.setDrawColor(120, 120, 120);
        doc.setLineWidth(0.35);
        doc.rect(sx(space.x), sy(space.y), sw(space.w), sw(space.h));
        doc.setTextColor(80, 80, 80);
        doc.setFontSize(6.8);
        doc.text(String(space.label || "Item"), sx(space.x) + 1.5, sy(space.y) + Math.min(4, sw(space.h) - 1), {
          maxWidth: Math.max(8, sw(space.w) - 3),
        });
      });

      (floor.stairs || []).forEach((stairsItem) => {
        doc.setFillColor(...accentRgb);
        doc.setDrawColor(90, 90, 90);
        doc.setLineWidth(0.6);
        doc.rect(sx(stairsItem.x), sy(stairsItem.y), sw(stairsItem.w), sw(stairsItem.h), "FD");
        doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
        doc.setFontSize(7);
        doc.text(String(stairsItem.label || "Stairs"), sx(stairsItem.x) + 2, sy(stairsItem.y) + 5, {
          maxWidth: Math.max(8, sw(stairsItem.w) - 4),
        });
      });
    };

    doc.setFillColor(...primaryRgb);
    doc.rect(0, 0, 210, 26, "F");
    if (pdfBranding.logoDataUrl) {
      try {
        addContainedImage(doc, pdfBranding.logoDataUrl, 14, 8, 18, 18, "PNG", "left");
      } catch {
        // no-op
      }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text(brochure.addressLine || home.name, pdfBranding.logoDataUrl ? 38 : 14, 17, { maxWidth: 135 });
    doc.setFontSize(10);
    doc.text(brochure.propertyType || "Marketing brochure", pdfBranding.logoDataUrl ? 38 : 14, 23);

    if (heroImage) {
      try {
        doc.addImage(heroImage, "JPEG", 14, 32, 182, 82);
      } catch {
        doc.setFillColor(235, 235, 235);
        doc.rect(14, 32, 182, 82, "F");
      }
    } else {
      doc.setFillColor(235, 235, 235);
      doc.rect(14, 32, 182, 82, "F");
      doc.setTextColor(120, 120, 120);
      doc.setFontSize(12);
      doc.text("Add a brochure hero image or inventory photo", 58, 74);
    }

    doc.setFillColor(...accentRgb);
    doc.roundedRect(14, 120, 58, 24, 4, 4, "F");
    doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
    doc.setFontSize(9);
    doc.text("Guide price", 18, 129);
    doc.setFontSize(18);
    doc.text(brochure.askingPrice || "Add asking price", 18, 139, { maxWidth: 48 });

    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9);
    if (statText) {
      doc.text(statText, 78, 129, { maxWidth: 118 });
    }
    const detailText = [
      brochure.tenure ? `Tenure: ${brochure.tenure}` : null,
      brochure.councilTaxBand ? `Council tax: ${brochure.councilTaxBand}` : null,
      brochure.epcRating ? `EPC: ${brochure.epcRating}` : null,
    ]
      .filter(Boolean)
      .join("  |  ");
    if (detailText) {
      doc.text(detailText, 78, 137, { maxWidth: 118 });
    }

    doc.setTextColor(70, 70, 70);
    doc.setFontSize(10);
    doc.text(
      brochure.headline || "Marketing-ready brochure generated from your saved property details.",
      78,
      149,
      { maxWidth: 118, lineHeightFactor: 1.35 }
    );

    doc.addPage();
    doc.setFillColor(...primaryRgb);
    doc.rect(0, 0, 210, 18, "F");
    if (pdfBranding.logoDataUrl) {
      try {
        addContainedImage(doc, pdfBranding.logoDataUrl, 14, 3, 12, 12, "PNG", "left");
      } catch {
        // no-op
      }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text("Property overview", pdfBranding.logoDataUrl ? 30 : 14, 12);

    doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
    doc.setFontSize(18);
    doc.text(brochure.headline || "Property overview", 14, 32, { maxWidth: 182 });
    doc.setTextColor(70, 70, 70);
    doc.setFontSize(10);
    doc.text(
      brochure.summary ||
        "Create a brochure summary from the floorplan, room layout, and photography stored against this home.",
      14,
      42,
      { maxWidth: 182, lineHeightFactor: 1.45 }
    );

    let nextY = 88;
    doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
    doc.setFontSize(12);
    doc.text("Key features", 14, nextY);
    nextY += 7;
    doc.setTextColor(70, 70, 70);
    doc.setFontSize(10);
    (featureLines.length ? featureLines.slice(0, 8) : ["Add key features in the brochure builder."]).forEach((feature) => {
      doc.circle(18, nextY - 1.2, 0.8, "F");
      doc.text(feature, 22, nextY, { maxWidth: 170 });
      nextY += 6;
    });

    autoTable(doc, {
      startY: Math.max(nextY + 6, 146),
      head: [["Room", "Floor", "Approx size"]],
      body: roomRows.length ? roomRows : [["No rooms added", "-", "-"]],
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 2.6 },
      headStyles: {
        fillColor: primaryRgb,
        textColor: [255, 255, 255],
      },
    });

    doc.addPage();
    doc.setFillColor(...primaryRgb);
    doc.rect(0, 0, 210, 18, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text("Floorplan and contact", 14, 12);

    const floorRows = floors.map((floor) => [
      floor.name,
      String(floor.rooms.length),
      String(floor.doors.length),
      String(floor.windows.length),
      String(floor.spaces.length),
    ]);
    autoTable(doc, {
      startY: 24,
      head: [["Floor", "Rooms", "Doors", "Windows", "Items"]],
      body: floorRows.length ? floorRows : [["No floorplan", "0", "0", "0", "0"]],
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 2.6 },
      headStyles: { fillColor: accentRgb, textColor: primaryRgb },
    });

    const afterFloorTable = doc.lastAutoTable.finalY + 10;
    doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
    doc.setFontSize(12);
    doc.text("Included in this home record", 14, afterFloorTable);
    doc.setTextColor(70, 70, 70);
    doc.setFontSize(10);
    doc.text(
      "Generated from the saved room schedule, floor assignments, room measurements, and any uploaded inventory imagery.",
      14,
      afterFloorTable + 7,
      { maxWidth: 182 }
    );

    const contactTop = afterFloorTable + 22;
    doc.setFillColor(...accentRgb);
    doc.roundedRect(14, contactTop, 182, 46, 4, 4, "F");
    doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
    doc.setFontSize(12);
    doc.text("Book a viewing", 18, contactTop + 10);
    doc.setFontSize(10);
    const contactLines = [
      brochure.branchName || pdfBranding.companyName || "Add branch details",
      brochure.agentName || "Add agent name",
      brochure.agentPhone || "Add phone number",
      brochure.agentEmail || "Add email address",
    ];
    contactLines.forEach((line, index) => {
      doc.text(line, 18, contactTop + 18 + index * 6, { maxWidth: 170 });
    });

    if (brochureGalleryImages.length) {
      let galleryIndex = 0;
      while (galleryIndex < brochureGalleryImages.length) {
        doc.addPage();
        doc.setFillColor(...primaryRgb);
        doc.rect(0, 0, 210, 18, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.text("Property photography", 14, 12);

        const pageImages = brochureGalleryImages.slice(galleryIndex, galleryIndex + 4);
        pageImages.forEach((image, index) => {
          const column = index % 2;
          const row = Math.floor(index / 2);
          const x = 14 + column * 91;
          const y = 26 + row * 122;
          try {
            doc.addImage(image.url, "JPEG", x, y, 84, 72);
          } catch {
            doc.setFillColor(235, 235, 235);
            doc.rect(x, y, 84, 72, "F");
          }
          doc.setTextColor(80, 80, 80);
          doc.setFontSize(9);
          doc.text(image.label, x, y + 78, { maxWidth: 84 });
        });

        galleryIndex += 4;
      }
    }

    if (brochure.floorplanSource === "uploaded" && brochure.floorplanImage) {
      doc.addPage();
      doc.setFillColor(...primaryRgb);
      doc.rect(0, 0, 210, 18, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.text("Floorplan", 14, 12);
      try {
        doc.addImage(brochure.floorplanImage, "JPEG", 14, 26, 182, 250);
      } catch {
        doc.setTextColor(120, 120, 120);
        doc.setFontSize(12);
        doc.text("Uploaded floorplan could not be rendered.", 50, 148);
      }
    } else {
      brochureLayout.floors.forEach((floor) => {
        drawGeneratedBrochureFloorplanPage(floor);
      });
    }

    doc.setTextColor(120, 120, 120);
    doc.setFontSize(8);
    doc.text(`Generated ${new Date().toLocaleString()}`, 14, 286);

    doc.save(`${safeHomeName.toLowerCase().replace(/\s+/g, "_")}_marketing_brochure.pdf`);
  };

  const exportReportPdf = () => {
    const selectedKeys = Object.entries(reportSections)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key);
    if (!selectedKeys.length) return;

    const doc = new jsPDF();
    const generatedAt = new Date().toLocaleString();
    const safeHomeName = (home.name || "Home").replace(/[^\w\s-]/g, "").trim() || "home";
    const primaryRgb = hexToRgb(pdfBranding.primaryColor, [31, 41, 55]);
    const accentRgb = hexToRgb(pdfBranding.accentColor, [226, 232, 240]);
    const formatInventoryCondition = (value) =>
      !value || value === "na"
        ? "Not stated / N/A"
        : `${String(value).charAt(0).toUpperCase()}${String(value).slice(1)}`;
    let currentY = 32;

    if (pdfBranding.logoDataUrl) {
      try {
        addContainedImage(doc, pdfBranding.logoDataUrl, 14, 10, 20, 20, "PNG", "left");
      } catch {
        // no-op
      }
    }

    doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
    doc.setFontSize(18);
    doc.text(`${home.name} - Property Report`, pdfBranding.logoDataUrl ? 38 : 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(90, 90, 90);
    doc.text(`Generated ${generatedAt}`, pdfBranding.logoDataUrl ? 38 : 14, 24);
    if (pdfBranding.companyName.trim()) {
      doc.text(`Prepared by ${pdfBranding.companyName.trim()}`, pdfBranding.logoDataUrl ? 38 : 14, 29);
      currentY = 36;
    }

    const addSectionHeading = (title) => {
      if (currentY > 260) {
        doc.addPage();
        currentY = 20;
      }
      doc.setFontSize(12);
      doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
      doc.text(title, 14, currentY);
      currentY += 5;
    };

    const addTable = (head, body) => {
      autoTable(doc, {
        startY: currentY,
        head: [head],
        body,
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: primaryRgb },
        alternateRowStyles: { fillColor: accentRgb },
      });
      currentY = doc.lastAutoTable.finalY + 8;
    };

    const drawFloorplanPage = (floor) => {
      doc.addPage();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;
      const headerY = 18;
      const drawX = margin;
      const drawY = 24;
      const drawWidth = pageWidth - margin * 2;
      const drawHeight = pageHeight - drawY - margin;

      const allItems = [
        ...(floor.rooms || []),
        ...(floor.doors || []),
        ...(floor.windows || []),
        ...(floor.spaces || []),
        ...(floor.stairs || []),
      ];
      const maxX = Math.max(760, ...allItems.map((item) => (item.x || 0) + (item.w || 0)));
      const maxY = Math.max(520, ...allItems.map((item) => (item.y || 0) + (item.h || 0)));
      const scale = Math.min(drawWidth / maxX, drawHeight / maxY);
      const offsetX = drawX + (drawWidth - maxX * scale) / 2;
      const offsetY = drawY + (drawHeight - maxY * scale) / 2;
      const sx = (value) => offsetX + value * scale;
      const sy = (value) => offsetY + value * scale;
      const sw = (value) => value * scale;
      const clampValue = (value, min, max) => Math.max(min, Math.min(max, value));
      const toRadians = (degrees) => (degrees * Math.PI) / 180;
      const rotatePoint = (x, y, cx, cy, degrees) => {
        const rad = toRadians(degrees || 0);
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const dx = x - cx;
        const dy = y - cy;
        return {
          x: cx + dx * cos - dy * sin,
          y: cy + dx * sin + dy * cos,
        };
      };
      const getRotatedRectFrame = (item) => {
        const x = sx(item.x);
        const y = sy(item.y);
        const w = Math.max(2, sw(item.w));
        const h = Math.max(2, sw(item.h));
        const cx = x + w / 2;
        const cy = y + h / 2;
        const angle = item.angle || 0;
        const p1 = rotatePoint(x, y, cx, cy, angle);
        const p2 = rotatePoint(x + w, y, cx, cy, angle);
        const p3 = rotatePoint(x + w, y + h, cx, cy, angle);
        const p4 = rotatePoint(x, y + h, cx, cy, angle);
        return { x, y, w, h, cx, cy, angle, p1, p2, p3, p4 };
      };
      const drawRotatedRect = (item, options = {}) => {
        const frame = getRotatedRectFrame(item);
        const { p1, p2, p3, p4 } = frame;

        if (options.fillColor) {
          doc.setFillColor(...options.fillColor);
        }
        if (options.strokeColor) {
          doc.setDrawColor(...options.strokeColor);
        }
        doc.setLineWidth(options.lineWidth ?? 0.6);
        doc.lines(
          [
            [p2.x - p1.x, p2.y - p1.y],
            [p3.x - p2.x, p3.y - p2.y],
            [p4.x - p3.x, p4.y - p3.y],
            [p1.x - p4.x, p1.y - p4.y],
          ],
          p1.x,
          p1.y,
          [1, 1],
          options.fill ? "FD" : "S",
          false
        );
        return frame;
      };
      const formatSpaceLabel = (space) => {
        const label = String(space?.label || "Space").toLowerCase();
        if (label.includes("toilet")) return "WC";
        if (label.includes("bath / shower")) return "Bath/Shower";
        if (label.includes("bathroom sink")) return "Sink";
        if (label.includes("sink")) return "Sink";
        if (label.includes("fridge")) return "Fridge";
        if (label.includes("oven") || label.includes("hob")) return "Oven/Hob";
        if (label.includes("cabinet")) return "Cabinets";
        if (label.includes("wardrobe")) return "Wardrobe";
        if (label.includes("cupboard")) return "Cupboard";
        if (label.includes("bed")) return "Bed";
        if (label.includes("sofa")) return "Sofa";
        if (label.includes("table")) return "Table";
        if (label.includes("chair")) return "Chairs";
        return String(space?.label || "Space");
      };
      const drawSpaceSymbol = (space, rect) => {
        const label = String(space?.label || "").toLowerCase();
        const rp = (px, py) => rotatePoint(px, py, rect.cx, rect.cy, rect.angle);
        const drawLine = (x1, y1, x2, y2, width = 0.45) => {
          const a = rp(x1, y1);
          const b = rp(x2, y2);
          doc.setLineWidth(width);
          doc.line(a.x, a.y, b.x, b.y);
        };
        const drawRect = (x, y, w, h, lineWidth = 0.45, fill = false) => {
          const p1 = rp(x, y);
          const p2 = rp(x + w, y);
          const p3 = rp(x + w, y + h);
          const p4 = rp(x, y + h);
          doc.setLineWidth(lineWidth);
          doc.lines(
            [
              [p2.x - p1.x, p2.y - p1.y],
              [p3.x - p2.x, p3.y - p2.y],
              [p4.x - p3.x, p4.y - p3.y],
              [p1.x - p4.x, p1.y - p4.y],
            ],
            p1.x,
            p1.y,
            [1, 1],
            fill ? "FD" : "S",
            false
          );
        };
        const drawCircle = (cx, cy, r, lineWidth = 0.45) => {
          const center = rp(cx, cy);
          doc.setLineWidth(lineWidth);
          doc.circle(center.x, center.y, r, "S");
        };

        doc.setDrawColor(40, 40, 40);
        doc.setTextColor(70, 70, 70);
        const x = rect.x;
        const y = rect.y;
        const w = rect.w;
        const h = rect.h;

        if (label.includes("bed")) {
          drawRect(x + 1, y + 1, w - 2, h - 2, 0.6);
          drawRect(x + 2, y + 2, Math.max(6, (w - 4) * 0.3), Math.max(4, (h - 4) * 0.3), 0.4);
          return;
        }
        if (label.includes("sofa")) {
          drawRect(x + w * 0.15, y + h * 0.35, w * 0.7, h * 0.45, 0.55);
          drawRect(x + w * 0.05, y + h * 0.38, w * 0.1, h * 0.38, 0.55);
          drawRect(x + w * 0.85, y + h * 0.38, w * 0.1, h * 0.38, 0.55);
          return;
        }
        if (label.includes("table")) {
          drawRect(x + w * 0.2, y + h * 0.2, w * 0.6, h * 0.6, 0.55);
          return;
        }
        if (label.includes("chair")) {
          const size = Math.min(w, h) * 0.55;
          drawRect(x + (w - size) / 2, y + (h - size) / 2, size, size, 0.55);
          return;
        }
        if (label.includes("toilet")) {
          drawRect(x + w * 0.35, y + h * 0.05, w * 0.3, h * 0.22, 0.55);
          drawCircle(x + w * 0.5, y + h * 0.62, Math.max(2, Math.min(w, h) * 0.22), 0.55);
          return;
        }
        if (label.includes("bath") || label.includes("shower")) {
          drawRect(x + 1, y + 1, w - 2, h - 2, 0.55);
          if (label.includes("shower")) {
            drawLine(x + 2, y + 2, x + w - 2, y + h - 2, 0.45);
            drawLine(x + w - 2, y + 2, x + 2, y + h - 2, 0.45);
          }
          return;
        }
        if (label.includes("sink")) {
          drawRect(x + w * 0.2, y + h * 0.2, w * 0.6, h * 0.6, 0.55);
          drawCircle(x + w * 0.5, y + h * 0.5, Math.max(2, Math.min(w, h) * 0.16), 0.45);
          return;
        }
        if (label.includes("cabinet") || label.includes("wardrobe") || label.includes("cupboard")) {
          drawRect(x + 1, y + 1, w - 2, h - 2, 0.55);
          drawLine(x + w * 0.5, y + 2, x + w * 0.5, y + h - 2, 0.45);
          return;
        }
        if (label.includes("oven") || label.includes("hob")) {
          drawRect(x + 1, y + 1, w - 2, h - 2, 0.55);
          const radius = Math.max(1.4, Math.min(w, h) * 0.08);
          drawCircle(x + w * 0.35, y + h * 0.35, radius, 0.45);
          drawCircle(x + w * 0.65, y + h * 0.35, radius, 0.45);
          drawCircle(x + w * 0.35, y + h * 0.65, radius, 0.45);
          drawCircle(x + w * 0.65, y + h * 0.65, radius, 0.45);
          return;
        }
        if (label.includes("fridge")) {
          doc.setLineDashPattern([1.5, 1.5], 0);
          drawRect(x + 1, y + 1, w - 2, h - 2, 0.55);
          doc.setLineDashPattern([], 0);
          return;
        }
      };
      const roomBounds = (floor.rooms || []).reduce(
        (acc, room) => ({
          minX: Math.min(acc.minX, room.x || 0),
          minY: Math.min(acc.minY, room.y || 0),
          maxX: Math.max(acc.maxX, (room.x || 0) + (room.w || 0)),
          maxY: Math.max(acc.maxY, (room.y || 0) + (room.h || 0)),
        }),
        { minX: Infinity, minY: Infinity, maxX: 0, maxY: 0 }
      );

      doc.setFontSize(14);
      doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
      doc.text(`Floorplan: ${floor.name}`, margin, headerY);
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.25);
      doc.rect(drawX, drawY, drawWidth, drawHeight);

      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.2);
      for (let gx = 0; gx <= maxX; gx += 40) {
        doc.line(sx(gx), drawY, sx(gx), drawY + drawHeight);
      }
      for (let gy = 0; gy <= maxY; gy += 40) {
        doc.line(drawX, sy(gy), drawX + drawWidth, sy(gy));
      }

      (floor.rooms || []).forEach((room) => {
        const roomWidthMeters = pixelsToMeters(room.w, 4);
        const roomHeightMeters = pixelsToMeters(room.h, 3);
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(1.1);
        doc.rect(sx(room.x), sy(room.y), sw(room.w), sw(room.h), "FD");
        doc.setTextColor(30, 30, 30);
        doc.setFontSize(8);
        doc.text(
          `${String(room.name || "Room")} (${roomWidthMeters}m x ${roomHeightMeters}m)`,
          sx(room.x) + 2,
          sy(room.y) + 4,
          { maxWidth: Math.max(10, sw(room.w) - 4) }
        );
      });

      (floor.doors || []).forEach((door) => {
        const x = sx(door.x);
        const y = sy(door.y);
        const doorW = Math.max(8, sw(door.w || 24));
        const doorH = Math.max(6, sw(door.h || 20));
        const cx = x + doorW / 2;
        const cy = y + doorH / 2;
        const angle = door.angle || 0;
        const baseStartRaw = { x: x + 2, y: y + doorH - 2 };
        const baseEndRaw = { x: x + doorW - 2, y: y + doorH - 2 };
        const leafEndRaw = { x: x + doorW - 2, y: y + 4 };
        const baseStart = rotatePoint(baseStartRaw.x, baseStartRaw.y, cx, cy, angle);
        const baseEnd = rotatePoint(baseEndRaw.x, baseEndRaw.y, cx, cy, angle);
        const leafEnd = rotatePoint(leafEndRaw.x, leafEndRaw.y, cx, cy, angle);

        // White opening in wall where the door sits.
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(2.1);
        doc.line(baseStart.x, baseStart.y, baseEnd.x, baseEnd.y);

        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.9);
        doc.line(baseStart.x, baseStart.y, baseEnd.x, baseEnd.y);
        doc.setLineWidth(0.7);
        doc.line(baseStart.x, baseStart.y, leafEnd.x, leafEnd.y);

        doc.setDrawColor(110, 110, 110);
        doc.setLineWidth(0.4);
        const steps = 12;
        let prevX = baseStart.x;
        let prevY = baseStart.y;
        for (let i = 1; i <= steps; i += 1) {
          const t = i / steps;
          const angle = (Math.PI / 2) * t;
          const localX = baseStartRaw.x + (baseEndRaw.x - baseStartRaw.x) * Math.sin(angle);
          const localY = baseStartRaw.y - (baseStartRaw.y - leafEndRaw.y) * (1 - Math.cos(angle));
          const point = rotatePoint(localX, localY, cx, cy, door.angle || 0);
          if (i % 2 === 1) {
            doc.line(prevX, prevY, point.x, point.y);
          }
          prevX = point.x;
          prevY = point.y;
        }
      });

      (floor.windows || []).forEach((windowItem) => {
        const rect = drawRotatedRect(windowItem, {
          fill: true,
          fillColor: [255, 255, 255],
          strokeColor: [80, 80, 80],
          lineWidth: 1.1,
        });
        const mullion1A = rotatePoint(rect.x + rect.w * 0.33, rect.y + 1, rect.cx, rect.cy, rect.angle);
        const mullion1B = rotatePoint(
          rect.x + rect.w * 0.33,
          rect.y + rect.h - 1,
          rect.cx,
          rect.cy,
          rect.angle
        );
        const mullion2A = rotatePoint(rect.x + rect.w * 0.66, rect.y + 1, rect.cx, rect.cy, rect.angle);
        const mullion2B = rotatePoint(
          rect.x + rect.w * 0.66,
          rect.y + rect.h - 1,
          rect.cx,
          rect.cy,
          rect.angle
        );
        doc.setDrawColor(80, 80, 80);
        doc.setLineWidth(0.5);
        doc.line(mullion1A.x, mullion1A.y, mullion1B.x, mullion1B.y);
        doc.line(mullion2A.x, mullion2A.y, mullion2B.x, mullion2B.y);
      });

      (floor.spaces || []).forEach((space) => {
        const spaceLabel = String(space?.label || "").toLowerCase();
        const hideContainer =
          spaceLabel.includes("sink") ||
          spaceLabel.includes("toilet") ||
          spaceLabel.includes("bed") ||
          spaceLabel.includes("sofa") ||
          spaceLabel.includes("table") ||
          spaceLabel.includes("chair") ||
          spaceLabel.includes("bath") ||
          spaceLabel.includes("shower") ||
          spaceLabel.includes("cabinet") ||
          spaceLabel.includes("wardrobe") ||
          spaceLabel.includes("cupboard") ||
          spaceLabel.includes("oven") ||
          spaceLabel.includes("hob") ||
          spaceLabel.includes("fridge");
        const rect = hideContainer
          ? getRotatedRectFrame(space)
          : drawRotatedRect(space, {
              fill: true,
              fillColor: [255, 255, 255],
              strokeColor: [140, 140, 140],
              lineWidth: 0.4,
            });
        drawSpaceSymbol(space, rect);
        const labelText = formatSpaceLabel(space);
        const tagPadding = 1.8;
        doc.setFontSize(6.8);
        const rawTextWidth = doc.getTextWidth(labelText);
        const tagWidth = Math.max(12, rawTextWidth + tagPadding * 2);
        const tagHeight = 4.8;
        const tagX = clampValue(rect.cx - tagWidth / 2, drawX + 1, drawX + drawWidth - tagWidth - 1);
        const tagY = clampValue(rect.y + rect.h + 1.2, drawY + 1, drawY + drawHeight - tagHeight - 1);
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(190, 190, 190);
        doc.setLineWidth(0.2);
        doc.rect(tagX, tagY, tagWidth, tagHeight, "FD");
        doc.setTextColor(70, 70, 70);
        doc.text(labelText, tagX + tagPadding, tagY + 3.4);
      });

      (floor.stairs || []).forEach((stairsItem) => {
        const rect = drawRotatedRect(stairsItem, {
          fill: true,
          fillColor: [220, 220, 220],
          strokeColor: [90, 90, 90],
          lineWidth: 0.8,
        });
        doc.setTextColor(80, 80, 80);
        doc.setFontSize(7);
        doc.text(
          String(stairsItem.label || "Stairs"),
          rect.cx - Math.min(18, rect.w / 2),
          rect.cy,
          { maxWidth: Math.max(8, rect.w - 4) }
        );
      });

      if (Number.isFinite(roomBounds.minX) && roomBounds.maxX > roomBounds.minX) {
        const dimY = sy(roomBounds.maxY) + 10;
        doc.setDrawColor(120, 120, 120);
        doc.setLineWidth(0.35);
        doc.line(sx(roomBounds.minX), dimY, sx(roomBounds.maxX), dimY);
        doc.line(sx(roomBounds.minX), dimY - 2, sx(roomBounds.minX), dimY + 2);
        doc.line(sx(roomBounds.maxX), dimY - 2, sx(roomBounds.maxX), dimY + 2);
        doc.setTextColor(90, 90, 90);
        doc.setFontSize(8);
        doc.text(
          `${Number(((roomBounds.maxX - roomBounds.minX) / FLOORPLAN_PIXELS_PER_METER).toFixed(2))}m`,
          (sx(roomBounds.minX) + sx(roomBounds.maxX)) / 2 - 6,
          dimY - 1
        );
      }

      if (Number.isFinite(roomBounds.minY) && roomBounds.maxY > roomBounds.minY) {
        const dimX = sx(roomBounds.maxX) + 8;
        doc.setDrawColor(120, 120, 120);
        doc.setLineWidth(0.35);
        doc.line(dimX, sy(roomBounds.minY), dimX, sy(roomBounds.maxY));
        doc.line(dimX - 2, sy(roomBounds.minY), dimX + 2, sy(roomBounds.minY));
        doc.line(dimX - 2, sy(roomBounds.maxY), dimX + 2, sy(roomBounds.maxY));
        doc.setTextColor(90, 90, 90);
        doc.setFontSize(8);
        doc.text(
          `${Number(((roomBounds.maxY - roomBounds.minY) / FLOORPLAN_PIXELS_PER_METER).toFixed(2))}m`,
          dimX + 1.5,
          (sy(roomBounds.minY) + sy(roomBounds.maxY)) / 2
        );
      }

      doc.setTextColor(80, 80, 80);
      doc.setFontSize(8);
      doc.text("Scale approx: 1m grid", drawX + 2, drawY + drawHeight - 3);
    };

    if (reportSections.fusebox) {
      addSectionHeading("Fusebox");
      doc.setFontSize(10);
      doc.text("Main Switch: 100A Main Isolator (ON)", 14, currentY);
      currentY += 4;

      const fuseBody = home.fuses.map((fuse) => {
        const linked = home.rooms
          .flatMap((room) => {
            const circuits = [];
            if (room.lightsFuseId === fuse.id) circuits.push(`${room.name} (Lights)`);
            if (room.socketsFuseId === fuse.id) circuits.push(`${room.name} (Sockets)`);
            return circuits;
          })
          .join(", ");

        return [
          `C${fuse.number}`,
          fuse.rating,
          home.breakers[fuse.id] ? "ON" : "OFF",
          linked || "Spare",
        ];
      });

      addTable(
        ["Circuit", "Rating", "Status", "Linked Circuits"],
        fuseBody.length ? fuseBody : [["-", "-", "-", "No fuses added"]]
      );

      const roomBody = home.rooms.map((room) => {
        const lightsFuse = room.lightsFuseId ? home.fuses.find((fuse) => fuse.id === room.lightsFuseId) : null;
        const socketsFuse = room.socketsFuseId ? home.fuses.find((fuse) => fuse.id === room.socketsFuseId) : null;

        return [
          room.name,
          floorNameById[room.floorId] || getDefaultFloorNameById(room.floorId || "floor_1"),
          lightsFuse ? `C${lightsFuse.number} (${lightsFuse.rating})` : "Unassigned",
          socketsFuse ? `C${socketsFuse.number} (${socketsFuse.rating})` : "Unassigned",
        ];
      });

      addTable(
        ["Room", "Floor", "Lights Fuse", "Sockets Fuse"],
        roomBody.length ? roomBody : [["-", "-", "No rooms added", "No rooms added"]]
      );
    }

    if (reportSections.floorplan) {
      addSectionHeading("Floorplan");
      const layout = normalizeFloorplanLayout(home.floorplanLayout, home.rooms);
      const floorSummary = layout.floors.map((floor) => [
        floor.name,
        String(floor.rooms.length),
        String(floor.doors.length),
        String(floor.windows.length),
        String(floor.spaces.length),
        String((floor.stairs || []).length),
      ]);
      addTable(
        ["Floor", "Rooms", "Doors", "Windows", "Spaces", "Stairs"],
        floorSummary.length ? floorSummary : [["No floors", "0", "0", "0", "0", "0"]]
      );

      const measurementRows = layout.floors.flatMap((floor) =>
        (floor.rooms || []).map((room) => [
          room.name || "Room",
          floor.name,
          `${pixelsToMeters(room.w, 4)}m`,
          `${pixelsToMeters(room.h, 3)}m`,
        ])
      );
      addTable(
        ["Room", "Floor", "Width", "Height"],
        measurementRows.length ? measurementRows : [["-", "-", "-", "-"]]
      );

      layout.floors.forEach((floor) => drawFloorplanPage(floor));
      if (reportSections.gas || reportSections.fire) {
        doc.addPage();
        currentY = 20;
      }
    }

    if (reportSections.gas) {
      addSectionHeading("Gas");
      const gasBody = home.rooms.map((room) => [
        room.name,
        floorNameById[room.floorId] || getDefaultFloorNameById(room.floorId || "floor_1"),
        home.gasChecks?.[room.id] ? "Recorded" : "Not set",
      ]);
      addTable(["Room", "Floor", "Gas Status"], gasBody.length ? gasBody : [["-", "-", "No rooms"]]);
    }

    if (reportSections.fire) {
      addSectionHeading("Fire Alarms");
      const fireBody = home.rooms.map((room) => [
        room.name,
        floorNameById[room.floorId] || getDefaultFloorNameById(room.floorId || "floor_1"),
        home.fireAlarmChecks?.[room.id] ? "Alarm present/checked" : "Not marked",
      ]);
      addTable(["Room", "Floor", "Alarm Status"], fireBody.length ? fireBody : [["-", "-", "No rooms"]]);
    }

    if (reportSections.inventory) {
      addSectionHeading("Inventory");
      const inventoryRooms = home.inventoryReport?.rooms || [];
      const inventoryBody = inventoryRooms.flatMap((roomInventory) => {
        const roomName =
          home.rooms.find((room) => room.id === roomInventory.roomId)?.name || roomInventory.roomId;
        const mediaCount = roomInventory.media?.length || 0;
        const panoCount =
          roomInventory.media?.filter((media) => media.type === "pano").length || 0;

        if (!roomInventory.items?.length) {
          return [[roomName, "-", "-", `Overall: ${formatInventoryCondition(roomInventory.overallCondition)} · Media: ${mediaCount} (${panoCount} pano)`]];
        }

        return roomInventory.items.map((item, index) => [
          index === 0 ? roomName : "",
          item.name || "-",
          formatInventoryCondition(item.condition),
          `${item.notes || ""}${
            index === 0
              ? ` ${item.notes ? "· " : ""}Overall: ${formatInventoryCondition(
                  roomInventory.overallCondition
                )} · Media: ${mediaCount} (${panoCount} pano)`
              : ""
          }`,
        ]);
      });
      addTable(
        ["Room", "Element", "Condition", "Notes / Media"],
        inventoryBody.length ? inventoryBody : [["No inventory report", "-", "-", "-"]]
      );

      inventoryRooms.forEach((roomInventory) => {
        const roomName =
          home.rooms.find((room) => room.id === roomInventory.roomId)?.name || roomInventory.roomId;
        const mediaItems = roomInventory.media || [];
        if (!mediaItems.length) return;

        if (currentY > 215) {
          doc.addPage();
          currentY = 20;
        }

        drawInventoryMediaGrid(
          doc,
          mediaItems,
          currentY,
          roomName,
          roomInventory.overallCondition,
          primaryRgb
        );
        currentY = 20;
      });
    }

    const fileName = `${safeHomeName.toLowerCase().replace(/\s+/g, "_")}_property_report.pdf`;
    doc.save(fileName);
    setExportModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col">
      <div className="px-4 pt-3">
        <div className="mx-auto w-full max-w-[23rem] md:max-w-4xl lg:max-w-5xl rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onBack}
              className="flex min-w-0 items-center gap-2"
            >
              <img
                src={`${process.env.PUBLIC_URL}/digifusebox-logo.png`}
                alt="EasyProp logo"
                className="h-8 w-auto"
              />
              <div className="rounded-full bg-zinc-100 px-2.5 py-1">
                <p className="max-w-[140px] truncate text-[11px] font-semibold text-zinc-700">{home.name}</p>
              </div>
            </button>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">Account</p>
              <p className="truncate text-[11px] font-medium text-zinc-700">{userEmail || "Unknown"}</p>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="h-8 shrink-0 rounded-lg bg-zinc-800 px-3 text-[11px] font-semibold text-white transition hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-2">
        <div className="mx-auto w-full max-w-[23rem] md:max-w-4xl lg:max-w-5xl rounded-xl border border-zinc-200 bg-white px-3 py-2 shadow-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={onBack}
              className="h-8 rounded-lg bg-zinc-200 px-3 text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-300"
            >
              Homes
            </button>
            <button
              type="button"
              onClick={() => onRenameHome(home.id)}
              className="h-8 rounded-lg bg-zinc-200 px-3 text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-300"
            >
              Rename
            </button>
            <button
              type="button"
              onClick={() => onDeleteHome(home.id)}
              className="h-8 rounded-lg bg-red-100 px-3 text-[11px] font-semibold text-red-700 transition hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-200"
            >
              Delete Home
            </button>
            <button
              type="button"
              onClick={() => setExportModalOpen(true)}
              className="h-8 rounded-lg bg-zinc-800 px-3 text-[11px] font-semibold text-white transition hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-300"
            >
              Export PDF
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-3">
        <div className="mx-auto w-full max-w-[23rem] md:max-w-4xl lg:max-w-5xl rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm">
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: "fusebox", label: "Fusebox" },
              { key: "gas", label: "Gas" },
              { key: "fire", label: "Fire Alarms" },
              { key: "inventory", label: "Inventory" },
              { key: "floorplan", label: "Floorplan Gen" },
              { key: "brochure", label: "Brochure" },
            ].map((flow) => (
              <button
                key={flow.key}
                type="button"
                onClick={() => setActiveFlow(flow.key)}
                className={`h-9 rounded-lg text-[11px] font-semibold transition ${
                  activeFlow === flow.key
                    ? "bg-zinc-800 text-white"
                    : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300"
                }`}
              >
                {flow.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeFlow === "floorplan" ? (
      <div className="px-4 pt-3">
        <div className="mx-auto w-full max-w-[23rem] md:max-w-4xl lg:max-w-5xl rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm">
          <div className="mb-2 flex items-center justify-end">
            <button
              type="button"
              onClick={skipFloorplanStep}
              disabled={floorplanStep === "review"}
              className="h-8 rounded-lg bg-zinc-200 px-3 text-[11px] font-semibold text-zinc-700 disabled:opacity-40"
            >
              Skip
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: "preset", label: "1. Preset" },
              { key: "rooms", label: "2. Rooms" },
              { key: "draw", label: "3. Draw" },
              { key: "review", label: "4. Review" },
            ].map((step) => (
              <button
                key={step.key}
                type="button"
                onClick={() => setFloorplanStep(step.key)}
                className={`h-9 rounded-lg text-[11px] font-semibold ${
                  floorplanStep === step.key
                    ? "bg-zinc-800 text-white"
                    : "bg-zinc-200 text-zinc-700"
                }`}
              >
                {step.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      ) : null}

      {activeFlow === "fusebox" ? (
      <div className="px-4 pt-3">
        <div className="mx-auto w-full max-w-[23rem] md:max-w-4xl lg:max-w-5xl rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
            Fusebox Photo
          </p>
          <div className="mt-2 flex items-center gap-2">
            <label className="h-9 rounded-lg bg-zinc-800 px-3 text-[11px] font-semibold text-white transition hover:bg-zinc-700 flex items-center cursor-pointer">
              Take / Upload
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={onFuseboxPhotoSelected}
              />
            </label>
            {home.fuseboxPhoto ? (
              <button
                type="button"
                onClick={() =>
                  updateHome((prev) => ({
                    ...prev,
                    fuseboxPhoto: null,
                  }))
                }
                className="h-9 rounded-lg bg-zinc-200 px-3 text-[11px] font-semibold text-zinc-700"
              >
                Remove Photo
              </button>
            ) : null}
          </div>
          {home.fuseboxPhoto ? (
            <img
              src={home.fuseboxPhoto}
              alt="Fusebox upload"
              className="mt-2 w-full rounded-lg border border-zinc-200 object-cover"
            />
          ) : (
            <p className="mt-2 text-xs text-zinc-500">No photo uploaded.</p>
          )}
        </div>
      </div>
      ) : null}

      {activeFlow === "fusebox" ? (
      <div className="px-4 pt-3">
        <div className="mx-auto w-full max-w-[23rem] md:max-w-4xl lg:max-w-5xl rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
            Fuse Count
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={64}
              value={targetFuseCount}
              onChange={(event) => setTargetFuseCount(event.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm text-zinc-700 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
            <button
              type="button"
              onClick={generateFuses}
              className="h-10 rounded-lg bg-zinc-800 px-3 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
      ) : null}

      {activeFlow === "floorplan" && floorplanStep === "preset" ? (
      <div className="px-4 pt-3">
        <div className="mx-auto w-full max-w-[23rem] md:max-w-4xl lg:max-w-5xl rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
            Floorplan Preset Generator
          </p>
          <p className="mt-1 text-xs text-zinc-500">Current preset: {getPresetByKey(home.presetKey).label}</p>
          <div className="mt-2 space-y-2">
            <select
              value={generatorPresetKey}
              onChange={(event) => setGeneratorPresetKey(event.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-700 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            >
              {Array.from(new Set(HOME_PRESETS.map((preset) => preset.group))).map((group) => (
                <optgroup key={group} label={group}>
                  {HOME_PRESETS.filter((preset) => preset.group === group).map((preset) => (
                    <option key={preset.key} value={preset.key}>
                      {preset.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              type="button"
              onClick={regenerateRoomsFromPreset}
              className="h-10 w-full rounded-lg bg-zinc-800 px-3 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            >
              Apply Preset to Floorplan
            </button>
          </div>
        </div>
      </div>
      ) : null}

      {activeFlow === "floorplan" && floorplanStep === "rooms" ? (
      <div className="px-4 pt-3">
        <div className="mx-auto w-full max-w-[23rem] md:max-w-4xl lg:max-w-5xl rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
            Rooms & Floor Assignment
          </p>
          <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
            <input
              value={newRoomName}
              onChange={(event) => setNewRoomName(event.target.value)}
              placeholder="Add room name"
              className="h-10 rounded-lg border border-zinc-300 px-3 text-sm text-zinc-700 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
            <button
              type="button"
              onClick={addRoom}
              className="h-10 rounded-lg bg-zinc-800 px-3 text-xs font-semibold text-zinc-100"
            >
              Add Room
            </button>
          </div>
          <select
            value={newRoomFloorId}
            onChange={(event) => setNewRoomFloorId(event.target.value)}
            className="mt-2 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-700 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          >
            {floors.map((floor) => (
              <option key={`new-room-floor-${floor.id}`} value={floor.id}>
                {floor.name}
              </option>
            ))}
          </select>

          <div className="mt-2 space-y-2">
            {home.rooms.map((room) => (
              <div key={`room-floor-${room.id}`} className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedRoomId(room.id)}
                    className={`truncate text-left text-xs font-semibold ${
                      selectedRoomId === room.id ? "text-zinc-900 underline" : "text-zinc-700"
                    }`}
                  >
                    {room.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRoom(room.id)}
                    className="h-7 rounded-lg bg-red-100 px-2 text-[10px] font-semibold text-red-700"
                  >
                    Remove
                  </button>
                </div>
                <select
                  value={room.floorId || floors[0]?.id || "floor_1"}
                  onChange={(event) => updateRoomFloor(room.id, event.target.value)}
                  className="mt-2 h-8 w-full rounded-lg border border-zinc-300 bg-white px-2 text-xs text-zinc-700"
                >
                  {floors.map((floor) => (
                    <option key={`${room.id}-floor-${floor.id}`} value={floor.id}>
                      {floor.name}
                    </option>
                  ))}
                </select>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="text-[10px] text-zinc-500">
                    Width (m)
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      max="20"
                      value={roomListMeasurementDrafts[room.id]?.width ?? String(room.widthMeters ?? 4)}
                      onChange={(event) =>
                        setRoomListMeasurementDrafts((prev) => ({
                          ...prev,
                          [room.id]: {
                            width: event.target.value,
                            height: prev[room.id]?.height ?? String(room.heightMeters ?? 3),
                          },
                        }))
                      }
                      onBlur={() => commitRoomListMeasurementDraft(room.id, "width")}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.currentTarget.blur();
                        }
                      }}
                      className="mt-1 h-8 w-full rounded-lg border border-zinc-300 px-2 text-xs"
                    />
                  </label>
                  <label className="text-[10px] text-zinc-500">
                    Height (m)
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      max="20"
                      value={roomListMeasurementDrafts[room.id]?.height ?? String(room.heightMeters ?? 3)}
                      onChange={(event) =>
                        setRoomListMeasurementDrafts((prev) => ({
                          ...prev,
                          [room.id]: {
                            width: prev[room.id]?.width ?? String(room.widthMeters ?? 4),
                            height: event.target.value,
                          },
                        }))
                      }
                      onBlur={() => commitRoomListMeasurementDraft(room.id, "height")}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.currentTarget.blur();
                        }
                      }}
                      className="mt-1 h-8 w-full rounded-lg border border-zinc-300 px-2 text-xs"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          {selectedRoom ? (
            <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-2.5">
              <p className="text-[11px] font-semibold text-zinc-700">
                Edit: {selectedRoom.name}
              </p>
              <label className="mt-2 block text-[10px] text-zinc-500">
                Floor
                <select
                  value={selectedRoom.floorId || floors[0]?.id || "floor_1"}
                  onChange={(event) => updateRoomFloor(selectedRoom.id, event.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-zinc-300 bg-white px-2 text-xs text-zinc-700"
                >
                  {floors.map((floor) => (
                    <option key={`${selectedRoom.id}-editor-floor-${floor.id}`} value={floor.id}>
                      {floor.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-[10px] text-zinc-500">
                  Width (m)
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    max="20"
                    value={roomMeasurementDraft.width}
                    onChange={(event) =>
                      setRoomMeasurementDraft((prev) => ({
                        ...prev,
                        width: event.target.value,
                      }))
                    }
                    onBlur={() => commitRoomMeasurementDraft(selectedRoom.id, "width")}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }
                    }}
                    className="mt-1 h-9 w-full rounded-lg border border-zinc-300 px-2 text-xs"
                  />
                </label>
                <label className="text-[10px] text-zinc-500">
                  Height (m)
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    max="20"
                    value={roomMeasurementDraft.height}
                    onChange={(event) =>
                      setRoomMeasurementDraft((prev) => ({
                        ...prev,
                        height: event.target.value,
                      }))
                    }
                    onBlur={() => commitRoomMeasurementDraft(selectedRoom.id, "height")}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }
                    }}
                    className="mt-1 h-9 w-full rounded-lg border border-zinc-300 px-2 text-xs"
                  />
                </label>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setFloorplanStep("draw")}
            className="mt-3 h-10 w-full rounded-lg bg-zinc-800 px-3 text-xs font-semibold text-zinc-100"
          >
            Continue to Draw
          </button>
        </div>
      </div>
      ) : null}

      {activeFlow === "floorplan" && floorplanStep === "draw" ? (
      <div className="px-4 pt-3">
        <div className="mx-auto w-full max-w-[23rem] md:max-w-4xl lg:max-w-5xl">
          <FloorplanCanvas
            layout={home.floorplanLayout || buildLayoutFromRooms(home.rooms, home.presetKey)}
            onLayoutChange={updateFloorplanLayout}
            availableRooms={home.rooms.map((room) => room.name)}
            onRoomFloorChange={updateRoomFloor}
          />
          <button
            type="button"
            onClick={() => setFloorplanStep("review")}
            className="mt-3 h-10 w-full rounded-lg bg-zinc-800 px-3 text-xs font-semibold text-zinc-100"
          >
            Continue to Review
          </button>
        </div>
      </div>
      ) : null}

      {activeFlow === "floorplan" && floorplanStep === "review" ? (
      <div className="flex-1 p-4">
        <div className="mx-auto w-full max-w-[23rem] md:max-w-4xl lg:max-w-5xl rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
          <FloorPlan
            rooms={home.rooms}
            breakers={home.breakers}
            fuseById={fuseById}
            floorNameById={floorNameById}
          />
        </div>
      </div>
      ) : null}

      {activeFlow === "fusebox" ? (
      <FuseBox
        fuses={home.fuses}
        rooms={home.rooms}
        floorNameById={floorNameById}
        breakers={home.breakers}
        toggleBreaker={toggleBreaker}
        updateFuseDetails={updateFuseDetails}
        circuitsByFuse={circuitsByFuse}
        affectedCircuits={affectedCircuits}
        affectedRooms={affectedRooms}
        addFuse={addFuse}
        removeFuse={removeFuse}
        newFuseRating={newFuseRating}
        setNewFuseRating={setNewFuseRating}
        updateRoomFuse={updateRoomFuse}
      />
      ) : null}

      {activeFlow === "gas" ? (
        <div className="flex-1 p-4">
          <div className="mx-auto w-full max-w-[23rem] md:max-w-4xl lg:max-w-5xl rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
              Gas Safety Flow
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Mark rooms that have gas points/appliances.
            </p>
            <div className="mt-2 space-y-2">
              {home.rooms.map((room) => (
                <button
                  key={`gas-${room.id}`}
                  type="button"
                  onClick={() => toggleGasCheck(room.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left ${
                    home.gasChecks?.[room.id]
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-zinc-200 bg-zinc-50"
                  }`}
                >
                  <p className="text-sm font-semibold text-zinc-700">{room.name}</p>
                  <p className="text-xs text-zinc-500">
                    {home.gasChecks?.[room.id] ? "Gas point recorded" : "No gas point set"}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {activeFlow === "fire" ? (
        <div className="flex-1 p-4">
          <div className="mx-auto w-full max-w-[23rem] md:max-w-4xl lg:max-w-5xl rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
              Fire Alarm Flow
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Mark where alarms are installed/checked.
            </p>
            <div className="mt-2 space-y-2">
              {home.rooms.map((room) => (
                <button
                  key={`fire-${room.id}`}
                  type="button"
                  onClick={() => toggleFireAlarmCheck(room.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left ${
                    home.fireAlarmChecks?.[room.id]
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-zinc-200 bg-zinc-50"
                  }`}
                >
                  <p className="text-sm font-semibold text-zinc-700">{room.name}</p>
                  <p className="text-xs text-zinc-500">
                    {home.fireAlarmChecks?.[room.id] ? "Alarm present/checked" : "Alarm not marked"}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {activeFlow === "inventory" ? (
        <div className="flex-1 p-4">
          <div className="mx-auto w-full max-w-[23rem] md:max-w-4xl lg:max-w-5xl">
            <InventoryFlow
              propertyId={home.id}
              propertyName={home.name}
              rooms={home.rooms}
              initialReport={home.inventoryReport}
              defaultBranding={pdfBranding}
              onAddRoom={addRoomToHome}
              onReportChange={(report) =>
                updateHome((prev) => ({
                  ...prev,
                  inventoryReport: report,
                }))
              }
            />
          </div>
        </div>
      ) : null}

      {activeFlow === "brochure" ? (
        <MarketingBrochureFlow
          home={home}
          brochure={marketingBrochure}
          floors={floors}
          branding={pdfBranding}
          heroImage={brochureHeroImage}
          floorplanPreviewImage={
            marketingBrochure.floorplanSource === "uploaded" ? marketingBrochure.floorplanImage : ""
          }
          logoImage={pdfBranding.logoDataUrl}
          selectedImages={selectedBrochureImages}
          inventoryMedia={inventoryBrochureMedia}
          onBrochureChange={updateMarketingBrochure}
          onHeroImageSelected={onBrochureHeroSelected}
          onRemoveHeroImage={() => updateMarketingBrochure({ heroImage: "" })}
          onFloorplanImageSelected={onBrochureFloorplanSelected}
          onRemoveFloorplanImage={() => updateMarketingBrochure({ floorplanImage: "", floorplanSource: "generated" })}
          onLogoImageSelected={onPdfLogoSelected}
          onRemoveLogoImage={() =>
            setPdfBranding((prev) => ({
              ...prev,
              logoDataUrl: null,
            }))
          }
          onGalleryImagesSelected={onBrochureGallerySelected}
          onRemoveGalleryImage={removeBrochureGalleryImage}
          onToggleInventoryMedia={toggleInventoryBrochureMedia}
          onExportBrochure={exportMarketingBrochurePdf}
        />
      ) : null}

      {exportModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/35 p-3">
          <div className="mx-auto w-full max-w-[23rem] md:max-w-4xl lg:max-w-5xl rounded-2xl border border-zinc-200 bg-white p-3 shadow-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-600">
              Export Report
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Select full report or choose specific sections.
            </p>

            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={() =>
                  setReportSections({
                    fusebox: true,
                    floorplan: true,
                    gas: true,
                    fire: true,
                    inventory: true,
                  })
                }
                className="h-9 w-full rounded-lg bg-zinc-200 text-xs font-semibold text-zinc-700"
              >
                Full Report (All Sections)
              </button>

              {[
                { key: "fusebox", label: "Fusebox" },
                { key: "floorplan", label: "Floorplan" },
                { key: "gas", label: "Gas" },
                { key: "fire", label: "Fire Alarms" },
                { key: "inventory", label: "Inventory" },
              ].map((section) => (
                <label
                  key={`section-${section.key}`}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2"
                >
                  <span className="text-sm text-zinc-700">{section.label}</span>
                  <input
                    type="checkbox"
                    checked={reportSections[section.key]}
                    onChange={(event) =>
                      setReportSections((prev) => ({
                        ...prev,
                        [section.key]: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 accent-zinc-800"
                  />
                </label>
              ))}
            </div>

            <div className="mt-3 rounded-lg border border-zinc-200 p-3">
              <p className="text-xs font-semibold text-zinc-700">PDF Branding</p>
              <div className="mt-2 space-y-2">
                <input
                  type="text"
                  value={pdfBranding.companyName}
                  onChange={(event) =>
                    setPdfBranding((prev) => ({
                      ...prev,
                      companyName: event.target.value,
                    }))
                  }
                  placeholder="Company name"
                  className="h-9 w-full rounded-lg border border-zinc-300 px-3 text-xs"
                />
                <div className="grid grid-cols-2 gap-2">
                  <label className="rounded-lg border border-zinc-200 px-2 py-1 text-[11px] text-zinc-600">
                    Primary
                    <input
                      type="color"
                      value={pdfBranding.primaryColor}
                      onChange={(event) =>
                        setPdfBranding((prev) => ({
                          ...prev,
                          primaryColor: event.target.value,
                        }))
                      }
                      className="mt-1 h-8 w-full cursor-pointer rounded border border-zinc-200"
                    />
                  </label>
                  <label className="rounded-lg border border-zinc-200 px-2 py-1 text-[11px] text-zinc-600">
                    Accent
                    <input
                      type="color"
                      value={pdfBranding.accentColor}
                      onChange={(event) =>
                        setPdfBranding((prev) => ({
                          ...prev,
                          accentColor: event.target.value,
                        }))
                      }
                      className="mt-1 h-8 w-full cursor-pointer rounded border border-zinc-200"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="h-9 rounded-lg bg-zinc-800 px-3 text-[11px] font-semibold text-white transition hover:bg-zinc-700 flex items-center cursor-pointer">
                    Upload Logo
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={onPdfLogoSelected}
                    />
                  </label>
                  {pdfBranding.logoDataUrl ? (
                    <button
                      type="button"
                      onClick={() =>
                        setPdfBranding((prev) => ({
                          ...prev,
                          logoDataUrl: null,
                        }))
                      }
                      className="h-9 rounded-lg bg-zinc-200 px-3 text-[11px] font-semibold text-zinc-700"
                    >
                      Remove Logo
                    </button>
                  ) : null}
                </div>
                {pdfBranding.logoDataUrl ? (
                  <img
                    src={pdfBranding.logoDataUrl}
                    alt="PDF logo preview"
                    className="h-12 w-auto rounded border border-zinc-200 bg-white p-1"
                  />
                ) : null}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setExportModalOpen(false)}
                className="h-9 rounded-lg bg-zinc-200 px-3 text-xs font-semibold text-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={exportReportPdf}
                disabled={!Object.values(reportSections).some(Boolean)}
                className="h-9 rounded-lg bg-zinc-800 px-3 text-xs font-semibold text-white disabled:opacity-40"
              >
                Generate PDF
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HomesIndex({
  homes,
  onOpenHome,
  onCreateHome,
  onSignOut,
  onRenameHome,
  userEmail,
}) {
  const [newHomeName, setNewHomeName] = useState("");
  const [presetKey, setPresetKey] = useState(HOME_PRESETS[0].key);

  const createHome = () => {
    const cleanName = newHomeName.trim();
    if (!cleanName) return;
    onCreateHome(cleanName, presetKey);
    setNewHomeName("");
  };

  return (
    <div className="min-h-screen bg-neutral-100 p-4">
      <div className="mx-auto w-full max-w-[23rem] md:max-w-4xl lg:max-w-5xl space-y-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-center">
            <div className="flex items-center gap-2 min-w-0">
              <img
                src={`${process.env.PUBLIC_URL}/digifusebox-logo.png`}
                alt="EasyProp logo"
                className="h-8 w-auto"
              />
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">Account</p>
              <p className="truncate text-[11px] font-medium text-zinc-700">{userEmail || "Unknown"}</p>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="h-8 shrink-0 rounded-lg bg-zinc-800 px-3 text-[11px] font-semibold text-white transition hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            >
              Sign out
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
            Create Home
          </p>
          <div className="mt-2 space-y-2">
            <input
              value={newHomeName}
              onChange={(event) => setNewHomeName(event.target.value)}
              placeholder="e.g. Mum's House"
              className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm text-zinc-700 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
            <select
              value={presetKey}
              onChange={(event) => setPresetKey(event.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-700 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            >
              {Array.from(new Set(HOME_PRESETS.map((preset) => preset.group))).map((group) => (
                <optgroup key={group} label={group}>
                  {HOME_PRESETS.filter((preset) => preset.group === group).map((preset) => (
                    <option key={preset.key} value={preset.key}>
                      {preset.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              type="button"
              onClick={createHome}
              className="h-10 w-full rounded-lg bg-zinc-800 px-3 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            >
              Create Home
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {homes.map((home) => (
            <div
              key={home.id}
              className="w-full rounded-2xl border border-zinc-200 bg-white p-3 text-left shadow-sm transition hover:border-zinc-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onOpenHome(home.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm font-semibold text-zinc-800">{home.name}</p>
                  <p className="text-xs text-zinc-500">
                    {home.rooms.length} rooms · {home.fuses.length} fuses
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => onRenameHome(home.id)}
                  className="h-7 rounded-lg bg-zinc-200 px-2.5 text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-300"
                >
                  Rename
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [homes, setHomes] = useState([]);
  const [activeHomeId, setActiveHomeId] = useState(null);
  const [renameHomeId, setRenameHomeId] = useState(null);
  const [renameHomeName, setRenameHomeName] = useState("");
  const userId = session?.user?.id || null;

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setHomes([]);
      setActiveHomeId(null);
      return;
    }

    const localState = loadSavedState(userId);
    setHomes(localState?.homes ?? []);
    setActiveHomeId(null);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const storageKey = getStorageKey(userId);
    const statePayload = {
      homes,
      activeHomeId,
    };

    try {
      localStorage.setItem(storageKey, JSON.stringify(statePayload));
    } catch {
      // If media payloads are too large for localStorage, keep structure and text data.
      const compactHomes = homes.map((home) => ({
        ...home,
        inventoryReport: home.inventoryReport
          ? {
              ...home.inventoryReport,
              rooms: (home.inventoryReport.rooms || []).map((room) => ({
                ...room,
                media: [],
              })),
            }
          : null,
      }));

      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            homes: compactHomes,
            activeHomeId,
          })
        );
      } catch {
        // no-op
      }
    }
  }, [userId, homes, activeHomeId]);

  useEffect(() => {
    if (activeHomeId && !homes.some((home) => home.id === activeHomeId)) {
      setActiveHomeId(null);
    }
  }, [homes, activeHomeId]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const createHome = (name, presetKey) => {
    const id = `home_${Date.now()}`;
    setHomes((prev) => [...prev, createBaseHome(id, name, presetKey)]);
  };

  const updateHome = (homeId, mutator) => {
    setHomes((prev) => prev.map((home) => (home.id === homeId ? mutator(home) : home)));
  };

  const deleteHome = (homeId) => {
    setHomes((prev) => prev.filter((home) => home.id !== homeId));
    setActiveHomeId(null);
  };

  const openRenameHome = (homeId) => {
    const target = homes.find((home) => home.id === homeId);
    if (!target) return;
    setRenameHomeId(homeId);
    setRenameHomeName(target.name);
  };

  const closeRenameHome = () => {
    setRenameHomeId(null);
    setRenameHomeName("");
  };

  const saveRenameHome = () => {
    if (!renameHomeId) return;
    const cleaned = renameHomeName.trim();
    if (!cleaned) return;

    setHomes((prev) =>
      prev.map((home) =>
        home.id === renameHomeId
          ? {
              ...home,
              name: cleaned,
            }
          : home
      )
    );

    closeRenameHome();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center">
        <p className="text-sm text-zinc-600">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  const activeHome = homes.find((home) => home.id === activeHomeId) || null;

  const content = !activeHome ? (
    <HomesIndex
      homes={homes}
      onOpenHome={setActiveHomeId}
      onCreateHome={createHome}
      onSignOut={handleSignOut}
      onRenameHome={openRenameHome}
      userEmail={session.user?.email}
    />
  ) : (
    <HomeScreen
      home={activeHome}
      onBack={() => setActiveHomeId(null)}
      userEmail={session.user?.email}
      onSignOut={handleSignOut}
      onUpdateHome={(mutator) => updateHome(activeHome.id, mutator)}
      onDeleteHome={deleteHome}
      onRenameHome={openRenameHome}
    />
  );

  return (
    <div>
      {content}
      {renameHomeId ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/35 p-3">
          <div className="mx-auto w-full max-w-[23rem] md:max-w-4xl lg:max-w-5xl rounded-2xl border border-zinc-200 bg-white p-3 shadow-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-600">
              Rename Home
            </p>
            <input
              value={renameHomeName}
              onChange={(event) => setRenameHomeName(event.target.value)}
              className="mt-2 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm text-zinc-800 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              placeholder="Home name"
              autoFocus
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeRenameHome}
                className="h-9 rounded-lg bg-zinc-200 px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveRenameHome}
                className="h-9 rounded-lg bg-zinc-800 px-3 text-xs font-semibold text-white transition hover:bg-zinc-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
