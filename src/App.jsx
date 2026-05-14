import { useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import FloorPlan from "./components/Floorplan.jsx";
import FuseBox from "./components/Fusebox.jsx";
import FloorplanCanvas from "./components/FloorplanCanvas.jsx";
import InventoryFlow from "./components/InventoryFlow.jsx";
import MarketingBrochureFlow from "./components/MarketingBrochureFlow.jsx";
import AuthScreen from "./components/AuthScreen.jsx";
import SubscriptionGate from "./components/SubscriptionGate.jsx";
import ColorHexField from "./components/ColorHexField.jsx";
import { appendInventoryPdf } from "./services/pdfGenerator.js";
import { supabase } from "./lib/supabaseClient";
import {
  createCheckoutSession,
  cancelSubscriptionAtPeriodEnd,
  createCustomerPortalSession,
} from "./services/billingService.js";
import {
  fetchSubscriptionRecord,
  getSubscriptionEndLabel,
  hasActiveSubscription,
  normalizeSubscriptionRecord,
} from "./services/subscriptionAccess.js";
import {
  applyConstraints,
  layoutToStructuredPlan,
  structuredPlanToLayout,
} from "./engine/constraints";

const STORAGE_KEY_PREFIX = "floorplan_qr_state_v3";
const FLOORPLAN_PIXELS_PER_METER = 40;
const FLOORPLAN_CANVAS_WIDTH = 420;
const FLOORPLAN_CANVAS_HEIGHT = 640;
const DEFAULT_WALL_THICKNESS_METERS = 0.2;
const PDF_THEME_PRESETS = {
  light: {
    label: "Light",
    primaryColor: "#1f2937",
    accentColor: "#15803d",
  },
  dark: {
    label: "Dark",
    primaryColor: "#0b1220",
    accentColor: "#38bdf8",
  },
};

function createDefaultPdfBranding() {
  return {
    companyName: "",
    primaryColor: "#1f2937",
    accentColor: "#15803d",
    logoDataUrl: null,
    headerLogoDataUrl: null,
    brandImageVariant: "logo",
    themePreset: "light",
  };
}

function normalizePdfBranding(value) {
  const defaults = createDefaultPdfBranding();
  return {
    ...defaults,
    ...(value || {}),
    companyName: String(value?.companyName || defaults.companyName),
    primaryColor: String(value?.primaryColor || defaults.primaryColor),
    accentColor: ensureReadableAccentHex(String(value?.accentColor || defaults.accentColor), "#15803d"),
    logoDataUrl: value?.logoDataUrl || null,
    headerLogoDataUrl: value?.headerLogoDataUrl || null,
    brandImageVariant: value?.brandImageVariant === "header" ? "header" : "logo",
    themePreset: value?.themePreset === "dark" ? "dark" : "light",
  };
}

function getPdfThemePresetValue(preset) {
  return PDF_THEME_PRESETS[preset] || PDF_THEME_PRESETS.light;
}

function getSelectedBrandImage(branding) {
  if (branding?.brandImageVariant === "header" && branding?.headerLogoDataUrl) {
    return {
      dataUrl: branding.headerLogoDataUrl,
      variant: "header",
    };
  }
  if (branding?.logoDataUrl) {
    return {
      dataUrl: branding.logoDataUrl,
      variant: "logo",
    };
  }
  if (branding?.headerLogoDataUrl) {
    return {
      dataUrl: branding.headerLogoDataUrl,
      variant: "header",
    };
  }
  return {
    dataUrl: null,
    variant: "logo",
  };
}

function normalizeWallThickness(value) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return DEFAULT_WALL_THICKNESS_METERS;
  return Math.min(1, Math.max(0.05, Number(parsed.toFixed(2))));
}

function createServiceCheckEntry(recorded = false) {
  return {
    recorded: Boolean(recorded),
    worksAt: null,
    testedAt: null,
    pointLocation: "",
    notes: "",
    photos: [],
  };
}

function normalizeServicePhotos(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((photo) => photo?.url || photo?.dataUrl)
    .map((photo, index) => ({
      id: photo?.id || `service_photo_${Date.now()}_${index}`,
      url: photo?.url || photo?.dataUrl,
      fileName: String(photo?.fileName || `Photo ${index + 1}`),
      uploadedAt:
        typeof photo?.uploadedAt === "string" && photo.uploadedAt
          ? photo.uploadedAt
          : new Date().toISOString(),
    }));
}

function normalizeServiceCheckEntry(value) {
  if (typeof value === "boolean") return createServiceCheckEntry(value);
  const photos = normalizeServicePhotos(value?.photos);
  return {
    recorded: Boolean(value?.recorded || value?.worksAt || value?.testedAt || photos.length),
    worksAt: typeof value?.worksAt === "string" && value.worksAt ? value.worksAt : null,
    testedAt: typeof value?.testedAt === "string" && value.testedAt ? value.testedAt : null,
    pointLocation: typeof value?.pointLocation === "string" ? value.pointLocation : "",
    notes: typeof value?.notes === "string" ? value.notes : "",
    photos,
  };
}

function normalizeFuseboxes(value, legacyPhoto = null) {
  const source = Array.isArray(value) ? value : [];
  const normalized = source
    .filter((fusebox) => fusebox?.photo || fusebox?.label || fusebox?.location || fusebox?.notes)
    .map((fusebox, index) => ({
      id: fusebox?.id || `fusebox_${Date.now()}_${index}`,
      label: String(fusebox?.label || `Fusebox ${index + 1}`),
      location: String(fusebox?.location || ""),
      notes: String(fusebox?.notes || ""),
      photo: fusebox?.photo || null,
    }));

  if (!normalized.length && legacyPhoto) {
    return [
      {
        id: "fusebox_legacy_main",
        label: "Main Fusebox",
        location: "",
        notes: "",
        photo: legacyPhoto,
      },
    ];
  }

  return normalized;
}

function buildServiceCheckMapFromRooms(rooms, defaultValue = false) {
  const map = {};
  rooms.forEach((room) => {
    map[room.id] = createServiceCheckEntry(defaultValue);
  });
  return map;
}

function formatRecordedTimestamp(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return date.toLocaleString();
}

async function compressImageFileToDataUrl(file, maxSize = 1280, quality = 0.78) {
  return new Promise((resolve, reject) => {
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
}

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

function ensureReadableAccentHex(hex, fallback = "#15803d") {
  const value = String(hex || "").trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) return fallback;
  const [r, g, b] = hexToRgb(value, [21, 128, 61]);
  const luminance = (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
  if (luminance <= 170) return value;
  return fallback;
}

function getImageFormat(dataUrl, fallback = "JPEG") {
  const value = String(dataUrl || "").toLowerCase();
  if (value.startsWith("data:image/png")) return "PNG";
  if (value.startsWith("data:image/webp")) return "WEBP";
  return fallback;
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

function blurOnDoneKey(event) {
  if (event.key === "Enter" || event.key === "Done" || event.key === "Go") {
    event.currentTarget.blur();
  }
}

function addCenteredPageNumbers(doc) {
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(113, 113, 122);
    doc.text(`Page ${page} of ${totalPages}`, 105, 289, { align: "center" });
  }
}

function mixRgb(baseRgb, targetRgb, ratio = 0.5) {
  return baseRgb.map((value, index) => (
    Math.round(value + ((targetRgb[index] - value) * ratio))
  ));
}

function withAlpha(rgb, alpha = 0.12, base = [255, 255, 255]) {
  return rgb.map((value, index) => (
    Math.round(base[index] + ((value - base[index]) * alpha))
  ));
}

function createPdfThemeTokens(primaryRgb, accentRgb, preset = "light") {
  const accentDarkRgb = mixRgb(accentRgb, [0, 0, 0], 0.28);
  const accentSoftRgb = withAlpha(accentRgb, preset === "dark" ? 0.22 : 0.18);

  if (preset === "dark") {
    return {
      preset,
      accentDarkRgb,
      accentSoftRgb,
      canvasRgb: [9, 14, 24],
      sectionBarRgb: [6, 11, 20],
      coverRgb: [5, 10, 18],
      cardRgb: [17, 24, 39],
      cardAltRgb: [24, 34, 54],
      cardMutedRgb: [12, 19, 32],
      borderRgb: [51, 65, 85],
      titleTextRgb: [241, 245, 249],
      bodyTextRgb: [203, 213, 225],
      coverBodyTextRgb: [203, 213, 225],
      mutedTextRgb: [148, 163, 184],
      inverseTextRgb: [255, 255, 255],
      footerTextRgb: [148, 163, 184],
      footerLineRgb: [71, 85, 105],
      coverOverlayRgb: [4, 10, 20],
      coverOverlayOpacity: 0.4,
      coverPanelRgb: [15, 23, 42],
      coverPanelOpacity: 0.82,
      statCardRgb: [21, 32, 50],
      metaCardRgb: [14, 22, 36],
      tableHeadTextRgb: [255, 255, 255],
      tableBodyFillRgb: [17, 24, 39],
      tableAltFillRgb: [24, 34, 54],
      floorplanGridRgb: [37, 49, 69],
      floorplanStrokeRgb: [100, 116, 139],
      floorplanPanelRgb: [15, 23, 42],
    };
  }

  return {
    preset,
    accentDarkRgb,
    accentSoftRgb,
    canvasRgb: [255, 248, 239],
    sectionBarRgb: accentDarkRgb,
    coverRgb: primaryRgb,
    cardRgb: [255, 252, 247],
    cardAltRgb: [247, 242, 232],
    cardMutedRgb: [250, 244, 235],
    borderRgb: [232, 223, 210],
    titleTextRgb: primaryRgb,
    bodyTextRgb: [70, 82, 98],
    coverBodyTextRgb: [236, 240, 244],
    mutedTextRgb: [94, 104, 118],
    inverseTextRgb: [255, 255, 255],
    footerTextRgb: [125, 112, 100],
    footerLineRgb: [234, 223, 208],
    coverOverlayRgb: [10, 18, 32],
    coverOverlayOpacity: 0.56,
    coverPanelRgb: [255, 255, 255],
    coverPanelOpacity: 0.78,
    statCardRgb: [255, 252, 247],
    metaCardRgb: [247, 242, 232],
    tableHeadTextRgb: [255, 255, 255],
    tableBodyFillRgb: [255, 252, 247],
    tableAltFillRgb: [249, 244, 237],
    floorplanGridRgb: [235, 228, 218],
    floorplanStrokeRgb: [215, 204, 192],
    floorplanPanelRgb: [255, 252, 247],
  };
}

function drawEditorialBackdrop(doc, theme, accentRgb, options = {}) {
  const topRight = options.topRight ?? { x: 184, y: 28, r: 30 };
  const bottomLeft = options.bottomLeft ?? { x: 28, y: 252, r: 22 };
  const glow = options.glow ?? { x: 40, y: 44, r: 36 };
  doc.setFillColor(...theme.canvasRgb);
  doc.rect(0, 0, 210, 297, "F");
  doc.setFillColor(...accentRgb);
  doc.setGState(new doc.GState({ opacity: 0.16 }));
  doc.circle(topRight.x, topRight.y, topRight.r, "F");
  doc.setFillColor(...theme.cardMutedRgb);
  doc.circle(bottomLeft.x, bottomLeft.y, bottomLeft.r, "F");
  doc.setFillColor(...theme.cardAltRgb);
  doc.circle(glow.x, glow.y, glow.r, "F");
  doc.setGState(new doc.GState({ opacity: 1 }));
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
    wallThicknessMeters: DEFAULT_WALL_THICKNESS_METERS,
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
    bedrooms: "",
    bathrooms: "",
    receptions: "",
    floors: "",
    roomListTitle: "Rooms within the house",
    viewingLink: "",
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
    accentColor: ensureReadableAccentHex(String(value?.accentColor || defaults.accentColor), "#15803d"),
    bedrooms: value?.bedrooms ?? defaults.bedrooms,
    bathrooms: value?.bathrooms ?? defaults.bathrooms,
    receptions: value?.receptions ?? defaults.receptions,
    floors: value?.floors ?? defaults.floors,
    roomListTitle: String(value?.roomListTitle || defaults.roomListTitle),
    viewingLink: String(value?.viewingLink || defaults.viewingLink),
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

function ContactFooter() {
  return (
    <footer className="px-4 py-4">
      <div className="mx-auto w-full max-w-[23rem] text-center text-[11px] text-zinc-500 md:max-w-4xl lg:max-w-5xl">
        Contact us:{" "}
        <a
          href="mailto:sales@inventorypro.uk"
          className="font-semibold text-zinc-700 underline-offset-2 transition hover:text-zinc-900 hover:underline"
        >
          sales@inventorypro.uk
        </a>
      </div>
    </footer>
  );
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
      wallThicknessMeters: normalizeWallThickness(layout.wallThicknessMeters),
      floors,
      activeFloorId,
    };
  }

  if (layout && (Array.isArray(layout.rooms) || Array.isArray(layout.doors))) {
    return {
      wallThicknessMeters: DEFAULT_WALL_THICKNESS_METERS,
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
    fuseboxes: [],
    gasChecks: buildServiceCheckMapFromRooms(rooms, false),
    fireAlarmChecks: buildServiceCheckMapFromRooms(rooms, false),
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
  subscription,
  onSignOut,
  onUpdateHome,
  onDeleteHome,
  onRenameHome,
  pdfBranding,
  onPdfBrandingChange,
  onPdfLogoSelected,
  onPdfHeaderLogoSelected,
  onRemovePdfLogo,
  onRemovePdfHeaderLogo,
  canExportPdf,
  onRequireSubscription,
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
  const [floorplanStep, setFloorplanStep] = useState("preset");
  const [reportSections, setReportSections] = useState({
    fusebox: true,
    floorplan: true,
    gas: true,
    fire: true,
    inventory: true,
    brochure: true,
  });
  const floorplanStepOrder = ["preset", "rooms", "draw", "review"];
  const previousHomeIdRef = useRef(home.id);
  const applyThemePreset = (preset) => {
    const theme = getPdfThemePresetValue(preset);
    onPdfBrandingChange((prev) => ({
      ...prev,
      themePreset: preset,
      primaryColor: theme.primaryColor,
      accentColor: theme.accentColor,
    }));
  };

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
  }, [home.id, home.presetKey]);

  useEffect(() => {
    setTargetFuseCount(String(Math.max(home.fuses.length, 1)));
  }, [home.fuses.length]);

  useEffect(() => {
    if (activeFlow !== "floorplan") return;
    setFloorplanStep("preset");
  }, [activeFlow]);

  useEffect(() => {
    if (!exportModalOpen) return;

    const bodyOverflow = document.body.style.overflow;
    const htmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = htmlOverflow;
    };
  }, [exportModalOpen]);

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
  const fuseboxes = useMemo(
    () => normalizeFuseboxes(home.fuseboxes, home.fuseboxPhoto),
    [home.fuseboxes, home.fuseboxPhoto]
  );
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
  const subscriptionEndLabel = getSubscriptionEndLabel(subscription);
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

    const normalizeServiceMap = (map) => {
      const normalized = {};
      normalizedRooms.forEach((room) => {
        normalized[room.id] = normalizeServiceCheckEntry(map?.[room.id]);
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
      gasChecks: normalizeServiceMap(nextHome.gasChecks),
      fireAlarmChecks: normalizeServiceMap(nextHome.fireAlarmChecks),
      fuseboxes: normalizeFuseboxes(nextHome.fuseboxes, nextHome.fuseboxPhoto),
      fuseboxPhoto: null,
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
          [roomId]: createServiceCheckEntry(false),
        },
        fireAlarmChecks: {
          ...prev.fireAlarmChecks,
          [roomId]: createServiceCheckEntry(false),
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

  const toggleServiceCheck = (field, roomId, timestampKey) => {
    updateHome((prev) => ({
      ...prev,
      [field]: {
        ...prev[field],
        [roomId]: (() => {
          const existing = normalizeServiceCheckEntry(prev[field]?.[roomId]);
          return {
            ...existing,
            recorded: true,
            [timestampKey]: existing[timestampKey] ? null : new Date().toISOString(),
          };
        })(),
      },
    }));
  };

  const toggleGasCheck = (roomId, timestampKey) => toggleServiceCheck("gasChecks", roomId, timestampKey);

  const toggleFireAlarmCheck = (roomId, timestampKey) =>
    toggleServiceCheck("fireAlarmChecks", roomId, timestampKey);

  const updateServiceCheckDetails = (field, roomId, patch) => {
    updateHome((prev) => ({
      ...prev,
      [field]: {
        ...prev[field],
        [roomId]: {
          ...normalizeServiceCheckEntry(prev[field]?.[roomId]),
          ...patch,
        },
      },
    }));
  };

  const onServicePhotoSelected = async (field, roomId, event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    try {
      const uploadedPhotos = await Promise.all(
        files.map(async (file, index) => ({
          id: `service_photo_${Date.now()}_${index}`,
          url: await compressImageFileToDataUrl(file),
          fileName: file.name || `Photo ${index + 1}`,
          uploadedAt: new Date().toISOString(),
        }))
      );

      updateHome((prev) => {
        const existing = normalizeServiceCheckEntry(prev[field]?.[roomId]);
        return {
          ...prev,
          [field]: {
            ...prev[field],
            [roomId]: {
              ...existing,
              recorded: true,
              photos: [...existing.photos, ...uploadedPhotos],
            },
          },
        };
      });
    } catch {
      // no-op; keep flow simple for now
    } finally {
      event.target.value = "";
    }
  };

  const removeServicePhoto = (field, roomId, photoId) => {
    updateHome((prev) => {
      const existing = normalizeServiceCheckEntry(prev[field]?.[roomId]);
      return {
        ...prev,
        [field]: {
          ...prev[field],
          [roomId]: {
            ...existing,
            photos: existing.photos.filter((photo) => photo.id !== photoId),
          },
        },
      };
    });
  };

  const regenerateRoomsFromPreset = () => {
    const nextPreset = getPresetByKey(generatorPresetKey);
    const nextRooms = buildRoomsFromPreset(nextPreset.key);

    updateHome((prev) => ({
      ...prev,
      presetKey: nextPreset.key,
      rooms: nextRooms,
      gasChecks: buildServiceCheckMapFromRooms(nextRooms, false),
      fireAlarmChecks: buildServiceCheckMapFromRooms(nextRooms, false),
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
        if (nextGasChecks[room.id] === undefined) nextGasChecks[room.id] = createServiceCheckEntry(false);
        else nextGasChecks[room.id] = normalizeServiceCheckEntry(nextGasChecks[room.id]);
        if (nextFireChecks[room.id] === undefined) nextFireChecks[room.id] = createServiceCheckEntry(false);
        else nextFireChecks[room.id] = normalizeServiceCheckEntry(nextFireChecks[room.id]);
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

  const onFuseboxPhotoSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      const existingFuseboxes = normalizeFuseboxes(home.fuseboxes, home.fuseboxPhoto);
      updateHome((prev) => ({
        ...prev,
        fuseboxes: [
          ...normalizeFuseboxes(prev.fuseboxes, prev.fuseboxPhoto),
          {
            id: `fusebox_${Date.now()}`,
            label: `Fusebox ${existingFuseboxes.length + 1}`,
            location: "",
            notes: "",
            photo: dataUrl,
          },
        ],
        fuseboxPhoto: null,
      }));
    } catch {
      // no-op; keep flow simple for now
    } finally {
      event.target.value = "";
    }
  };

  const updateFuseboxRecord = (fuseboxId, patch) => {
    updateHome((prev) => ({
      ...prev,
      fuseboxes: normalizeFuseboxes(prev.fuseboxes, prev.fuseboxPhoto).map((fusebox) =>
        fusebox.id === fuseboxId
          ? {
              ...fusebox,
              ...patch,
            }
          : fusebox
      ),
      fuseboxPhoto: null,
    }));
  };

  const removeFuseboxRecord = (fuseboxId) => {
    updateHome((prev) => ({
      ...prev,
      fuseboxes: normalizeFuseboxes(prev.fuseboxes, prev.fuseboxPhoto).filter((fusebox) => fusebox.id !== fuseboxId),
      fuseboxPhoto: null,
    }));
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

  const appendMarketingBrochurePdf = (doc, options = {}) => {
    const brochure = normalizeMarketingBrochure(home.marketingBrochure, home.name);
    const safeHomeName = (home.name || "Home").replace(/[^\w\s-]/g, "").trim() || "home";
    const primaryRgb = hexToRgb(pdfBranding.primaryColor, [31, 41, 55]);
    const safeBrochureAccent = ensureReadableAccentHex(brochure.accentColor, "#15803d");
    const accentRgb = hexToRgb(safeBrochureAccent, [21, 128, 61]);
    const theme = createPdfThemeTokens(primaryRgb, accentRgb, pdfBranding.themePreset);
    const { accentSoftRgb, accentDarkRgb } = theme;
    const heroImage = brochureHeroImage;
    const brochureLayout = normalizeFloorplanLayout(home.floorplanLayout, home.rooms);
    const brochureGalleryImages = [
      ...(brochure.galleryImages || []).map((image) => ({
        id: image.id,
        url: image.url,
        label: image.caption || "Uploaded image",
        type: "photo",
      })),
      ...inventoryBrochureMedia
        .filter((media) => (brochure.selectedInventoryMediaIds || []).includes(media.id))
        .map((media) => ({
          id: media.id,
          url: media.url,
          label: media.roomName,
          type: media.type || "photo",
        })),
    ];
    const featureLines = String(brochure.keyFeaturesText || "")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    const roomRows = home.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      floor: floorNameById[room.floorId] || getDefaultFloorNameById(room.floorId || "floor_1"),
      size: `${room.widthMeters || 4}m x ${room.heightMeters || 3}m`,
      floorId: room.floorId || "floor_1",
    })).sort((left, right) => {
      if (left.floorId === right.floorId) return left.name.localeCompare(right.name);
      return left.floorId.localeCompare(right.floorId);
    });
    const summaryText =
      brochure.summary ||
      "Create a brochure summary from the floorplan, room layout, and photography stored against this home.";
    const locationTitle = brochure.addressLine || home.name;
    const heroTitle = brochure.headline || brochure.propertyType || home.name;
    const statCards = [
      { label: "Bedrooms", value: String(brochure.bedrooms || marketingStats.bedrooms || 0) },
      { label: "Bathrooms", value: String(brochure.bathrooms || marketingStats.bathrooms || 0) },
      { label: "Reception", value: String(brochure.receptions || marketingStats.receptions || 0) },
    ];
    const metaCards = [
      { label: "Tenure", value: brochure.tenure },
      { label: "Council Tax", value: brochure.councilTaxBand },
      { label: "EPC Rating", value: brochure.epcRating ? `EPC ${brochure.epcRating}` : "" },
      { label: "Floors", value: brochure.floors || (marketingStats.floors ? String(marketingStats.floors) : "") },
    ].filter((item) => item.value);
    const roomsByFloor = roomRows.reduce((groups, room) => {
      const key = room.floor;
      if (!groups[key]) groups[key] = [];
      groups[key].push(room);
      return groups;
    }, {});
    const brandImage = pdfBranding.headerLogoDataUrl
      ? { dataUrl: pdfBranding.headerLogoDataUrl, variant: "header" }
      : getSelectedBrandImage(pdfBranding);
    const drawLogo = (x, y, width, height) => {
      if (!brandImage.dataUrl) return false;
      try {
        addContainedImage(doc, brandImage.dataUrl, x, y, width, height, "PNG", brandImage.variant === "header" ? "center" : "left");
        return true;
      } catch {
        return false;
      }
    };
    const drawSectionHeader = (title, subtitle = "") => {
      drawEditorialBackdrop(doc, theme, accentRgb);
      doc.setFillColor(...theme.sectionBarRgb);
      doc.rect(0, 0, 210, 16, "F");
      if (brandImage.variant === "header") {
        drawLogo(54, 2.5, 102, 11);
      } else {
        drawLogo(14, 5, 18, 8);
      }
      doc.setTextColor(...theme.inverseTextRgb);
      doc.setFontSize(14);
      doc.text(title, 14, 10.5);
      if (subtitle) {
        doc.setFontSize(8.5);
        doc.text(subtitle, 196, 10.5, { align: "right" });
      }
    };
    const drawFooter = () => {
      doc.setDrawColor(...theme.footerLineRgb);
      doc.setLineWidth(0.35);
      doc.line(14, 284, 196, 284);
      doc.setTextColor(...theme.footerTextRgb);
      doc.setFontSize(8);
      doc.text(`${brochure.branchName || pdfBranding.companyName || "Property brochure"} · Generated ${new Date().toLocaleString()}`, 14, 289);
      if (brandImage.dataUrl) {
        if (brandImage.variant === "header") {
          drawLogo(148, 283.5, 48, 8);
        } else {
          drawLogo(174, 285, 22, 8);
        }
      }
    };
    const drawGeneratedBrochureFloorplanPage = (floor) => {
      const margin = 14;
      const drawX = margin;
      const drawY = 44;
      const drawWidth = 182;
      const drawHeight = 208;
      const allItems = [
        ...(floor.rooms || []),
        ...(floor.doors || []),
        ...(floor.windows || []),
        ...(floor.spaces || []),
        ...(floor.stairs || []),
      ];
      const maxX = Math.max(FLOORPLAN_CANVAS_WIDTH, ...allItems.map((item) => (item.x || 0) + (item.w || 0)));
      const maxY = Math.max(FLOORPLAN_CANVAS_HEIGHT, ...allItems.map((item) => (item.y || 0) + (item.h || 0)));
      const scale = Math.min(drawWidth / maxX, drawHeight / maxY);
      const offsetX = drawX + (drawWidth - maxX * scale) / 2;
      const offsetY = drawY + (drawHeight - maxY * scale) / 2;
      const sx = (value) => offsetX + value * scale;
      const sy = (value) => offsetY + value * scale;
      const sw = (value) => value * scale;
      const sh = (value) => value * scale;

      doc.addPage();
      drawSectionHeader("Floorplan", floor.name);
      doc.setFillColor(...theme.floorplanPanelRgb);
      doc.roundedRect(14, 28, 182, 236, 8, 8, "F");
      doc.setTextColor(...theme.titleTextRgb);
      doc.setFontSize(18);
      doc.text("Floorplan", 105, 40, { align: "center" });
      doc.setDrawColor(...theme.footerLineRgb);
      doc.setLineWidth(0.4);
      doc.line(84, 44, 126, 44);
      doc.setDrawColor(...theme.floorplanStrokeRgb);
      doc.setLineWidth(0.3);
      doc.rect(drawX, drawY, drawWidth, drawHeight);

      doc.setDrawColor(...theme.floorplanGridRgb);
      doc.setLineWidth(0.2);
      for (let gx = 0; gx <= maxX; gx += 40) {
        doc.line(sx(gx), drawY, sx(gx), drawY + drawHeight);
      }
      for (let gy = 0; gy <= maxY; gy += 40) {
        doc.line(drawX, sy(gy), drawX + drawWidth, sy(gy));
      }

      (floor.rooms || []).forEach((room) => {
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(...primaryRgb);
        doc.setLineWidth(0.8);
        doc.rect(sx(room.x), sy(room.y), sw(room.w), sh(room.h), "FD");
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
        doc.setLineWidth(0.8);
        doc.rect(sx(windowItem.x), sy(windowItem.y), sw(windowItem.w), sh(windowItem.h));
      });

      (floor.doors || []).forEach((door) => {
        doc.setDrawColor(...primaryRgb);
        doc.setLineWidth(0.75);
        doc.line(sx(door.x), sy((door.y || 0) + (door.h || 0)), sx((door.x || 0) + (door.w || 0)), sy((door.y || 0) + (door.h || 0)));
      });

      (floor.spaces || []).forEach((space) => {
        doc.setDrawColor(120, 120, 120);
        doc.setLineWidth(0.35);
        doc.rect(sx(space.x), sy(space.y), sw(space.w), sh(space.h));
        doc.setTextColor(80, 80, 80);
        doc.setFontSize(6.8);
        doc.text(String(space.label || "Item"), sx(space.x) + 1.5, sy(space.y) + Math.min(4, sh(space.h) - 1), {
          maxWidth: Math.max(8, sw(space.w) - 3),
        });
      });

      (floor.stairs || []).forEach((stairsItem) => {
        const x = sx(stairsItem.x);
        const y = sy(stairsItem.y);
        const w = Math.max(10, sw(stairsItem.w));
        const h = Math.max(10, sh(stairsItem.h));
        const isDown = String(stairsItem.direction || "").toLowerCase() === "down";
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(20, 20, 20);
        doc.setLineWidth(0.6);
        doc.rect(x, y, w, h, "FD");
        doc.setDrawColor(82, 82, 91);
        doc.setLineWidth(0.35);
        const treadCount = Math.max(4, Math.min(11, Math.floor(w / 4)));
        for (let i = 1; i < treadCount; i += 1) {
          const treadX = x + (w * i) / treadCount;
          doc.line(treadX, y, treadX, y + h);
        }
        doc.setDrawColor(20, 20, 20);
        doc.setLineWidth(0.55);
        const arrowY = y + h / 2;
        const arrowStartX = x + w * (isDown ? 0.82 : 0.18);
        const arrowEndX = x + w * (isDown ? 0.18 : 0.82);
        const headBackX = x + w * (isDown ? 0.28 : 0.72);
        doc.line(arrowStartX, arrowY, arrowEndX, arrowY);
        doc.line(arrowEndX, arrowY, headBackX, arrowY - h * 0.12);
        doc.line(arrowEndX, arrowY, headBackX, arrowY + h * 0.12);
        doc.setTextColor(20, 20, 20);
        doc.setFontSize(6.4);
        doc.text(isDown ? "DN" : "UP", x + w * (isDown ? 0.68 : 0.12), y + h * 0.38);
      });
      drawFooter();
    };
    doc.setFillColor(...theme.canvasRgb);
    doc.rect(0, 0, 210, 297, "F");
    if (heroImage) {
      try {
        addContainedImage(doc, heroImage, 0, 0, 210, 297);
      } catch {
        doc.setFillColor(...accentDarkRgb);
        doc.rect(0, 0, 210, 297, "F");
      }
    } else {
      doc.setFillColor(...accentDarkRgb);
      doc.rect(0, 0, 210, 297, "F");
      doc.setFillColor(...accentRgb);
      doc.circle(182, 38, 34, "F");
      doc.setFillColor(...accentSoftRgb);
      doc.circle(28, 54, 20, "F");
    }
    doc.setFillColor(...theme.coverOverlayRgb);
    doc.setGState(new doc.GState({ opacity: theme.coverOverlayOpacity }));
    doc.rect(0, 0, 210, 297, "F");
    doc.setGState(new doc.GState({ opacity: 1 }));

    const hasCoverLogo = brandImage.variant === "header"
      ? drawLogo(14, 14, 126, 22)
      : drawLogo(14, 14, 34, 18);
    doc.setTextColor(...theme.inverseTextRgb);
    doc.setFontSize(10);
    doc.text(brochure.propertyType || "Premium Listing", brandImage.variant === "header" ? 14 : (hasCoverLogo ? 52 : 14), brandImage.variant === "header" ? 42 : 22);

    doc.setFillColor(...accentRgb);
    doc.roundedRect(142, 18, 54, 24, 8, 8, "F");
    doc.setTextColor(...theme.inverseTextRgb);
    doc.setFontSize(8);
    doc.text("Guide Price", 148, 27);
    doc.setFontSize(16);
    doc.text(brochure.askingPrice || "Price on application", 148, 36, { maxWidth: 42 });

    doc.setFillColor(...theme.coverPanelRgb);
    doc.setGState(new doc.GState({ opacity: theme.coverPanelOpacity }));
    doc.roundedRect(14, 224, 136, 44, 10, 10, "F");
    doc.setGState(new doc.GState({ opacity: 1 }));
    doc.setTextColor(...theme.titleTextRgb);
    doc.setFontSize(9);
    doc.text("BROCHURE FEATURED PROPERTY", 18, 235);
    doc.setFontSize(26);
    doc.text(heroTitle, 18, 247, { maxWidth: 90, lineHeightFactor: 0.95 });
    doc.setFontSize(11);
    doc.setTextColor(...theme.bodyTextRgb);
    doc.text(locationTitle, 18, 256, { maxWidth: 86 });
    statCards.forEach((stat, index) => {
      const x = 152;
      const y = 224 + index * 15;
      doc.setFillColor(...theme.coverPanelRgb);
      doc.setGState(new doc.GState({ opacity: 0.84 }));
      doc.roundedRect(x, y, 44, 13, 5, 5, "F");
      doc.setGState(new doc.GState({ opacity: 1 }));
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.2);
      doc.roundedRect(x, y, 44, 13, 5, 5, "S");
      doc.setTextColor(...theme.titleTextRgb);
      doc.setFontSize(7.5);
      doc.text(`${stat.value} ${stat.label}`, x + 22, y + 8.2, { align: "center", maxWidth: 38 });
    });

    doc.addPage();
    drawSectionHeader("Overview", brochure.propertyType || "Marketing brochure");
    doc.setFillColor(...theme.cardRgb);
    doc.roundedRect(14, 24, 182, 116, 10, 10, "F");
    doc.setTextColor(...theme.titleTextRgb);
    doc.setFontSize(22);
    doc.text("Property overview", 18, 40);
    doc.setDrawColor(...accentRgb);
    doc.setLineWidth(1.2);
    doc.line(18, 45, 52, 45);
    doc.setTextColor(...theme.bodyTextRgb);
    doc.setFontSize(10.5);
    doc.text(summaryText, 18, 56, { maxWidth: 86, lineHeightFactor: 1.65 });
    const topHighlights = featureLines.slice(0, 4);
    let highlightY = 92;
    topHighlights.forEach((feature) => {
      doc.setFillColor(...accentSoftRgb);
      doc.roundedRect(18, highlightY - 5, 74, 10, 4, 4, "F");
      doc.setTextColor(...theme.titleTextRgb);
      doc.setFontSize(7.4);
      doc.text(feature, 21, highlightY + 1, { maxWidth: 68 });
      highlightY += 13;
    });

    [
      { ...statCards[0], x: 112, y: 52 },
      { ...statCards[1], x: 152, y: 52 },
      { ...statCards[2], x: 132, y: 82 },
    ].forEach((stat) => {
      const { x, y } = stat;
      doc.setFillColor(...accentSoftRgb);
      doc.roundedRect(x, y, 36, 22, 6, 6, "F");
      doc.setTextColor(...theme.accentDarkRgb);
      doc.setFontSize(14);
      doc.text(stat.value, x + 18, y + 9.5, { align: "center" });
      doc.setFontSize(6.5);
      doc.text(stat.label, x + 18, y + 15.5, { align: "center", maxWidth: 28 });
    });

    let metaY = 110;
    metaCards.forEach((item, index) => {
      const x = 112 + (index % 2) * 40;
      const y = metaY + Math.floor(index / 2) * 20;
      doc.setFillColor(...theme.metaCardRgb);
      doc.roundedRect(x, y, 36, 16, 4, 4, "F");
      doc.setTextColor(...theme.mutedTextRgb);
      doc.setFontSize(6.5);
      doc.text(item.label, x + 2.5, y + 5);
      doc.setTextColor(...theme.titleTextRgb);
      doc.setFontSize(8);
      doc.text(item.value, x + 2.5, y + 11, { maxWidth: 31 });
    });

    doc.setFillColor(...theme.cardRgb);
    doc.roundedRect(14, 148, 182, 128, 10, 10, "F");
    doc.setTextColor(...theme.titleTextRgb);
    doc.setFontSize(15);
    doc.text(brochure.roomListTitle || "Rooms within the house", 18, 158);
    const floorGroups = Object.entries(roomsByFloor);
    const splitIndex = Math.ceil(floorGroups.length / 2);
    const roomColumns = [
      floorGroups.slice(0, splitIndex),
      floorGroups.slice(splitIndex),
    ];
    roomColumns.forEach((groupColumn, columnIndex) => {
      const baseX = columnIndex === 0 ? 18 : 108;
      let y = 172;
      groupColumn.forEach(([floorName, floorRooms]) => {
        doc.setTextColor(...theme.accentDarkRgb);
        doc.setFontSize(7.5);
        doc.text(floorName, baseX, y);
        y += 8;
        floorRooms.forEach((room) => {
          doc.setDrawColor(...theme.borderRgb);
          doc.line(baseX, y + 2, baseX + 80, y + 2);
          doc.setTextColor(...theme.titleTextRgb);
          doc.setFontSize(8.7);
          doc.text(room.name, baseX, y - 1);
          doc.setTextColor(...theme.mutedTextRgb);
          doc.setFontSize(7.2);
          doc.text(room.size, baseX + 80, y - 1, { align: "right" });
          y += 10;
        });
        y += 4;
      });
    });
    drawFooter();

    if (brochureGalleryImages.length) {
      let galleryIndex = 0;
      while (galleryIndex < brochureGalleryImages.length) {
        doc.addPage();
        drawSectionHeader("Gallery", "Property photography");
        doc.setFillColor(...theme.cardRgb);
        doc.roundedRect(14, 24, 182, 252, 10, 10, "F");

        const pageImages = brochureGalleryImages.slice(galleryIndex, galleryIndex + 4);
        pageImages.forEach((image, index) => {
          const column = index % 2;
          const row = Math.floor(index / 2);
          const x = 20 + column * 86;
          const y = 32 + row * 108;
          try {
            addContainedImage(doc, image.url, x, y, 78, 82);
          } catch {
            doc.setFillColor(235, 235, 235);
            doc.roundedRect(x, y, 78, 82, 6, 6, "F");
          }
          doc.setFillColor(10, 18, 32);
          doc.setGState(new doc.GState({ opacity: 0.28 }));
          doc.roundedRect(x, y + 56, 78, 26, 0, 0, "F");
          doc.setGState(new doc.GState({ opacity: 1 }));
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(10);
          doc.text(image.label || "Property image", x + 4, y + 67, { maxWidth: 54 });
          doc.setFontSize(7);
          doc.setTextColor(226, 232, 240);
          doc.text(image.type === "pano" ? "Panorama image" : "Photography", x + 4, y + 74);
        });

        galleryIndex += 4;
        drawFooter();
      }
    }

    if (brochure.floorplanSource === "uploaded" && brochure.floorplanImage) {
      doc.addPage();
      drawSectionHeader("Floorplan", "Uploaded image");
      doc.setFillColor(...theme.cardRgb);
      doc.roundedRect(14, 24, 182, 252, 10, 10, "F");
      doc.setTextColor(...theme.titleTextRgb);
      doc.setFontSize(18);
      doc.text("Floorplan", 105, 40, { align: "center" });
      try {
        addContainedImage(doc, brochure.floorplanImage, 20, 50, 170, 210);
      } catch {
        doc.setTextColor(120, 120, 120);
        doc.setFontSize(12);
        doc.text("Uploaded floorplan could not be rendered.", 50, 148);
      }
      drawFooter();
    } else {
      brochureLayout.floors.forEach((floor) => {
        drawGeneratedBrochureFloorplanPage(floor);
      });
    }

    doc.addPage();
    doc.setFillColor(...theme.coverRgb);
    doc.rect(0, 0, 210, 297, "F");
    doc.setFillColor(...accentRgb);
    doc.circle(170, 38, 42, "F");
    doc.setFillColor(...accentSoftRgb);
    doc.circle(34, 246, 28, "F");
    doc.setFillColor(...theme.inverseTextRgb);
    doc.setGState(new doc.GState({ opacity: 0.1 }));
    doc.roundedRect(14, 22, 182, 252, 18, 18, "F");
    doc.setGState(new doc.GState({ opacity: 1 }));
    if (brandImage.dataUrl) {
      if (brandImage.variant === "header") {
        drawLogo(28, 34, 154, 28);
      } else {
        drawLogo(20, 30, 48, 20);
      }
    }
    doc.setTextColor(...theme.inverseTextRgb);
    doc.setFontSize(11);
    doc.text("Arrange A Viewing", 20, 88);
    doc.setFontSize(34);
    doc.text("Book a Viewing", 20, 110);
    doc.setFontSize(12);
    doc.setTextColor(...theme.bodyTextRgb);
    doc.text(
      `Speak with ${brochure.branchName || pdfBranding.companyName || "the sales team"} to arrange a viewing and discuss the home in more detail.`,
      20,
      126,
      { maxWidth: 96, lineHeightFactor: 1.6 }
    );
    doc.setFillColor(...theme.inverseTextRgb);
    doc.roundedRect(20, 152, 72, 18, 9, 9, "F");
    doc.setTextColor(...theme.accentDarkRgb);
    doc.setFontSize(11);
    doc.text("Book a Viewing", 56, 163, { align: "center" });
    if (brochure.viewingLink) {
      doc.link(20, 152, 72, 18, { url: brochure.viewingLink });
    }

    doc.setFillColor(...theme.coverPanelRgb);
    doc.setGState(new doc.GState({ opacity: 0.12 }));
    doc.roundedRect(114, 84, 74, 126, 14, 14, "F");
    doc.setGState(new doc.GState({ opacity: 1 }));
    doc.setTextColor(...theme.inverseTextRgb);
    doc.setFontSize(10);
    doc.text(brochure.branchName || pdfBranding.companyName || "Branch details", 122, 106, { maxWidth: 58 });
    [
      brochure.agentName || "Add agent name",
      brochure.agentPhone || "Add phone number",
      brochure.agentEmail || "Add email address",
      brochure.viewingLink || "Add viewing link",
      locationTitle,
    ].forEach((line, index) => {
      doc.setFontSize(index === 0 ? 12 : 10);
      doc.text(line, 122, 126 + index * 15, { maxWidth: 58 });
    });
    drawFooter();

    if (options.applyPageNumbers !== false) {
      addCenteredPageNumbers(doc);
    }
    if (options.save !== false) {
      doc.save(`${safeHomeName.toLowerCase().replace(/\s+/g, "_")}_marketing_brochure.pdf`);
    }
  };

  const exportMarketingBrochurePdf = () => {
    if (!canExportPdf) {
      onRequireSubscription?.();
      return;
    }
    const doc = new jsPDF();
    appendMarketingBrochurePdf(doc, { save: true, applyPageNumbers: true });
  };

  const exportReportPdf = () => {
    if (!canExportPdf) {
      onRequireSubscription?.();
      return;
    }
    const selectedKeys = Object.entries(reportSections)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key);
    if (!selectedKeys.length) return;

    const doc = new jsPDF();
    const generatedAt = new Date().toLocaleString();
    const safeHomeName = (home.name || "Home").replace(/[^\w\s-]/g, "").trim() || "home";
    const primaryRgb = hexToRgb(pdfBranding.primaryColor, [31, 41, 55]);
    const accentRgb = hexToRgb(ensureReadableAccentHex(pdfBranding.accentColor, "#15803d"), [21, 128, 61]);
    const theme = createPdfThemeTokens(primaryRgb, accentRgb, pdfBranding.themePreset);
    const { accentSoftRgb } = theme;
    const brandImage = getSelectedBrandImage(pdfBranding);
    const companyName = pdfBranding.companyName.trim();
    const isHeaderBanner = brandImage.dataUrl && brandImage.variant === "header";
    const sectionStartPages = {};
    let currentY = 24;

    const getSectionLabel = (key) => {
      if (key === "fusebox") return "Fusebox";
      if (key === "floorplan") return "Floorplan";
      if (key === "gas") return "Gas";
      if (key === "fire") return "Fire";
      if (key === "inventory") return "Inventory";
      if (key === "brochure") return "Brochure";
      return key;
    };

    const drawBrandImage = (x, y, width, height, align = "left") => {
      if (!brandImage.dataUrl) return false;
      try {
        addContainedImage(doc, brandImage.dataUrl, x, y, width, height, "PNG", align);
        return true;
      } catch {
        return false;
      }
    };

    const drawReportCover = () => {
      doc.setFillColor(...theme.coverRgb);
      doc.rect(0, 0, 210, 297, "F");
      doc.setFillColor(accentRgb[0], accentRgb[1], accentRgb[2]);
      doc.circle(178, 38, 38, "F");
      doc.setFillColor(accentSoftRgb[0], accentSoftRgb[1], accentSoftRgb[2]);
      doc.circle(30, 252, 28, "F");
      doc.setFillColor(...theme.coverPanelRgb);
      doc.setGState(new doc.GState({ opacity: 0.1 }));
      doc.roundedRect(14, 18, 182, 250, 18, 18, "F");
      doc.setGState(new doc.GState({ opacity: 1 }));

      if (brandImage.dataUrl) {
        if (isHeaderBanner) {
          drawBrandImage(22, 28, 166, 28, "center");
        } else {
          drawBrandImage(20, 30, 42, 20, "left");
        }
      }

      doc.setTextColor(...theme.inverseTextRgb);
      doc.setFontSize(11);
      doc.text("Property Report", 20, isHeaderBanner ? 74 : 62);
      doc.setFontSize(28);
      doc.text(home.name, 20, isHeaderBanner ? 92 : 80, { maxWidth: 120 });
      doc.setFontSize(11);
      doc.setTextColor(...theme.coverBodyTextRgb);
      doc.text(`Generated ${generatedAt}`, 20, isHeaderBanner ? 104 : 92);
      if (companyName) {
        doc.text(`Prepared by ${companyName}`, 20, isHeaderBanner ? 112 : 100);
      }

      doc.setTextColor(...theme.coverBodyTextRgb);
      doc.setFontSize(12);
      doc.text(
        "A clean, presentation-ready export covering property systems, layout, and inspection records in one consistent pack.",
        20,
        132,
        { maxWidth: 88, lineHeightFactor: 1.55 }
      );

      doc.setFillColor(...theme.inverseTextRgb);
      doc.roundedRect(20, 156, 74, 18, 9, 9, "F");
      doc.setTextColor(...theme.accentDarkRgb);
      doc.setFontSize(11);
      doc.text("Export Ready", 57, 168, { align: "center" });
      doc.setTextColor(...theme.inverseTextRgb);
      doc.setFontSize(10);
      doc.text("Included Sections", 20, 192);
    };

    const drawCoverSectionLinks = () => {
      const sections = selectedKeys.map((key) => ({
        key,
        label: getSectionLabel(key),
        page: sectionStartPages[key],
      })).filter((item) => item.page);
      if (!sections.length) return;

      doc.setPage(1);
      doc.setFontSize(6.8);
      const maxWidth = 170;
      const gap = 3;
      const rawWidths = sections.map((section) => Math.max(18, doc.getTextWidth(section.label) + 10));
      const rawTotal = rawWidths.reduce((sum, width) => sum + width, 0) + ((sections.length - 1) * gap);
      const scale = rawTotal > maxWidth ? maxWidth / rawTotal : 1;
      let x = 20;
      const y = 198;

      sections.forEach((section, index) => {
        const width = rawWidths[index] * scale;
        doc.setFillColor(...theme.coverPanelRgb);
        doc.setGState(new doc.GState({ opacity: 0.14 }));
        doc.roundedRect(x, y, width, 10, 4, 4, "F");
        doc.setGState(new doc.GState({ opacity: 1 }));
        doc.setTextColor(...theme.inverseTextRgb);
        doc.text(section.label, x + (width / 2), y + 6.3, { align: "center", maxWidth: width - 4 });
        doc.link(x, y, width, 10, { pageNumber: section.page });
        x += width + (gap * scale);
      });
    };

    const beginMagazineSection = (key, title, subtitle = "", intro = "") => {
      doc.addPage();
      currentY = 24;
      sectionStartPages[key] = doc.getCurrentPageInfo().pageNumber;
      drawEditorialBackdrop(doc, theme, accentRgb);
      doc.setFillColor(...theme.sectionBarRgb);
      doc.rect(0, 0, 210, 16, "F");
      if (brandImage.dataUrl) {
        if (isHeaderBanner) {
          drawBrandImage(54, 2.5, 102, 11, "center");
        } else {
          drawBrandImage(14, 5, 18, 8, "left");
        }
      }
      doc.setTextColor(...theme.inverseTextRgb);
      doc.setFontSize(14);
      doc.text(title, isHeaderBanner ? 14 : 40, 10.5);
      if (subtitle) {
        doc.setFontSize(8.5);
        doc.text(subtitle, 196, 10.5, { align: "right" });
      }

      doc.setFillColor(...theme.cardRgb);
      doc.roundedRect(14, 24, 182, intro ? 34 : 18, 10, 10, "F");
      doc.setTextColor(...theme.titleTextRgb);
      doc.setFontSize(19);
      doc.text(title, 18, 38);
      if (intro) {
        doc.setFontSize(9.5);
        doc.setTextColor(...theme.bodyTextRgb);
        doc.text(intro, 18, 46, { maxWidth: 170, lineHeightFactor: 1.55 });
        currentY = 66;
      } else {
        currentY = 50;
      }
    };

    const addStatCards = (cards) => {
      cards.forEach((card, index) => {
        const x = 14 + (index * 60);
        doc.setFillColor(...theme.cardRgb);
        doc.setDrawColor(...theme.borderRgb);
        doc.roundedRect(x, currentY, 56, 22, 6, 6, "FD");
        doc.setFillColor(accentRgb[0], accentRgb[1], accentRgb[2]);
        doc.roundedRect(x + 4, currentY + 4, 3, 14, 2, 2, "F");
        doc.setFontSize(7);
        doc.setTextColor(...theme.mutedTextRgb);
        doc.text(card.label.toUpperCase(), x + 11, currentY + 8);
        doc.setFontSize(12);
        doc.setTextColor(...theme.titleTextRgb);
        doc.text(String(card.value), x + 11, currentY + 16);
      });
      currentY += 30;
    };

    const addMagazineTable = (head, body, options = {}) => {
      autoTable(doc, {
        startY: currentY,
        head: [head],
        body,
        margin: { left: 14, right: 14 },
        styles: {
          fontSize: 8.7,
          cellPadding: 3,
          lineColor: theme.borderRgb,
          lineWidth: 0.15,
          textColor: theme.bodyTextRgb,
          overflow: "linebreak",
        },
        headStyles: {
          fillColor: theme.sectionBarRgb,
          textColor: theme.tableHeadTextRgb,
          fontStyle: "bold",
          cellPadding: 3.2,
        },
        bodyStyles: {
          fillColor: theme.tableBodyFillRgb,
        },
        alternateRowStyles: {
          fillColor: theme.tableAltFillRgb,
        },
        ...options,
      });
      currentY = doc.lastAutoTable.finalY + 10;
    };

    const addInfoPanel = (label, text) => {
      doc.setFillColor(...theme.cardMutedRgb);
      doc.roundedRect(14, currentY, 182, 22, 8, 8, "F");
      doc.setFontSize(7);
      doc.setTextColor(...theme.mutedTextRgb);
      doc.text(label.toUpperCase(), 18, currentY + 8);
      doc.setFontSize(10);
      doc.setTextColor(...theme.titleTextRgb);
      doc.text(text, 18, currentY + 16, { maxWidth: 170 });
      currentY += 30;
    };

    const drawReportFooter = () => {
      doc.setDrawColor(...theme.footerLineRgb);
      doc.setLineWidth(0.35);
      doc.line(14, 284, 196, 284);
      doc.setTextColor(...theme.footerTextRgb);
      doc.setFontSize(8);
      doc.text(`${companyName || "Property report"} · Generated ${generatedAt}`, 14, 289);
      if (brandImage.dataUrl) {
        if (isHeaderBanner) {
          drawBrandImage(150, 283.5, 46, 8, "center");
        } else {
          drawBrandImage(174, 285, 22, 8, "left");
        }
      }
    };

    drawReportCover();

    const drawFloorplanPage = (floor) => {
      doc.addPage();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;
      const drawX = margin + 6;
      const drawY = 42;
      const drawWidth = pageWidth - (margin * 2) - 12;
      const drawHeight = pageHeight - drawY - margin - 20;
      const wallThicknessMeters = normalizeWallThickness(home.floorplanLayout?.wallThicknessMeters);
      const wallStrokeWidth = Math.max(1.4, Math.min(4.2, wallThicknessMeters * 11));

      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageWidth, pageHeight, "F");
      if (brandImage.dataUrl) {
        if (isHeaderBanner) {
          drawBrandImage(54, 6, 102, 12, "center");
        } else {
          drawBrandImage(14, 8, 20, 9, "left");
        }
      }

      const allItems = [
        ...(floor.rooms || []),
        ...(floor.doors || []),
        ...(floor.windows || []),
        ...(floor.spaces || []),
        ...(floor.stairs || []),
      ];
      const maxX = Math.max(FLOORPLAN_CANVAS_WIDTH, ...allItems.map((item) => (item.x || 0) + (item.w || 0)));
      const maxY = Math.max(FLOORPLAN_CANVAS_HEIGHT, ...allItems.map((item) => (item.y || 0) + (item.h || 0)));
      const scale = Math.min(drawWidth / maxX, drawHeight / maxY);
      const offsetX = drawX + (drawWidth - maxX * scale) / 2;
      const offsetY = drawY + (drawHeight - maxY * scale) / 2;
      const sx = (value) => offsetX + value * scale;
      const sy = (value) => offsetY + value * scale;
      const sw = (value) => value * scale;
      const sh = (value) => value * scale;
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
        if (label.includes("kitchen sink")) return "Kitchen Sink";
        if (label.includes("bathroom sink") || label.includes("basin")) return "Bathroom Sink";
        if (label.includes("sink")) return "Sink";
        if (label.includes("fridge")) return "Fridge";
        if (label.includes("oven") || label.includes("hob")) return "Oven/Hob";
        if (label.includes("storage") || label.includes("cabinet") || label.includes("wardrobe") || label.includes("cupboard")) {
          return "Storage";
        }
        if (label.includes("bed")) return "Bed";
        if (label.includes("sofa")) return "Sofa";
        if (label.includes("table")) return "Table";
        if (label.includes("chair")) return "Chairs";
        return String(space?.label || "Space");
      };
      const isFixtureSpace = (space) => {
        const label = String(space?.label || "").toLowerCase();
        return (
          label.includes("sink") ||
          label.includes("toilet") ||
          label.includes("bed") ||
          label.includes("sofa") ||
          label.includes("table") ||
          label.includes("chair") ||
          label.includes("bath") ||
          label.includes("shower") ||
          label.includes("storage") ||
          label.includes("cabinet") ||
          label.includes("wardrobe") ||
          label.includes("cupboard") ||
          label.includes("oven") ||
          label.includes("hob") ||
          label.includes("fridge")
        );
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
        if (label.includes("kitchen sink")) {
          drawRect(x + w * 0.06, y + h * 0.16, w * 0.88, h * 0.68, 0.55);
          drawCircle(x + w * 0.38, y + h * 0.54, Math.max(1.5, Math.min(w, h) * 0.16), 0.45);
          drawCircle(x + w * 0.64, y + h * 0.54, Math.max(1.5, Math.min(w, h) * 0.16), 0.45);
          drawLine(x + w * 0.5, y + h * 0.25, x + w * 0.5, y + h * 0.38, 0.35);
          drawLine(x + w * 0.43, y + h * 0.25, x + w * 0.57, y + h * 0.25, 0.35);
          return;
        }
        if (label.includes("bathroom sink") || label.includes("basin") || label.includes("sink")) {
          drawRect(x + w * 0.18, y + h * 0.16, w * 0.64, h * 0.68, 0.55);
          drawCircle(x + w * 0.5, y + h * 0.54, Math.max(1.5, Math.min(w, h) * 0.16), 0.45);
          drawLine(x + w * 0.44, y + h * 0.28, x + w * 0.56, y + h * 0.28, 0.35);
          return;
        }
        if (label.includes("storage") || label.includes("cabinet") || label.includes("wardrobe") || label.includes("cupboard")) {
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

      doc.setFontSize(7.5);
      doc.setTextColor(70, 70, 70);
      doc.text("FLOORPLAN", 18, 24);
      doc.setFontSize(15);
      doc.setTextColor(10, 10, 10);
      doc.text(String(floor.name || "Floor"), 18, 32);
      doc.setDrawColor(205, 205, 205);
      doc.setLineWidth(0.25);
      doc.rect(drawX, drawY, drawWidth, drawHeight);

      doc.setDrawColor(235, 235, 235);
      doc.setLineWidth(0.12);
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
        doc.setDrawColor(118, 118, 118);
        doc.setLineWidth(wallStrokeWidth);
        doc.rect(sx(room.x), sy(room.y), sw(room.w), sh(room.h), "FD");
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.42);
        doc.rect(sx(room.x), sy(room.y), sw(room.w), sh(room.h), "S");

        const roomCenterX = sx(room.x) + sw(room.w) / 2;
        const roomCenterY = sy(room.y) + sh(room.h) / 2;
        doc.setTextColor(12, 12, 12);
        doc.setFontSize(8.5);
        doc.text(String(room.name || "Room").toUpperCase(), roomCenterX, roomCenterY - 3, {
          align: "center",
          maxWidth: Math.max(14, sw(room.w) - 6),
        });
        doc.setFontSize(7.5);
        doc.setTextColor(45, 45, 45);
        doc.text(`${roomWidthMeters}m x ${roomHeightMeters}m`, roomCenterX, roomCenterY + 4, {
          align: "center",
          maxWidth: Math.max(14, sw(room.w) - 6),
        });
      });

      (floor.doors || []).forEach((door) => {
        const x = sx(door.x);
        const y = sy(door.y);
        const doorW = Math.max(8, sw(door.w || 24));
        const doorH = Math.max(6, sh(door.h || 20));
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
        doc.setLineWidth(Math.max(2.4, wallStrokeWidth + 0.7));
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
        const hideContainer = isFixtureSpace(space);
        const rect = hideContainer
          ? getRotatedRectFrame(space)
          : drawRotatedRect(space, {
              fill: true,
              fillColor: [255, 255, 255],
              strokeColor: [140, 140, 140],
              lineWidth: 0.4,
            });
        drawSpaceSymbol(space, rect);
        if (hideContainer) return;
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
          fillColor: [255, 255, 255],
          strokeColor: [20, 20, 20],
          lineWidth: 0.65,
        });
        const isDown = String(stairsItem.direction || "").toLowerCase() === "down";
        const rp = (px, py) => rotatePoint(px, py, rect.cx, rect.cy, rect.angle);
        const drawStairLine = (x1, y1, x2, y2, width = 0.35, color = [82, 82, 91]) => {
          const a = rp(x1, y1);
          const b = rp(x2, y2);
          doc.setDrawColor(...color);
          doc.setLineWidth(width);
          doc.line(a.x, a.y, b.x, b.y);
        };
        const treadCount = Math.max(4, Math.min(12, Math.floor(rect.w / 4)));
        for (let i = 1; i < treadCount; i += 1) {
          const treadX = rect.x + (rect.w * i) / treadCount;
          drawStairLine(treadX, rect.y, treadX, rect.y + rect.h, 0.32);
        }
        const arrowY = rect.y + rect.h / 2;
        const arrowStartX = rect.x + rect.w * (isDown ? 0.82 : 0.18);
        const arrowEndX = rect.x + rect.w * (isDown ? 0.18 : 0.82);
        const headBackX = rect.x + rect.w * (isDown ? 0.28 : 0.72);
        drawStairLine(arrowStartX, arrowY, arrowEndX, arrowY, 0.55, [20, 20, 20]);
        drawStairLine(
          arrowEndX,
          arrowY,
          headBackX,
          arrowY - rect.h * 0.12,
          0.55,
          [20, 20, 20]
        );
        drawStairLine(
          arrowEndX,
          arrowY,
          headBackX,
          arrowY + rect.h * 0.12,
          0.55,
          [20, 20, 20]
        );
        const labelPoint = rp(rect.x + rect.w * (isDown ? 0.68 : 0.12), rect.y + rect.h * 0.38);
        doc.setTextColor(20, 20, 20);
        doc.setFontSize(6.5);
        doc.text(isDown ? "DN" : "UP", labelPoint.x, labelPoint.y);
      });

      if (Number.isFinite(roomBounds.minX) && roomBounds.maxX > roomBounds.minX) {
        const dimY = Math.max(26, sy(roomBounds.minY) - 10);
        doc.setDrawColor(90, 90, 90);
        doc.setLineWidth(0.35);
        doc.line(sx(roomBounds.minX), dimY, sx(roomBounds.maxX), dimY);
        doc.line(sx(roomBounds.minX), dimY, sx(roomBounds.minX), sy(roomBounds.minY));
        doc.line(sx(roomBounds.maxX), dimY, sx(roomBounds.maxX), sy(roomBounds.minY));
        doc.line(sx(roomBounds.minX), dimY - 2, sx(roomBounds.minX), dimY + 2);
        doc.line(sx(roomBounds.maxX), dimY - 2, sx(roomBounds.maxX), dimY + 2);
        doc.setTextColor(20, 20, 20);
        doc.setFontSize(8);
        doc.text(
          `${Number(((roomBounds.maxX - roomBounds.minX) / FLOORPLAN_PIXELS_PER_METER).toFixed(2))}m`,
          (sx(roomBounds.minX) + sx(roomBounds.maxX)) / 2,
          dimY - 2,
          { align: "center" }
        );
      }

      if (Number.isFinite(roomBounds.minY) && roomBounds.maxY > roomBounds.minY) {
        const dimX = Math.max(8, sx(roomBounds.minX) - 10);
        doc.setDrawColor(90, 90, 90);
        doc.setLineWidth(0.35);
        doc.line(dimX, sy(roomBounds.minY), dimX, sy(roomBounds.maxY));
        doc.line(dimX, sy(roomBounds.minY), sx(roomBounds.minX), sy(roomBounds.minY));
        doc.line(dimX, sy(roomBounds.maxY), sx(roomBounds.minX), sy(roomBounds.maxY));
        doc.line(dimX - 2, sy(roomBounds.minY), dimX + 2, sy(roomBounds.minY));
        doc.line(dimX - 2, sy(roomBounds.maxY), dimX + 2, sy(roomBounds.maxY));
        doc.setTextColor(20, 20, 20);
        doc.setFontSize(8);
        doc.text(
          `${Number(((roomBounds.maxY - roomBounds.minY) / FLOORPLAN_PIXELS_PER_METER).toFixed(2))}m`,
          dimX - 1.5,
          (sy(roomBounds.minY) + sy(roomBounds.maxY)) / 2,
          { angle: 90, align: "center" }
        );
      }

      doc.setTextColor(80, 80, 80);
      doc.setFontSize(8);
      doc.text(
        `Scale approx: 1m grid · Wall thickness ${wallThicknessMeters}m`,
        drawX + 2,
        drawY + drawHeight - 3
      );
      drawReportFooter();
    };

    if (reportSections.fusebox) {
      beginMagazineSection(
        "fusebox",
        "Fusebox",
        "Electrical Overview",
        "A cleaner circuit summary showing the board setup and which rooms are linked to each fuse."
      );
      addStatCards([
        { label: "Fuses", value: home.fuses.length || 0 },
        { label: "Rooms", value: home.rooms.length || 0 },
        { label: "Fuseboxes", value: fuseboxes.length || 0 },
      ]);
      if (fuseboxes.length) {
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(14, currentY, 86, 58, 8, 8, "F");
        try {
          addContainedImage(doc, fuseboxes[0].photo, 18, currentY + 4, 78, 50);
        } catch {
          doc.setTextColor(113, 113, 122);
          doc.setFontSize(9);
          doc.text("Fusebox photo unavailable", 22, currentY + 30);
        }
        doc.setFillColor(accentSoftRgb[0], accentSoftRgb[1], accentSoftRgb[2]);
        doc.roundedRect(108, currentY, 88, 58, 8, 8, "F");
        doc.setFontSize(8);
        doc.setTextColor(113, 113, 122);
        doc.text("STATUS", 114, currentY + 10);
        doc.setFontSize(11);
        doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
        doc.text("Main Switch: 100A Main Isolator (ON)", 114, currentY + 22, { maxWidth: 76 });
        doc.setFontSize(9);
        doc.setTextColor(82, 82, 91);
        doc.text("Linked circuits are listed below with room-level light and socket assignments.", 114, currentY + 34, {
          maxWidth: 76,
          lineHeightFactor: 1.45,
        });
        currentY += 68;
        addMagazineTable(
          ["Fusebox", "Location", "Notes"],
          fuseboxes.map((fusebox, index) => [
            fusebox.label || `Fusebox ${index + 1}`,
            fusebox.location || "Not recorded",
            fusebox.notes || "No notes",
          ])
        );
      } else {
        addInfoPanel("Status", "Main Switch: 100A Main Isolator (ON)");
      }

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

      addMagazineTable(
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

      addMagazineTable(
        ["Room", "Floor", "Lights Fuse", "Sockets Fuse"],
        roomBody.length ? roomBody : [["-", "-", "No rooms added", "No rooms added"]]
      );
      drawReportFooter();
    }

    if (reportSections.floorplan) {
      beginMagazineSection(
        "floorplan",
        "Floorplan",
        "Layout Summary",
        "A structured breakdown of the generated layout, followed by full-page floorplan sheets for each level."
      );
      const layout = normalizeFloorplanLayout(home.floorplanLayout, home.rooms);
      addStatCards([
        { label: "Floors", value: layout.floors.length || 0 },
        { label: "Rooms", value: layout.floors.reduce((count, floor) => count + floor.rooms.length, 0) },
        { label: "Wall Thickness", value: `${normalizeWallThickness(layout.wallThicknessMeters)}m` },
      ]);
      const floorSummary = layout.floors.map((floor) => [
        floor.name,
        String(floor.rooms.length),
        String(floor.doors.length),
        String(floor.windows.length),
        String(floor.spaces.length),
        String((floor.stairs || []).length),
      ]);
      addMagazineTable(
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
      addMagazineTable(
        ["Room", "Floor", "Width", "Height"],
        measurementRows.length ? measurementRows : [["-", "-", "-", "-"]]
      );
      addMagazineTable(["Setting", "Value"], [["Wall thickness", `${normalizeWallThickness(layout.wallThicknessMeters)}m`]]);
      drawReportFooter();

      layout.floors.forEach((floor) => drawFloorplanPage(floor));
    }

    if (reportSections.gas) {
      beginMagazineSection(
        "gas",
        "Gas",
        "Service Checks",
        "Room-by-room gas service status with recorded works and test timestamps."
      );
      const gasWorks = home.rooms.filter((room) => home.gasChecks?.[room.id]?.worksAt).length;
      const gasTested = home.rooms.filter((room) => home.gasChecks?.[room.id]?.testedAt).length;
      addStatCards([
        { label: "Rooms", value: home.rooms.length || 0 },
        { label: "Works", value: gasWorks },
        { label: "Tested", value: gasTested },
      ]);
      const gasBody = home.rooms.map((room) => [
        room.name,
        floorNameById[room.floorId] || getDefaultFloorNameById(room.floorId || "floor_1"),
        home.gasChecks?.[room.id]?.pointLocation || "Not recorded",
        home.gasChecks?.[room.id]?.worksAt ? "Yes" : home.gasChecks?.[room.id]?.recorded ? "Legacy" : "No",
        formatRecordedTimestamp(home.gasChecks?.[room.id]?.worksAt),
        home.gasChecks?.[room.id]?.testedAt ? "Yes" : "No",
        formatRecordedTimestamp(home.gasChecks?.[room.id]?.testedAt),
        home.gasChecks?.[room.id]?.notes || "",
      ]);
      addMagazineTable(
        ["Room", "Floor", "Point Location", "Works", "Works At", "Tested", "Tested At", "Notes"],
        gasBody.length ? gasBody : [["-", "-", "-", "-", "-", "-", "-", "No rooms"]]
      );
      drawReportFooter();
    }

    if (reportSections.fire) {
      beginMagazineSection(
        "fire",
        "Fire Alarms",
        "Safety Checks",
        "A tidy record of alarm works and test confirmations across the property."
      );
      const fireWorks = home.rooms.filter((room) => home.fireAlarmChecks?.[room.id]?.worksAt).length;
      const fireTested = home.rooms.filter((room) => home.fireAlarmChecks?.[room.id]?.testedAt).length;
      addStatCards([
        { label: "Rooms", value: home.rooms.length || 0 },
        { label: "Works", value: fireWorks },
        { label: "Tested", value: fireTested },
      ]);
      const fireBody = home.rooms.map((room) => [
        room.name,
        floorNameById[room.floorId] || getDefaultFloorNameById(room.floorId || "floor_1"),
        home.fireAlarmChecks?.[room.id]?.pointLocation || "Not recorded",
        home.fireAlarmChecks?.[room.id]?.worksAt ? "Yes" : home.fireAlarmChecks?.[room.id]?.recorded ? "Legacy" : "No",
        formatRecordedTimestamp(home.fireAlarmChecks?.[room.id]?.worksAt),
        home.fireAlarmChecks?.[room.id]?.testedAt ? "Yes" : "No",
        formatRecordedTimestamp(home.fireAlarmChecks?.[room.id]?.testedAt),
        home.fireAlarmChecks?.[room.id]?.notes || "",
      ]);
      addMagazineTable(
        ["Room", "Floor", "Point Location", "Works", "Works At", "Tested", "Tested At", "Notes"],
        fireBody.length ? fireBody : [["-", "-", "-", "-", "-", "-", "-", "No rooms"]]
      );
      drawReportFooter();
    }

    if (reportSections.inventory) {
      const inventoryReport = home.inventoryReport;
      if (inventoryReport?.rooms?.length) {
        doc.addPage();
        sectionStartPages.inventory = doc.getCurrentPageInfo().pageNumber;
        appendInventoryPdf(doc, inventoryReport, Object.fromEntries(home.rooms.map((room) => [room.id, room])), home.name, {
          branding: pdfBranding,
          includeLegionella: false,
          applyPageNumbers: false,
        });
      } else {
        beginMagazineSection(
          "inventory",
          "Inventory",
          "Inspection Pages",
          "Inventory pages are only added once a room-by-room inventory report has been created."
        );
        addMagazineTable(
          ["Section", "Status"],
          [["Inventory", "No inventory report available"]]
        );
        drawReportFooter();
      }
    }

    if (reportSections.brochure) {
      doc.addPage();
      sectionStartPages.brochure = doc.getCurrentPageInfo().pageNumber;
      appendMarketingBrochurePdf(doc, { save: false, applyPageNumbers: false });
    }

    drawCoverSectionLinks();
    addCenteredPageNumbers(doc);

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
                src={`${process.env.PUBLIC_URL}/InventoryProHeader.png`}
                alt="InventoryPro logo"
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
              onClick={() => {
                if (!canExportPdf) {
                  onRequireSubscription?.();
                  return;
                }
                setExportModalOpen(true);
              }}
              className="h-8 rounded-lg bg-zinc-800 px-3 text-[11px] font-semibold text-white transition hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-300"
            >
              {canExportPdf ? "Export PDF" : "Unlock PDF"}
            </button>
          </div>
        </div>
      </div>

      {!canExportPdf ? (
        <div className="px-4 pt-3">
          <div className="mx-auto w-full max-w-[23rem] md:max-w-4xl lg:max-w-5xl rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800">Subscription</p>
            <p className="mt-1 text-xs text-amber-700">
              You can keep building reports and collecting media. PDF exports unlock once this account has an active subscription.
            </p>
          </div>
        </div>
      ) : (
        <div className="px-4 pt-3">
          <div className="mx-auto w-full max-w-[23rem] md:max-w-4xl lg:max-w-5xl rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-800">Subscription</p>
            <p className="mt-1 text-xs text-emerald-700">
              {subscription?.cancelAtPeriodEnd
                ? `${subscription?.planName || "Paid"} plan cancelled. PDF exports stay enabled until ${subscriptionEndLabel || "the current period ends"}.`
                : `${subscription?.planName || "Paid"} plan active. PDF exports are enabled for this account.`}
            </p>
          </div>
        </div>
      )}

      <div className="px-4 pt-3">
        <div className="mx-auto w-full max-w-[23rem] md:max-w-4xl lg:max-w-5xl rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm">
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: "fusebox", label: "Fusebox" },
              { key: "gas", label: "Gas" },
              { key: "fire", label: "Fire Alarms" },
              { key: "inventory", label: "Inventory" },
              { key: "floorplan", label: "Floorplan Gen [BETA]" },
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
            Fuseboxes
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Add one or more fuseboxes, including their location and any notes.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <label className="h-9 rounded-lg bg-zinc-800 px-3 text-[11px] font-semibold text-white transition hover:bg-zinc-700 flex items-center cursor-pointer">
              Take Photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={onFuseboxPhotoSelected}
              />
            </label>
            <label className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-50 flex items-center cursor-pointer">
              Upload Image
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onFuseboxPhotoSelected}
              />
            </label>
          </div>
          {fuseboxes.length ? (
            <div className="mt-3 space-y-2">
              {fuseboxes.map((fusebox, index) => (
                <div key={fusebox.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-2">
                  {fusebox.photo ? (
                    <img
                      src={fusebox.photo}
                      alt={fusebox.label || `Fusebox ${index + 1}`}
                      className="h-40 w-full rounded-lg border border-zinc-200 object-cover"
                    />
                  ) : null}
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="text-[10px] text-zinc-500">
                      Label
                      <input
                        value={fusebox.label}
                        onChange={(event) => updateFuseboxRecord(fusebox.id, { label: event.target.value })}
                        placeholder={`Fusebox ${index + 1}`}
                        className="mt-1 h-9 w-full rounded-lg border border-zinc-300 px-2 text-xs text-zinc-700"
                      />
                    </label>
                    <label className="text-[10px] text-zinc-500">
                      Location
                      <input
                        value={fusebox.location}
                        onChange={(event) => updateFuseboxRecord(fusebox.id, { location: event.target.value })}
                        placeholder="e.g. Hallway cupboard"
                        className="mt-1 h-9 w-full rounded-lg border border-zinc-300 px-2 text-xs text-zinc-700"
                      />
                    </label>
                  </div>
                  <label className="mt-2 block text-[10px] text-zinc-500">
                    Notes
                    <textarea
                      value={fusebox.notes}
                      onChange={(event) => updateFuseboxRecord(fusebox.id, { notes: event.target.value })}
                      placeholder="Add any fusebox notes"
                      rows={2}
                      className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-2 text-xs text-zinc-700"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removeFuseboxRecord(fusebox.id)}
                    className="mt-2 h-8 rounded-lg bg-red-100 px-3 text-[11px] font-semibold text-red-700"
                  >
                    Remove Fusebox
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-zinc-500">No fuseboxes added.</p>
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
                      inputMode="decimal"
                      enterKeyHint="done"
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
                      onKeyDown={blurOnDoneKey}
                      onKeyUp={blurOnDoneKey}
                      className="mt-1 h-8 w-full rounded-lg border border-zinc-300 px-2 text-xs"
                    />
                  </label>
                  <label className="text-[10px] text-zinc-500">
                    Height (m)
                    <input
                      type="number"
                      inputMode="decimal"
                      enterKeyHint="done"
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
                      onKeyDown={blurOnDoneKey}
                      onKeyUp={blurOnDoneKey}
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
                    inputMode="decimal"
                    enterKeyHint="done"
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
                    onKeyDown={blurOnDoneKey}
                    onKeyUp={blurOnDoneKey}
                    className="mt-1 h-9 w-full rounded-lg border border-zinc-300 px-2 text-xs"
                  />
                </label>
                <label className="text-[10px] text-zinc-500">
                  Height (m)
                  <input
                    type="number"
                    inputMode="decimal"
                    enterKeyHint="done"
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
                    onKeyDown={blurOnDoneKey}
                    onKeyUp={blurOnDoneKey}
                    className="mt-1 h-9 w-full rounded-lg border border-zinc-300 px-2 text-xs"
                  />
                </label>
              </div>
            </div>
          ) : null}

          <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-[11px] font-semibold text-zinc-700">Wall thickness</p>
            <p className="mt-1 text-[11px] text-zinc-500">
              This is used in the floorplan preview and the exported PDF.
            </p>
            <input
              type="number"
              inputMode="decimal"
              enterKeyHint="done"
              min="0.05"
              max="1"
              step="0.01"
              value={normalizeWallThickness(home.floorplanLayout?.wallThicknessMeters)}
              onChange={(event) =>
                updateFloorplanLayout({
                  ...normalizeFloorplanLayout(home.floorplanLayout, home.rooms),
                  wallThicknessMeters: normalizeWallThickness(event.target.value),
                })
              }
              onKeyDown={blurOnDoneKey}
              onKeyUp={blurOnDoneKey}
              className="mt-2 h-9 w-full rounded-lg border border-zinc-300 px-2 text-xs"
            />
          </div>

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
              {home.rooms.map((room) => {
                const gasCheck = normalizeServiceCheckEntry(home.gasChecks?.[room.id]);
                return (
                <div
                  key={`gas-${room.id}`}
                  className={`w-full rounded-lg border px-3 py-2 text-left ${
                    gasCheck.worksAt ||
                    gasCheck.testedAt ||
                    gasCheck.pointLocation ||
                    gasCheck.notes ||
                    gasCheck.photos.length
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-zinc-200 bg-zinc-50"
                  }`}
                >
                  <p className="text-sm font-semibold text-zinc-700">{room.name}</p>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="text-[10px] text-zinc-500">
                      Gas point / appliance location
                      <input
                        value={gasCheck.pointLocation}
                        onChange={(event) =>
                          updateServiceCheckDetails("gasChecks", room.id, { pointLocation: event.target.value })
                        }
                        placeholder="e.g. Kitchen boiler cupboard"
                        className="mt-1 h-9 w-full rounded-lg border border-zinc-300 bg-white px-2 text-xs text-zinc-700"
                      />
                    </label>
                    <label className="text-[10px] text-zinc-500">
                      Additional notes
                      <input
                        value={gasCheck.notes}
                        onChange={(event) =>
                          updateServiceCheckDetails("gasChecks", room.id, { notes: event.target.value })
                        }
                        placeholder="Add gas safety notes"
                        className="mt-1 h-9 w-full rounded-lg border border-zinc-300 bg-white px-2 text-xs text-zinc-700"
                      />
                    </label>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleGasCheck(room.id, "worksAt");
                      }}
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                        gasCheck.worksAt ? "bg-emerald-600 text-white" : "bg-white text-zinc-700"
                      }`}
                    >
                      Works
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleGasCheck(room.id, "testedAt");
                      }}
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                        gasCheck.testedAt ? "bg-emerald-600 text-white" : "bg-white text-zinc-700"
                      }`}
                    >
                      Tested
                    </button>
                    <label className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-zinc-700 shadow-sm cursor-pointer">
                      Take Photo
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(event) => onServicePhotoSelected("gasChecks", room.id, event)}
                      />
                    </label>
                    <label className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-zinc-700 shadow-sm cursor-pointer">
                      Upload Image
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(event) => onServicePhotoSelected("gasChecks", room.id, event)}
                      />
                    </label>
                  </div>
                  {gasCheck.photos.length ? (
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {gasCheck.photos.map((photo) => (
                        <div key={photo.id} className="rounded-lg border border-zinc-200 bg-white p-1">
                          <img
                            src={photo.url}
                            alt={photo.fileName || `${room.name} gas attachment`}
                            className="h-20 w-full rounded-md object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removeServicePhoto("gasChecks", room.id, photo.id)}
                            className="mt-1 h-7 w-full rounded-md bg-red-50 text-[10px] font-semibold text-red-700"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <p className="mt-2 text-xs text-zinc-500">
                    Works: {formatRecordedTimestamp(gasCheck.worksAt)}
                  </p>
                  <p className="text-xs text-zinc-500">
                    Tested: {formatRecordedTimestamp(gasCheck.testedAt)}
                  </p>
                </div>
              );
              })}
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
              {home.rooms.map((room) => {
                const fireCheck = normalizeServiceCheckEntry(home.fireAlarmChecks?.[room.id]);
                return (
                <div
                  key={`fire-${room.id}`}
                  className={`w-full rounded-lg border px-3 py-2 text-left ${
                    fireCheck.worksAt ||
                    fireCheck.testedAt ||
                    fireCheck.pointLocation ||
                    fireCheck.notes ||
                    fireCheck.photos.length
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-zinc-200 bg-zinc-50"
                  }`}
                >
                  <p className="text-sm font-semibold text-zinc-700">{room.name}</p>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="text-[10px] text-zinc-500">
                      Alarm point location
                      <input
                        value={fireCheck.pointLocation}
                        onChange={(event) =>
                          updateServiceCheckDetails("fireAlarmChecks", room.id, { pointLocation: event.target.value })
                        }
                        placeholder="e.g. Hall ceiling"
                        className="mt-1 h-9 w-full rounded-lg border border-zinc-300 bg-white px-2 text-xs text-zinc-700"
                      />
                    </label>
                    <label className="text-[10px] text-zinc-500">
                      Additional notes
                      <input
                        value={fireCheck.notes}
                        onChange={(event) =>
                          updateServiceCheckDetails("fireAlarmChecks", room.id, { notes: event.target.value })
                        }
                        placeholder="Add fire alarm notes"
                        className="mt-1 h-9 w-full rounded-lg border border-zinc-300 bg-white px-2 text-xs text-zinc-700"
                      />
                    </label>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleFireAlarmCheck(room.id, "worksAt");
                      }}
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                        fireCheck.worksAt ? "bg-emerald-600 text-white" : "bg-white text-zinc-700"
                      }`}
                    >
                      Works
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleFireAlarmCheck(room.id, "testedAt");
                      }}
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                        fireCheck.testedAt ? "bg-emerald-600 text-white" : "bg-white text-zinc-700"
                      }`}
                    >
                      Tested
                    </button>
                    <label className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-zinc-700 shadow-sm cursor-pointer">
                      Take Photo
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(event) => onServicePhotoSelected("fireAlarmChecks", room.id, event)}
                      />
                    </label>
                    <label className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-zinc-700 shadow-sm cursor-pointer">
                      Upload Image
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(event) => onServicePhotoSelected("fireAlarmChecks", room.id, event)}
                      />
                    </label>
                  </div>
                  {fireCheck.photos.length ? (
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {fireCheck.photos.map((photo) => (
                        <div key={photo.id} className="rounded-lg border border-zinc-200 bg-white p-1">
                          <img
                            src={photo.url}
                            alt={photo.fileName || `${room.name} fire alarm attachment`}
                            className="h-20 w-full rounded-md object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removeServicePhoto("fireAlarmChecks", room.id, photo.id)}
                            className="mt-1 h-7 w-full rounded-md bg-red-50 text-[10px] font-semibold text-red-700"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <p className="mt-2 text-xs text-zinc-500">
                    Works: {formatRecordedTimestamp(fireCheck.worksAt)}
                  </p>
                  <p className="text-xs text-zinc-500">
                    Tested: {formatRecordedTimestamp(fireCheck.testedAt)}
                  </p>
                </div>
              );
              })}
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
              branding={pdfBranding}
              onBrandingChange={onPdfBrandingChange}
              onBrandLogoSelected={onPdfLogoSelected}
              onBrandHeaderLogoSelected={onPdfHeaderLogoSelected}
              onRemoveBrandLogo={onRemovePdfLogo}
              onRemoveBrandHeaderLogo={onRemovePdfHeaderLogo}
              onAddRoom={addRoomToHome}
              canExportPdf={canExportPdf}
              onRequireSubscription={onRequireSubscription}
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
          logoImage={getSelectedBrandImage(pdfBranding).dataUrl}
          selectedImages={selectedBrochureImages}
          inventoryMedia={inventoryBrochureMedia}
          onBrochureChange={updateMarketingBrochure}
          onHeroImageSelected={onBrochureHeroSelected}
          onRemoveHeroImage={() => updateMarketingBrochure({ heroImage: "" })}
          onFloorplanImageSelected={onBrochureFloorplanSelected}
          onRemoveFloorplanImage={() => updateMarketingBrochure({ floorplanImage: "", floorplanSource: "generated" })}
          onLogoImageSelected={onPdfLogoSelected}
          onRemoveLogoImage={onRemovePdfLogo}
          onGalleryImagesSelected={onBrochureGallerySelected}
          onRemoveGalleryImage={removeBrochureGalleryImage}
          onToggleInventoryMedia={toggleInventoryBrochureMedia}
          onExportBrochure={exportMarketingBrochurePdf}
          canExportPdf={canExportPdf}
        />
      ) : null}

      <ContactFooter />

      {exportModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end overflow-y-auto overscroll-contain bg-black/35 p-3">
          <div className="mx-auto max-h-[calc(100vh-1.5rem)] w-full max-w-[23rem] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-3 shadow-xl md:max-w-4xl lg:max-w-5xl">
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
                    brochure: true,
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
                { key: "brochure", label: "Brochure" },
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
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(PDF_THEME_PRESETS).map(([presetKey, preset]) => (
                    <button
                      key={`export-theme-${presetKey}`}
                      type="button"
                      onClick={() => applyThemePreset(presetKey)}
                      className={`h-9 rounded-lg text-[11px] font-semibold ${
                        pdfBranding.themePreset === presetKey
                          ? "bg-zinc-800 text-white"
                          : "bg-zinc-100 text-zinc-700"
                      }`}
                    >
                      {preset.label} Preset
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={pdfBranding.companyName}
                  onChange={(event) =>
                    onPdfBrandingChange((prev) => ({
                      ...prev,
                      companyName: event.target.value,
                    }))
                  }
                  placeholder="Company name"
                  className="h-9 w-full rounded-lg border border-zinc-300 px-3 text-xs"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onPdfBrandingChange((prev) => ({
                        ...prev,
                        brandImageVariant: "logo",
                      }))
                    }
                    className={`h-9 rounded-lg text-[11px] font-semibold ${
                      pdfBranding.brandImageVariant === "logo"
                        ? "bg-zinc-800 text-white"
                        : "bg-zinc-100 text-zinc-700"
                    }`}
                  >
                    Use Logo
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onPdfBrandingChange((prev) => ({
                        ...prev,
                        brandImageVariant: "header",
                      }))
                    }
                    className={`h-9 rounded-lg text-[11px] font-semibold ${
                      pdfBranding.brandImageVariant === "header"
                        ? "bg-zinc-800 text-white"
                        : "bg-zinc-100 text-zinc-700"
                    }`}
                  >
                    Use Header Logo
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <ColorHexField
                    label="Primary"
                    value={pdfBranding.primaryColor}
                    fallback="#1f2937"
                    onChange={(primaryColor) =>
                      onPdfBrandingChange((prev) => ({
                        ...prev,
                        primaryColor,
                      }))
                    }
                  />
                  <ColorHexField
                    label="Accent"
                    value={pdfBranding.accentColor}
                    fallback="#15803d"
                    onChange={(accentColor) =>
                      onPdfBrandingChange((prev) => ({
                        ...prev,
                        accentColor,
                      }))
                    }
                  />
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
                      onClick={onRemovePdfLogo}
                      className="h-9 rounded-lg bg-zinc-200 px-3 text-[11px] font-semibold text-zinc-700"
                    >
                      Remove Logo
                    </button>
                  ) : null}
                  <label className="h-9 rounded-lg bg-zinc-700 px-3 text-[11px] font-semibold text-white transition hover:bg-zinc-600 flex items-center cursor-pointer">
                    Upload Header Logo
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={onPdfHeaderLogoSelected}
                    />
                  </label>
                  {pdfBranding.headerLogoDataUrl ? (
                    <button
                      type="button"
                      onClick={onRemovePdfHeaderLogo}
                      className="h-9 rounded-lg bg-zinc-200 px-3 text-[11px] font-semibold text-zinc-700"
                    >
                      Remove Header Logo
                    </button>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {pdfBranding.logoDataUrl ? (
                    <img
                      src={pdfBranding.logoDataUrl}
                      alt="PDF logo preview"
                      className="h-12 w-auto rounded border border-zinc-200 bg-white p-1"
                    />
                  ) : null}
                  {pdfBranding.headerLogoDataUrl ? (
                    <img
                      src={pdfBranding.headerLogoDataUrl}
                      alt="PDF header logo preview"
                      className="h-12 w-full rounded border border-zinc-200 bg-white p-1 object-contain"
                    />
                  ) : null}
                </div>
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
  subscription,
  pdfBranding,
  onPdfBrandingChange,
  onPdfLogoSelected,
  onPdfHeaderLogoSelected,
  onRemovePdfLogo,
  onRemovePdfHeaderLogo,
  canExportPdf,
  onRequireSubscription,
}) {
  const [newHomeName, setNewHomeName] = useState("");
  const [presetKey, setPresetKey] = useState(HOME_PRESETS[0].key);
  const applyThemePreset = (preset) => {
    const theme = getPdfThemePresetValue(preset);
    onPdfBrandingChange((prev) => ({
      ...prev,
      themePreset: preset,
      primaryColor: theme.primaryColor,
      accentColor: theme.accentColor,
    }));
  };

  const createHome = () => {
    const cleanName = newHomeName.trim();
    if (!cleanName) return;
    onCreateHome(cleanName, presetKey);
    setNewHomeName("");
  };
  const subscriptionEndLabel = getSubscriptionEndLabel(subscription);

  return (
    <div className="min-h-screen bg-neutral-100 p-4">
      <div className="mx-auto w-full max-w-[23rem] md:max-w-4xl lg:max-w-5xl space-y-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-center">
            <div className="flex items-center gap-2 min-w-0">
              <img
                src={`${process.env.PUBLIC_URL}/InventoryProHeader.png`}
                alt="InventoryPro logo"
                className="h-8 w-auto"
              />
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">Account</p>
              <p className="truncate text-[11px] font-medium text-zinc-700">{userEmail || "Unknown"}</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                Plan: <span className="font-medium text-zinc-700">{subscription?.planName || "Free"}</span>
                {subscription?.billingInterval ? ` · ${subscription.billingInterval}` : ""}
              </p>
              {subscriptionEndLabel ? (
                <p className="mt-0.5 text-[11px] font-medium text-amber-700">
                  Cancelled. Access ends on {subscriptionEndLabel}.
                </p>
              ) : null}
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

        {!canExportPdf ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800">PDF Exports Locked</p>
                <p className="mt-1 text-xs text-amber-700">
                  You can create homes and fill in reports now. Upgrade when you are ready to export PDFs.
                </p>
              </div>
              <button
                type="button"
                onClick={onRequireSubscription}
                className="h-9 shrink-0 rounded-lg bg-amber-600 px-3 text-[11px] font-semibold text-white transition hover:bg-amber-500"
              >
                View plans
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-800">PDF Exports Enabled</p>
                <p className="mt-1 text-xs text-emerald-700">
                  {subscription?.cancelAtPeriodEnd
                    ? `${subscription?.planName || "Paid"} plan cancelled. Client-ready PDF exports stay available until ${subscriptionEndLabel || "the current period ends"}.`
                    : `${subscription?.planName || "Paid"} plan active. Client-ready PDF exports are available on this account.`}
                </p>
              </div>
              <button
                type="button"
                onClick={onRequireSubscription}
                className="h-9 shrink-0 rounded-lg bg-white px-3 text-[11px] font-semibold text-emerald-800 transition hover:bg-emerald-100"
              >
                View plan
              </button>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
            Global PDF Branding
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Set the default branding image used at the top of exported PDFs.
          </p>
          <div className="mt-2 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(PDF_THEME_PRESETS).map(([presetKeyValue, preset]) => (
                <button
                  key={`global-theme-${presetKeyValue}`}
                  type="button"
                  onClick={() => applyThemePreset(presetKeyValue)}
                  className={`h-10 rounded-lg text-[11px] font-semibold ${
                    pdfBranding.themePreset === presetKeyValue
                      ? "bg-zinc-800 text-white"
                      : "bg-zinc-100 text-zinc-700"
                  }`}
                >
                  {preset.label} Preset
                </button>
              ))}
            </div>
            <input
              value={pdfBranding.companyName}
              onChange={(event) =>
                onPdfBrandingChange((prev) => ({
                  ...prev,
                  companyName: event.target.value,
                }))
              }
              placeholder="Company name"
              className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm text-zinc-700"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  onPdfBrandingChange((prev) => ({
                    ...prev,
                    brandImageVariant: "logo",
                  }))
                }
                className={`h-10 rounded-lg text-[11px] font-semibold ${
                  pdfBranding.brandImageVariant === "logo"
                    ? "bg-zinc-800 text-white"
                    : "bg-zinc-100 text-zinc-700"
                }`}
              >
                Use Logo
              </button>
              <button
                type="button"
                onClick={() =>
                  onPdfBrandingChange((prev) => ({
                    ...prev,
                    brandImageVariant: "header",
                  }))
                }
                className={`h-10 rounded-lg text-[11px] font-semibold ${
                  pdfBranding.brandImageVariant === "header"
                    ? "bg-zinc-800 text-white"
                    : "bg-zinc-100 text-zinc-700"
                }`}
              >
                Use Header Logo
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <ColorHexField
                label="Primary"
                value={pdfBranding.primaryColor}
                fallback="#1f2937"
                onChange={(primaryColor) =>
                  onPdfBrandingChange((prev) => ({
                    ...prev,
                    primaryColor,
                  }))
                }
              />
              <ColorHexField
                label="Accent"
                value={pdfBranding.accentColor}
                fallback="#15803d"
                onChange={(accentColor) =>
                  onPdfBrandingChange((prev) => ({
                    ...prev,
                    accentColor,
                  }))
                }
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="h-10 rounded-lg bg-zinc-800 px-3 text-[11px] font-semibold text-white flex items-center cursor-pointer">
                Upload Logo
                <input type="file" accept="image/*" className="hidden" onChange={onPdfLogoSelected} />
              </label>
              {pdfBranding.logoDataUrl ? (
                <button
                  type="button"
                  onClick={onRemovePdfLogo}
                  className="h-10 rounded-lg bg-zinc-200 px-3 text-[11px] font-semibold text-zinc-700"
                >
                  Remove Logo
                </button>
              ) : null}
              <label className="h-10 rounded-lg bg-zinc-700 px-3 text-[11px] font-semibold text-white flex items-center cursor-pointer">
                Upload Header Logo
                <input type="file" accept="image/*" className="hidden" onChange={onPdfHeaderLogoSelected} />
              </label>
              {pdfBranding.headerLogoDataUrl ? (
                <button
                  type="button"
                  onClick={onRemovePdfHeaderLogo}
                  className="h-10 rounded-lg bg-zinc-200 px-3 text-[11px] font-semibold text-zinc-700"
                >
                  Remove Header Logo
                </button>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {pdfBranding.logoDataUrl ? (
                <img
                  src={pdfBranding.logoDataUrl}
                  alt="PDF logo preview"
                  className="h-12 w-auto rounded border border-zinc-200 bg-white p-1"
                />
              ) : null}
              {pdfBranding.headerLogoDataUrl ? (
                <img
                  src={pdfBranding.headerLogoDataUrl}
                  alt="PDF header logo preview"
                  className="h-12 w-full rounded border border-zinc-200 bg-white p-1 object-contain"
                />
              ) : null}
            </div>
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
              placeholder="House Address"
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
      <ContactFooter />
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [subscription, setSubscription] = useState(() => normalizeSubscriptionRecord(null));
  const [subscriptionPromptOpen, setSubscriptionPromptOpen] = useState(false);
  const [billingAction, setBillingAction] = useState("");
  const [billingError, setBillingError] = useState("");
  const [homes, setHomes] = useState([]);
  const [activeHomeId, setActiveHomeId] = useState(null);
  const [renameHomeId, setRenameHomeId] = useState(null);
  const [renameHomeName, setRenameHomeName] = useState("");
  const [pdfBranding, setPdfBranding] = useState(createDefaultPdfBranding());
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
      setSubscription(normalizeSubscriptionRecord(null));
      setSubscriptionLoading(false);
      setHomes([]);
      setActiveHomeId(null);
      return;
    }

    const localState = loadSavedState(userId);
    setHomes(localState?.homes ?? []);
    setActiveHomeId(null);
    setPdfBranding(normalizePdfBranding(localState?.pdfBranding));
  }, [userId]);

  useEffect(() => {
    let cancelled = false;

    if (!userId) {
      return undefined;
    }

    setSubscriptionLoading(true);

    fetchSubscriptionRecord(userId)
      .then((nextSubscription) => {
        if (!cancelled) {
          setSubscription(nextSubscription);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSubscription(normalizeSubscriptionRecord(null));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSubscriptionLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const storageKey = getStorageKey(userId);
    const statePayload = {
      homes,
      activeHomeId,
      pdfBranding: normalizePdfBranding(pdfBranding),
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
            pdfBranding: normalizePdfBranding(pdfBranding),
          })
        );
      } catch {
        // no-op
      }
    }
  }, [userId, homes, activeHomeId, pdfBranding]);

  useEffect(() => {
    if (activeHomeId && !homes.some((home) => home.id === activeHomeId)) {
      setActiveHomeId(null);
    }
  }, [homes, activeHomeId]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const canExportPdf = hasActiveSubscription(subscription);

  const refreshSubscription = async () => {
    if (!userId) return;
    setBillingError("");
    setSubscriptionLoading(true);
    try {
      const nextSubscription = await fetchSubscriptionRecord(userId);
      setSubscription(nextSubscription);
    } catch {
      setSubscription(normalizeSubscriptionRecord(null));
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const handleStartCheckout = async () => {
    setBillingAction("subscribe");
    setBillingError("");
    try {
      const { url } = await createCheckoutSession();
      if (!url) {
        throw new Error("Stripe checkout URL was not returned.");
      }
      window.location.assign(url);
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Could not open checkout.");
      setBillingAction("");
    }
  };

  const handleManageBilling = async () => {
    setBillingAction("portal");
    setBillingError("");
    try {
      const { url } = await createCustomerPortalSession();
      if (!url) {
        throw new Error("Stripe billing portal URL was not returned.");
      }
      window.location.assign(url);
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Could not open billing.");
      setBillingAction("");
    }
  };

  const handleRefreshSubscription = async () => {
    setBillingAction("refresh");
    setBillingError("");
    try {
      await refreshSubscription();
    } finally {
      setBillingAction("");
    }
  };

  const handleCancelSubscription = async () => {
    setBillingAction("cancel");
    setBillingError("");
    try {
      await cancelSubscriptionAtPeriodEnd();
      await refreshSubscription();
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Could not schedule cancellation.");
    } finally {
      setBillingAction("");
    }
  };

  const handlePdfBrandingChange = (mutator) => {
    setPdfBranding((prev) => normalizePdfBranding(typeof mutator === "function" ? mutator(prev) : mutator));
  };

  const handlePdfLogoSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const logoDataUrl = await compressImageFileToDataUrl(file, 640, 0.82);
      handlePdfBrandingChange((prev) => ({
        ...prev,
        logoDataUrl,
        brandImageVariant: "logo",
      }));
    } catch {
      // no-op
    } finally {
      event.target.value = "";
    }
  };

  const handlePdfHeaderLogoSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const headerLogoDataUrl = await compressImageFileToDataUrl(file, 1400, 0.9);
      handlePdfBrandingChange((prev) => ({
        ...prev,
        headerLogoDataUrl,
        brandImageVariant: "header",
      }));
    } catch {
      // no-op
    } finally {
      event.target.value = "";
    }
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

  if (loading || subscriptionLoading) {
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
      subscription={subscription}
      pdfBranding={pdfBranding}
      onPdfBrandingChange={handlePdfBrandingChange}
      onPdfLogoSelected={handlePdfLogoSelected}
      onPdfHeaderLogoSelected={handlePdfHeaderLogoSelected}
      canExportPdf={canExportPdf}
      onRequireSubscription={() => setSubscriptionPromptOpen(true)}
      onRemovePdfLogo={() =>
        handlePdfBrandingChange((prev) => ({
          ...prev,
          logoDataUrl: null,
        }))
      }
      onRemovePdfHeaderLogo={() =>
        handlePdfBrandingChange((prev) => ({
          ...prev,
          headerLogoDataUrl: null,
        }))
      }
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
      pdfBranding={pdfBranding}
      subscription={subscription}
      onPdfBrandingChange={handlePdfBrandingChange}
      onPdfLogoSelected={handlePdfLogoSelected}
      onPdfHeaderLogoSelected={handlePdfHeaderLogoSelected}
      canExportPdf={canExportPdf}
      onRequireSubscription={() => setSubscriptionPromptOpen(true)}
      onRemovePdfLogo={() =>
        handlePdfBrandingChange((prev) => ({
          ...prev,
          logoDataUrl: null,
        }))
      }
      onRemovePdfHeaderLogo={() =>
        handlePdfBrandingChange((prev) => ({
          ...prev,
          headerLogoDataUrl: null,
        }))
      }
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
      {subscriptionPromptOpen ? (
        <SubscriptionGate
          userEmail={session.user?.email}
          subscription={subscription}
          onRefresh={handleRefreshSubscription}
          onSignOut={handleSignOut}
          onClose={() => setSubscriptionPromptOpen(false)}
          onSubscribe={handleStartCheckout}
          onManageBilling={handleManageBilling}
          onCancelSubscription={handleCancelSubscription}
          busyAction={billingAction}
          errorMessage={billingError}
        />
      ) : null}
    </div>
  );
}
