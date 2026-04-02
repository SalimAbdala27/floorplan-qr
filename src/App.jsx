import { useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import FloorPlan from "./components/Floorplan.jsx";
import FuseBox from "./components/Fusebox.jsx";
import FloorplanCanvas from "./components/FloorplanCanvas.jsx";
import InventoryFlow from "./components/InventoryFlow.jsx";
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
  return preset.roomNames.map((name, index) => ({
    id: `room_${slugify(name)}_${index + 1}`,
    name,
    floorId: inferFloorIdFromRoomName(name),
    widthMeters: 4,
    heightMeters: 3,
    lightsFuseId: null,
    socketsFuseId: null,
  }));
}

function buildBooleanMapFromRooms(rooms, defaultValue = false) {
  const map = {};
  rooms.forEach((room) => {
    map[room.id] = defaultValue;
  });
  return map;
}

function buildLayoutFromRooms(rooms) {
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

  return {
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
}

function normalizeFloorplanLayout(layout, rooms) {
  if (layout && Array.isArray(layout.floors) && layout.floors.length > 0) {
    const floors = layout.floors.map((floor, index) => ({
      id: floor?.id || `floor_${index + 1}`,
      name: floor?.name || `Floor ${index + 1}`,
      rooms: Array.isArray(floor?.rooms) ? floor.rooms : [],
      doors: Array.isArray(floor?.doors) ? floor.doors : [],
      windows: Array.isArray(floor?.windows) ? floor.windows : [],
      spaces: Array.isArray(floor?.spaces) ? floor.spaces : [],
      stairs: Array.isArray(floor?.stairs) ? floor.stairs : [],
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
          stairs: Array.isArray(layout.stairs) ? layout.stairs : [],
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
    floorplanLayout: applyLayoutRules(buildLayoutFromRooms(rooms)),
    inventoryReport: null,
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
  const [exportModalOpen, setExportModalOpen] = useState(false);
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

  useEffect(() => {
    if (!floors.some((floor) => floor.id === newRoomFloorId)) {
      setNewRoomFloorId(floors[0]?.id || "floor_1");
    }
  }, [floors, newRoomFloorId]);

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
      floorId: room.floorId && validFloorIds.has(room.floorId) ? room.floorId : fallbackFloorId,
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
      inventoryReport:
        nextHome.inventoryReport &&
        Array.isArray(nextHome.inventoryReport.rooms) &&
        typeof nextHome.inventoryReport.createdAt === "string"
          ? nextHome.inventoryReport
          : null,
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

  const addRoom = () => {
    const cleanName = newRoomName.trim();
    if (!cleanName) return;

    const roomId = `room_${slugify(cleanName)}_${Date.now()}`;

    updateHome((prev) => {
      const normalizedLayout = normalizeFloorplanLayout(prev.floorplanLayout, prev.rooms);
      const selectedFloorId =
        normalizedLayout.floors.some((floor) => floor.id === newRoomFloorId)
          ? newRoomFloorId
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

    setNewRoomName("");
    setSelectedRoomId(roomId);
    setFloorplanStep("draw");
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
      const safeWidth = Math.max(1, Math.min(20, Number.parseFloat(widthMeters) || 4));
      const safeHeight = Math.max(1, Math.min(20, Number.parseFloat(heightMeters) || 3));

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
          floors: normalizedLayout.floors.map((floor) => ({
            ...floor,
            rooms: floor.rooms.map((layoutRoom) =>
              layoutRoom.id === `layout_${roomId}`
                ? {
                    ...layoutRoom,
                    w: metersToPixels(safeWidth, layoutRoom.w),
                    h: metersToPixels(safeHeight, layoutRoom.h),
                  }
                : layoutRoom
            ),
          })),
        },
      };
    });
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
      floorplanLayout: applyLayoutRules(buildLayoutFromRooms(nextRooms)),
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

      const syncedRooms = prev.rooms.map((room) => {
        const layoutRoom = layoutRoomById[`layout_${room.id}`];
        if (!layoutRoom) return room;
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

  const compressImageFileToDataUrl = async (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Failed to read image"));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Invalid image"));
        img.onload = () => {
          const maxSize = 1280;
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
          resolve(canvas.toDataURL("image/jpeg", 0.78));
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

  const exportReportPdf = () => {
    const selectedKeys = Object.entries(reportSections)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key);
    if (!selectedKeys.length) return;

    const doc = new jsPDF();
    const generatedAt = new Date().toLocaleString();
    const safeHomeName = (home.name || "Home").replace(/[^\w\s-]/g, "").trim() || "home";
    let currentY = 32;

    doc.setFontSize(18);
    doc.text(`${home.name} - Property Report`, 14, 18);
    doc.setFontSize(10);
    doc.text(`Generated ${generatedAt}`, 14, 24);

    const addSectionHeading = (title) => {
      if (currentY > 260) {
        doc.addPage();
        currentY = 20;
      }
      doc.setFontSize(12);
      doc.setTextColor(20, 20, 20);
      doc.text(title, 14, currentY);
      currentY += 5;
    };

    const addTable = (head, body) => {
      autoTable(doc, {
        startY: currentY,
        head: [head],
        body,
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [31, 41, 55] },
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

      doc.setFontSize(14);
      doc.setTextColor(25, 25, 25);
      doc.text(`Floorplan: ${floor.name}`, margin, headerY);
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.25);
      doc.rect(drawX, drawY, drawWidth, drawHeight);

      (floor.rooms || []).forEach((room) => {
        const roomWidthMeters = pixelsToMeters(room.w, 4);
        const roomHeightMeters = pixelsToMeters(room.h, 3);
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(1.2);
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
        doc.setDrawColor(150, 100, 0);
        doc.setLineWidth(1);
        doc.line(sx(door.x), sy(door.y), sx(door.x + door.w), sy(door.y));
      });

      (floor.windows || []).forEach((windowItem) => {
        doc.setFillColor(200, 235, 255);
        doc.setDrawColor(14, 165, 233);
        doc.setLineWidth(0.8);
        doc.rect(
          sx(windowItem.x),
          sy(windowItem.y),
          Math.max(2, sw(windowItem.w)),
          Math.max(2, sw(windowItem.h)),
          "FD"
        );
      });

      (floor.spaces || []).forEach((space) => {
        doc.setFillColor(240, 240, 240);
        doc.setDrawColor(150, 150, 150);
        doc.setLineWidth(0.5);
        doc.rect(sx(space.x), sy(space.y), sw(space.w), sw(space.h), "FD");
        doc.setTextColor(90, 90, 90);
        doc.setFontSize(7);
        doc.text(
          String(space.label || "Space"),
          sx(space.x) + 1.5,
          sy(space.y) + 3.5,
          { maxWidth: Math.max(8, sw(space.w) - 3) }
        );
      });

      (floor.stairs || []).forEach((stairsItem) => {
        doc.setFillColor(220, 220, 220);
        doc.setDrawColor(90, 90, 90);
        doc.setLineWidth(0.8);
        doc.rect(sx(stairsItem.x), sy(stairsItem.y), sw(stairsItem.w), sw(stairsItem.h), "FD");
        doc.setTextColor(80, 80, 80);
        doc.setFontSize(7);
        doc.text(
          String(stairsItem.label || "Stairs"),
          sx(stairsItem.x) + 1.5,
          sy(stairsItem.y) + 3.5,
          { maxWidth: Math.max(8, sw(stairsItem.w) - 3) }
        );
      });
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
          return [[roomName, "-", "-", `Media: ${mediaCount} (${panoCount} pano)`]];
        }

        return roomInventory.items.map((item, index) => [
          index === 0 ? roomName : "",
          item.name || "-",
          item.condition || "-",
          `${item.notes || ""}${
            index === 0 ? ` ${item.notes ? "· " : ""}Media: ${mediaCount} (${panoCount} pano)` : ""
          }`,
        ]);
      });
      addTable(
        ["Room", "Element", "Condition", "Notes / Media"],
        inventoryBody.length ? inventoryBody : [["No inventory report", "-", "-", "-"]]
      );
    }

    const fileName = `${safeHomeName.toLowerCase().replace(/\s+/g, "_")}_property_report.pdf`;
    doc.save(fileName);
    setExportModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col">
      <div className="px-4 pt-3">
        <div className="mx-auto w-full max-w-[23rem] md:max-w-4xl lg:max-w-5xl rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 shadow-sm">
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <img
                src={`${process.env.PUBLIC_URL}/digifusebox-logo.png`}
                alt="DigiFuseBox logo"
                className="h-9 w-auto"
              />
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-zinc-700">{home.name}</p>
                <p className="truncate text-[10px] text-zinc-500">{userEmail || "Unknown"}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={onSignOut}
              className="h-8 rounded-lg bg-zinc-800 px-3 text-[11px] font-semibold text-white transition hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400"
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
                    value={selectedRoom.widthMeters ?? 4}
                    onChange={(event) =>
                      updateRoomMeasurements(
                        selectedRoom.id,
                        event.target.value,
                        selectedRoom.heightMeters ?? 3
                      )
                    }
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
                    value={selectedRoom.heightMeters ?? 3}
                    onChange={(event) =>
                      updateRoomMeasurements(
                        selectedRoom.id,
                        selectedRoom.widthMeters ?? 4,
                        event.target.value
                      )
                    }
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
            layout={home.floorplanLayout || buildLayoutFromRooms(home.rooms)}
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
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <img
                src={`${process.env.PUBLIC_URL}/digifusebox-logo.png`}
                alt="DigiFuseBox logo"
                className="h-10 w-auto"
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-zinc-700">Homes</p>
                <p className="truncate text-[10px] text-zinc-500">{userEmail || "Unknown"}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="h-8 rounded-lg bg-zinc-800 px-3 text-[11px] font-semibold text-white transition hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400"
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

    localStorage.setItem(
      getStorageKey(userId),
      JSON.stringify({
        homes,
        activeHomeId,
      })
    );
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
    <>
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
    </>
  );
}
