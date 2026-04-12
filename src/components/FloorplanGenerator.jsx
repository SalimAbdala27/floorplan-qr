import { useEffect, useMemo, useRef, useState } from "react";

const CANVAS_WIDTH = 420;
const CANVAS_HEIGHT = 640;
const ITEM_SAFE_MARGIN = 8;
const SNAP_DISTANCE = 10;
const PIXELS_PER_METER = 40;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(degrees) {
  let angle = Number.isFinite(Number(degrees)) ? Number(degrees) : 0;
  while (angle > 180) angle -= 360;
  while (angle < -180) angle += 360;
  return Math.round(angle);
}

function snapCardinalAngle(angle, threshold = 7) {
  const normalized = normalizeAngle(angle);
  const candidates = [0, 90, -90, 180, -180];
  let closest = normalized;
  let minDelta = Infinity;
  candidates.forEach((candidate) => {
    const delta = Math.abs(normalized - candidate);
    if (delta < minDelta) {
      minDelta = delta;
      closest = candidate;
    }
  });
  return minDelta <= threshold ? closest : normalized;
}

function normalizeItemForCanvas(type, item) {
  const angled = withAngle(item || {});
  const minSize = getMinSize(type);
  const maxWidth = Math.max(minSize.w, CANVAS_WIDTH - ITEM_SAFE_MARGIN * 2);
  const maxHeight = Math.max(minSize.h, CANVAS_HEIGHT - ITEM_SAFE_MARGIN * 2);
  const width = clamp(angled.w ?? minSize.w, minSize.w, maxWidth);
  const height = clamp(angled.h ?? minSize.h, minSize.h, maxHeight);
  const x = clamp(
    angled.x ?? ITEM_SAFE_MARGIN,
    ITEM_SAFE_MARGIN,
    Math.max(ITEM_SAFE_MARGIN, CANVAS_WIDTH - ITEM_SAFE_MARGIN - width)
  );
  const y = clamp(
    angled.y ?? ITEM_SAFE_MARGIN,
    ITEM_SAFE_MARGIN,
    Math.max(ITEM_SAFE_MARGIN, CANVAS_HEIGHT - ITEM_SAFE_MARGIN - height)
  );

  return {
    ...angled,
    x,
    y,
    w: clamp(width, minSize.w, CANVAS_WIDTH - ITEM_SAFE_MARGIN - x),
    h: clamp(height, minSize.h, CANVAS_HEIGHT - ITEM_SAFE_MARGIN - y),
  };
}

function baseFloor(id, name) {
  return {
    id,
    name,
    rooms: [],
    doors: [],
    windows: [],
    spaces: [],
    stairs: [],
  };
}

function normalizeFloor(floor, index) {
  return {
    id: floor?.id || `floor_${index + 1}`,
    name: floor?.name || `Floor ${index + 1}`,
    rooms: Array.isArray(floor?.rooms)
      ? floor.rooms.map((room) => normalizeItemForCanvas("rooms", room))
      : [],
    doors: Array.isArray(floor?.doors)
      ? floor.doors.map((door) => normalizeItemForCanvas("doors", door))
      : [],
    windows: Array.isArray(floor?.windows)
      ? floor.windows.map((windowItem) => normalizeItemForCanvas("windows", windowItem))
      : [],
    spaces: Array.isArray(floor?.spaces)
      ? floor.spaces.map((space) => normalizeItemForCanvas("spaces", space))
      : [],
    stairs: Array.isArray(floor?.stairs)
      ? floor.stairs.map((stairsItem) => normalizeItemForCanvas("stairs", stairsItem))
      : [],
  };
}

function normalizeLayout(layout) {
  if (Array.isArray(layout?.floors) && layout.floors.length > 0) {
    const floors = layout.floors.map(normalizeFloor);
    const hasActive = floors.some((floor) => floor.id === layout.activeFloorId);
    return {
      floors,
      activeFloorId: hasActive ? layout.activeFloorId : floors[0].id,
    };
  }

  const legacyFloor = {
    id: "floor_1",
    name: "Ground Floor",
    rooms: Array.isArray(layout?.rooms) ? layout.rooms : [],
    doors: Array.isArray(layout?.doors) ? layout.doors : [],
    windows: Array.isArray(layout?.windows) ? layout.windows : [],
    spaces: Array.isArray(layout?.spaces) ? layout.spaces : [],
  };

  return {
    floors: [legacyFloor],
    activeFloorId: legacyFloor.id,
  };
}

function getMinSize(type) {
  if (type === "rooms") return { w: 96, h: 76 };
  if (type === "spaces") return { w: 40, h: 26 };
  if (type === "stairs") return { w: 40, h: 40 };
  return { w: 22, h: 8 };
}

function withAngle(item) {
  return {
    ...item,
    angle: Number.isFinite(Number(item?.angle)) ? Number(item.angle) : 0,
  };
}

const QUICK_TOOL_GROUPS = [
  {
    title: "Kitchen",
    items: [
      { label: "Cabinets", w: 88, h: 26 },
      { label: "Sink", w: 64, h: 26 },
      { label: "Oven / Hob", w: 72, h: 26 },
      { label: "Fridge Space", w: 72, h: 26 },
    ],
  },
  {
    title: "Bathroom",
    items: [
      { label: "Toilet", w: 56, h: 24 },
      { label: "Sink", w: 56, h: 24 },
      { label: "Bath / Shower", w: 86, h: 26 },
    ],
  },
  {
    title: "Storage",
    items: [
      { label: "Wardrobe", w: 78, h: 26, buttonLabel: "Wardrobes" },
      { label: "Cupboard", w: 68, h: 24, buttonLabel: "Cupboards" },
    ],
  },
  {
    title: "Furniture",
    items: [
      { label: "Bed", w: 92, h: 42 },
      { label: "Sofa", w: 88, h: 34 },
      { label: "Table", w: 78, h: 34 },
      { label: "Chairs", w: 68, h: 28 },
    ],
  },
];

function ToolIcon({ name, className = "h-4 w-4" }) {
  const shared = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };

  if (name === "room") {
    return (
      <svg {...shared}>
        <rect x="4" y="5" width="16" height="14" rx="1.5" />
        <path d="M9 19v-4h6v4" />
      </svg>
    );
  }

  if (name === "door") {
    return (
      <svg {...shared}>
        <path d="M6 19V5h7v14" />
        <path d="M6 19h12" />
        <path d="M13 6c3.5 1.5 5 4.3 5 8" />
        <circle cx="11" cy="12" r="0.8" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (name === "window") {
    return (
      <svg {...shared}>
        <rect x="4" y="6" width="16" height="12" rx="1.5" />
        <path d="M12 6v12M4 12h16" />
      </svg>
    );
  }

  if (name === "stairs") {
    return (
      <svg {...shared}>
        <path d="M5 18h3v-3h3v-3h3V9h3V6h2" />
      </svg>
    );
  }

  if (name === "delete") {
    return (
      <svg {...shared}>
        <path d="M5 7h14" />
        <path d="M9 7V5h6v2" />
        <path d="M8 7l1 12h6l1-12" />
      </svg>
    );
  }

  if (name === "bed") {
    return (
      <svg {...shared}>
        <path d="M4 17v-6h16v6" />
        <path d="M7 11V8h4a2 2 0 0 1 2 2v1" />
        <path d="M4 17v2M20 17v2" />
      </svg>
    );
  }

  if (name === "sofa") {
    return (
      <svg {...shared}>
        <path d="M6 10V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
        <path d="M5 10h14a2 2 0 0 1 2 2v4H3v-4a2 2 0 0 1 2-2Z" />
      </svg>
    );
  }

  if (name === "table") {
    return (
      <svg {...shared}>
        <rect x="6" y="7" width="12" height="6" rx="1.5" />
        <path d="M8 13v4M16 13v4" />
      </svg>
    );
  }

  if (name === "chair") {
    return (
      <svg {...shared}>
        <path d="M8 11h8v4H8z" />
        <path d="M9 15v4M15 15v4M8 11V8h8v3" />
      </svg>
    );
  }

  if (name === "toilet") {
    return (
      <svg {...shared}>
        <path d="M9 6h6v4H9z" />
        <path d="M8 12a4 4 0 1 0 8 0v-1H8z" />
      </svg>
    );
  }

  if (name === "sink") {
    return (
      <svg {...shared}>
        <path d="M7 9h10v4a5 5 0 0 1-10 0V9Z" />
        <path d="M10 6c0-1.1.9-2 2-2s2 .9 2 2" />
      </svg>
    );
  }

  if (name === "bath") {
    return (
      <svg {...shared}>
        <rect x="5" y="9" width="14" height="6" rx="3" />
        <path d="M7 15v2M17 15v2" />
      </svg>
    );
  }

  if (name === "cabinet") {
    return (
      <svg {...shared}>
        <rect x="6" y="5" width="12" height="14" rx="1.5" />
        <path d="M12 5v14" />
      </svg>
    );
  }

  if (name === "oven") {
    return (
      <svg {...shared}>
        <rect x="6" y="5" width="12" height="14" rx="1.5" />
        <path d="M8 9h8M9 7h.01M12 7h.01M15 7h.01" />
      </svg>
    );
  }

  if (name === "fridge") {
    return (
      <svg {...shared}>
        <rect x="8" y="4" width="8" height="16" rx="1.5" />
        <path d="M8 11h8M14 8h.01M14 14h.01" />
      </svg>
    );
  }

  if (name === "info") {
    return (
      <svg {...shared}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 10v5" />
        <circle cx="12" cy="7" r="0.8" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  return (
    <svg {...shared}>
      <circle cx="12" cy="12" r="7" />
    </svg>
  );
}

export default function FloorplanGenerator({
  layout,
  onLayoutChange,
  availableRooms = [],
  onRoomFloorChange,
}) {
  const [selected, setSelected] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [isFullscreenEditor, setIsFullscreenEditor] = useState(false);
  const [previewFloorId, setPreviewFloorId] = useState(null);
  const [quickToolsOpen, setQuickToolsOpen] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [roomMeasurementDraft, setRoomMeasurementDraft] = useState({ width: "", height: "" });
  const [selectedPropertyDraft, setSelectedPropertyDraft] = useState({ w: "", h: "", angle: "" });
  const [zoom, setZoom] = useState(1);
  const [snapRotation, setSnapRotation] = useState(true);
  const [hasUserAdjustedZoom, setHasUserAdjustedZoom] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [isLandscape, setIsLandscape] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth > window.innerHeight;
  });

  const canvasRef = useRef(null);
  const viewportRef = useRef(null);
  const pinchStateRef = useRef({ startDistance: null, startZoom: 1 });
  const pendingHoldRef = useRef(null);
  const undoStackRef = useRef([]);
  const lastCommittedLayoutRef = useRef(null);

  const normalizedLayout = useMemo(() => normalizeLayout(layout), [layout]);
  const floors = normalizedLayout.floors;
  const activeFloorId = normalizedLayout.activeFloorId;
  const activeFloor =
    floors.find((floor) => floor.id === activeFloorId) || floors[0] || baseFloor("floor_1", "Ground Floor");
  const previewFloor =
    floors.find((floor) => floor.id === previewFloorId) ||
    activeFloor;

  const selectedItem = useMemo(() => {
    if (!selected) return null;
    if (selected.floorId !== activeFloor.id) return null;
    return activeFloor[selected.type]?.find((item) => item.id === selected.id) || null;
  }, [activeFloor, selected]);
  const selectedRoomWidthMeters =
    selected?.type === "rooms" && selectedItem ? Number((selectedItem.w / PIXELS_PER_METER).toFixed(2)) : 4;
  const selectedRoomHeightMeters =
    selected?.type === "rooms" && selectedItem ? Number((selectedItem.h / PIXELS_PER_METER).toFixed(2)) : 3;
  const selectedRoomId =
    selected?.type === "rooms" && selectedItem?.id?.startsWith("layout_")
      ? selectedItem.id.slice("layout_".length)
      : null;
  const fitZoom = useMemo(() => {
    if (!viewportWidth || !viewportHeight) return 1;
    const fitByWidth = (viewportWidth - 6) / CANVAS_WIDTH;
    const fitByHeight = (viewportHeight - 6) / CANVAS_HEIGHT;
    return Math.min(1, Math.max(0.35, Math.min(fitByWidth, fitByHeight)));
  }, [viewportWidth, viewportHeight]);
  const minZoom = 0.25;
  const maxZoom = 2;
  const effectiveZoom = zoom * fitZoom;

  useEffect(() => {
    if (!viewportWidth || !fitZoom || hasUserAdjustedZoom) return;
    const targetZoom = 1;
    setZoom(targetZoom);
  }, [viewportWidth, fitZoom, hasUserAdjustedZoom, minZoom, maxZoom]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setViewportWidth(entry.contentRect.width);
      setViewportHeight(entry.contentRect.height);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const clearDrag = () => {
      setDragging(null);
      if (pendingHoldRef.current?.timer) clearTimeout(pendingHoldRef.current.timer);
      pendingHoldRef.current = null;
    };
    window.addEventListener("pointerup", clearDrag);
    window.addEventListener("touchend", clearDrag);
    window.addEventListener("touchcancel", clearDrag);
    window.addEventListener("pointercancel", clearDrag);
    return () => {
      window.removeEventListener("pointerup", clearDrag);
      window.removeEventListener("touchend", clearDrag);
      window.removeEventListener("touchcancel", clearDrag);
      window.removeEventListener("pointercancel", clearDrag);
    };
  }, []);

  useEffect(() => {
    const handlePointerMove = (event) => {
      const pending = pendingHoldRef.current;
      if (!pending || pending.pointerId !== event.pointerId || dragging) return;
      const deltaX = event.clientX - pending.startClientX;
      const deltaY = event.clientY - pending.startClientY;
      if (Math.sqrt(deltaX * deltaX + deltaY * deltaY) > 10) {
        clearTimeout(pending.timer);
        pendingHoldRef.current = null;
      }
    };
    window.addEventListener("pointermove", handlePointerMove);
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [dragging]);

  useEffect(() => {
    if (!floors.length) {
      if (previewFloorId !== null) setPreviewFloorId(null);
      return;
    }

    if (!previewFloorId || !floors.some((floor) => floor.id === previewFloorId)) {
      setPreviewFloorId(activeFloor.id);
    }
  }, [floors, activeFloor.id, previewFloorId]);

  useEffect(() => {
    setPropertiesOpen(false);
  }, [selected?.floorId, selected?.id, selected?.type]);

  useEffect(() => {
    if (selected?.type !== "rooms" || !selectedItem) {
      setRoomMeasurementDraft({ width: "", height: "" });
      return;
    }

    setRoomMeasurementDraft({
      width: String(selectedRoomWidthMeters),
      height: String(selectedRoomHeightMeters),
    });
  }, [selected?.floorId, selected?.id, selected?.type, selectedItem, selectedRoomWidthMeters, selectedRoomHeightMeters]);

  useEffect(() => {
    if (!selectedItem || selected?.type === "rooms") {
      setSelectedPropertyDraft({ w: "", h: "", angle: "" });
      return;
    }

    setSelectedPropertyDraft({
      w: String(selectedItem.w ?? 0),
      h: String(selectedItem.h ?? 0),
      angle: String(selectedItem.angle ?? 0),
    });
  }, [selected?.floorId, selected?.id, selected?.type, selectedItem]);

  useEffect(() => {
    lastCommittedLayoutRef.current = normalizedLayout;
  }, [normalizedLayout]);

  useEffect(() => {
    const onResize = () => setIsLandscape(window.innerWidth > window.innerHeight);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  useEffect(() => {
    if (!isFullscreenEditor || typeof document === "undefined") return undefined;

    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyTouchAction = body.style.touchAction;
    const previousHtmlOverflow = documentElement.style.overflow;
    const previousHtmlOverscroll = documentElement.style.overscrollBehavior;

    body.style.overflow = "hidden";
    body.style.touchAction = "manipulation";
    documentElement.style.overflow = "hidden";
    documentElement.style.overscrollBehavior = "none";

    return () => {
      body.style.overflow = previousBodyOverflow;
      body.style.touchAction = previousBodyTouchAction;
      documentElement.style.overflow = previousHtmlOverflow;
      documentElement.style.overscrollBehavior = previousHtmlOverscroll;
    };
  }, [isFullscreenEditor]);

  const getSnapTargets = (ignoreType, ignoreId) =>
    ["rooms", "doors", "windows", "spaces", "stairs"]
      .flatMap((type) =>
        (activeFloor[type] || []).map((item) => ({
          type,
          id: item.id,
          left: item.x,
          right: item.x + item.w,
          top: item.y,
          bottom: item.y + item.h,
        }))
      )
      .filter((target) => !(target.type === ignoreType && target.id === ignoreId));

  const snapPosition = (type, id, x, y, w, h) => {
    const targets = getSnapTargets(type, id);
    let nextX = x;
    let nextY = y;
    let bestXDelta = SNAP_DISTANCE + 1;
    let bestYDelta = SNAP_DISTANCE + 1;

    const left = x;
    const right = x + w;
    const top = y;
    const bottom = y + h;

    targets.forEach((target) => {
      const xPairs = [
        { source: left, target: target.left, offset: 0 },
        { source: left, target: target.right, offset: 0 },
        { source: right, target: target.left, offset: -w },
        { source: right, target: target.right, offset: -w },
      ];
      xPairs.forEach((pair) => {
        const delta = Math.abs(pair.source - pair.target);
        if (delta <= SNAP_DISTANCE && delta < bestXDelta) {
          bestXDelta = delta;
          nextX = pair.target + pair.offset;
        }
      });

      const yPairs = [
        { source: top, target: target.top, offset: 0 },
        { source: top, target: target.bottom, offset: 0 },
        { source: bottom, target: target.top, offset: -h },
        { source: bottom, target: target.bottom, offset: -h },
      ];
      yPairs.forEach((pair) => {
        const delta = Math.abs(pair.source - pair.target);
        if (delta <= SNAP_DISTANCE && delta < bestYDelta) {
          bestYDelta = delta;
          nextY = pair.target + pair.offset;
        }
      });
    });

    return {
      x: clamp(
        Math.round(nextX),
        ITEM_SAFE_MARGIN,
        Math.max(ITEM_SAFE_MARGIN, CANVAS_WIDTH - ITEM_SAFE_MARGIN - w)
      ),
      y: clamp(
        Math.round(nextY),
        ITEM_SAFE_MARGIN,
        Math.max(ITEM_SAFE_MARGIN, CANVAS_HEIGHT - ITEM_SAFE_MARGIN - h)
      ),
    };
  };

  const cloneLayout = (value) => JSON.parse(JSON.stringify(value));

  const commitLayout = (next, { recordUndo = true } = {}) => {
    if (recordUndo && lastCommittedLayoutRef.current) {
      undoStackRef.current = [...undoStackRef.current, cloneLayout(lastCommittedLayoutRef.current)].slice(-30);
    }
    lastCommittedLayoutRef.current = next;
    onLayoutChange(next);
  };

  const undoLayoutChange = () => {
    const previousLayout = undoStackRef.current.at(-1);
    if (!previousLayout) return;
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    setSelected(null);
    setDragging(null);
    setQuickToolsOpen(false);
    lastCommittedLayoutRef.current = previousLayout;
    onLayoutChange(previousLayout);
  };

  const setActiveFloor = (nextFloorId) => {
    setSelected(null);
    commitLayout({
      ...normalizedLayout,
      activeFloorId: nextFloorId,
    });
  };

  const updateActiveFloor = (mutator) => {
    const nextFloors = floors.map((floor) => (floor.id === activeFloor.id ? mutator(floor) : floor));
    commitLayout({
      floors: nextFloors,
      activeFloorId,
    });
  };

  const upsertArray = (type, updater) => {
    updateActiveFloor((floor) => ({
      ...floor,
      [type]: updater(floor[type] || []).map((item) => normalizeItemForCanvas(type, item)),
    }));
  };

  const addFloor = () => {
    const id = `floor_${Date.now()}`;
    commitLayout({
      floors: [...floors, baseFloor(id, `Floor ${floors.length + 1}`)],
      activeFloorId: id,
    });
    setSelected(null);
  };

  const removeActiveFloor = () => {
    if (floors.length <= 1) return;
    const activeIndex = floors.findIndex((floor) => floor.id === activeFloor.id);
    const nextFloors = floors.filter((floor) => floor.id !== activeFloor.id);
    const fallbackFloor = nextFloors[Math.max(0, activeIndex - 1)] || nextFloors[0];
    setSelected(null);
    commitLayout({
      floors: nextFloors,
      activeFloorId: fallbackFloor?.id || nextFloors[0]?.id || "floor_1",
    });
  };

  const addItem = (type) => {
    const id = type === "rooms" ? `layout_room_${Date.now()}` : `${type}_${Date.now()}`;

    const itemMap = {
      rooms: {
        id,
        name: `Room ${((activeFloor.rooms || []).length || 0) + 1}`,
        x: 36,
        y: 36,
        w: 180,
        h: 130,
        angle: 0,
      },
      doors: {
        id,
        x: 90,
        y: 190,
        w: 42,
        h: 24,
        label: "Door",
        angle: 0,
        flip: false,
      },
      windows: {
        id,
        x: 160,
        y: 40,
        w: 42,
        h: 8,
        label: "Window",
        angle: 0,
      },
      spaces: {
        id,
        x: 240,
        y: 120,
        w: 110,
        h: 40,
        label: "Space",
        angle: 0,
      },
      stairs: {
        id,
        x: 30,
        y: 30,
        w: 60,
        h: 60,
        label: "Stairs",
        angle: 0,
      },
    };

    upsertArray(type, (items) => [...items, itemMap[type]]);
    setSelected({ type, id, floorId: activeFloor.id });
  };

  const addLabeledSpace = (label, width = 90, height = 34) => {
    const item = normalizeItemForCanvas("spaces", {
      id: `spaces_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      x: 48,
      y: 48,
      w: width,
      h: height,
      label,
      angle: 0,
    });
    upsertArray("spaces", (items) => [...items, item]);
    setSelected({ type: "spaces", id: item.id, floorId: activeFloor.id });
  };

  const editorPrimaryTools = [
    {
      key: "rooms",
      label: "Room",
      icon: "room",
      onClick: () => addItem("rooms"),
      className: "bg-zinc-800 text-white",
    },
    {
      key: "doors",
      label: "Door",
      icon: "door",
      onClick: () => addItem("doors"),
      className: "border border-zinc-200 bg-zinc-50 text-zinc-700",
    },
    {
      key: "windows",
      label: "Window",
      icon: "window",
      onClick: () => addItem("windows"),
      className: "border border-zinc-200 bg-zinc-50 text-zinc-700",
    },
    {
      key: "stairs",
      label: "Stairs",
      icon: "stairs",
      onClick: () => addItem("stairs"),
      className: "border border-zinc-200 bg-zinc-50 text-zinc-700",
    },
  ];

  const quickSpaceTools = QUICK_TOOL_GROUPS.flatMap((group) =>
    group.items.map((item) => ({
      key: `${group.title}-${item.label}`,
      label: item.buttonLabel || item.label,
      previewLabel: item.label,
      icon:
        item.label.includes("Bed") ? "bed" :
        item.label.includes("Sofa") ? "sofa" :
        item.label.includes("Table") ? "table" :
        item.label.includes("Chair") ? "chair" :
        item.label.includes("Toilet") ? "toilet" :
        item.label.includes("Sink") ? "sink" :
        item.label.includes("Bath") || item.label.includes("Shower") ? "bath" :
        item.label.includes("Cabinet") || item.label.includes("Wardrobe") || item.label.includes("Cupboard") ? "cabinet" :
        item.label.includes("Oven") || item.label.includes("Hob") ? "oven" :
        item.label.includes("Fridge") ? "fridge" :
        "room",
      onClick: () => addLabeledSpace(item.label, item.w, item.h),
    }))
  );

  const removeSelected = () => {
    if (!selected) return;
    upsertArray(selected.type, (items) => items.filter((item) => item.id !== selected.id));
    setSelected(null);
  };

  const mainEditorTools = [
    ...editorPrimaryTools,
    {
      key: "delete",
      label: "Delete",
      icon: "delete",
      onClick: removeSelected,
      disabled: !selectedItem,
      className: "bg-red-100 text-red-700 disabled:opacity-50",
    },
  ];

  const updateSelected = (patch) => {
    if (!selected) return;
    upsertArray(selected.type, (items) =>
      items.map((item) =>
        item.id === selected.id
          ? {
              ...item,
              ...patch,
            }
          : item
      )
    );
  };

  const commitSelectedRoomMeasurementDraft = (dimension) => {
    if (selected?.type !== "rooms" || !selectedItem) return;

    const draftValue = roomMeasurementDraft[dimension];
    const parsed = Number.parseFloat(draftValue);
    if (!Number.isFinite(parsed)) {
      setRoomMeasurementDraft((prev) => ({
        ...prev,
        [dimension]: String(dimension === "width" ? selectedRoomWidthMeters : selectedRoomHeightMeters),
      }));
      return;
    }

    const minMeters =
      dimension === "width"
        ? Number((getMinSize("rooms").w / PIXELS_PER_METER).toFixed(1))
        : Number((getMinSize("rooms").h / PIXELS_PER_METER).toFixed(1));
    const clampedMeters = clamp(parsed, minMeters, 20);

    updateSelected({
      [dimension === "width" ? "w" : "h"]: clamp(
        Math.round(clampedMeters * PIXELS_PER_METER),
        dimension === "width" ? getMinSize("rooms").w : getMinSize("rooms").h,
        800
      ),
    });
  };

  const commitSelectedPropertyDraft = (key) => {
    if (!selectedItem || !selected || selected.type === "rooms") return;

    const draftValue = selectedPropertyDraft[key];
    const parsed = Number.parseFloat(draftValue);
    if (!Number.isFinite(parsed)) {
      setSelectedPropertyDraft((prev) => ({
        ...prev,
        [key]: String(selectedItem[key] ?? 0),
      }));
      return;
    }

    updateSelected({
      [key]:
        key === "angle"
          ? clamp(parsed, -180, 180)
          : clamp(
              Math.round(parsed),
              key === "w" ? getMinSize(selected.type).w : getMinSize(selected.type).h,
              800
            ),
    });
  };

  const moveSelectedRoomToFloor = (nextFloorId) => {
    if (selected?.type !== "rooms" || !selectedItem) return;
    if (!floors.some((floor) => floor.id === nextFloorId)) return;

    const nextFloors = floors.map((floor) => ({
      ...floor,
      rooms: (floor.rooms || []).filter((room) => room.id !== selectedItem.id),
    }));

    const targetIndex = nextFloors.findIndex((floor) => floor.id === nextFloorId);
    nextFloors[targetIndex] = {
      ...nextFloors[targetIndex],
      rooms: [...(nextFloors[targetIndex].rooms || []), normalizeItemForCanvas("rooms", selectedItem)],
    };

    commitLayout({
      floors: nextFloors,
      activeFloorId: nextFloorId,
    });
    setSelected({
      type: "rooms",
      id: selectedItem.id,
      floorId: nextFloorId,
    });
    if (selectedRoomId && onRoomFloorChange) {
      onRoomFloorChange(selectedRoomId, nextFloorId);
    }
  };

  const updateItemPosition = (type, id, x, y) => {
    upsertArray(type, (items) =>
      items.map((item) =>
        item.id === id
          ? {
              ...item,
              x,
              y,
            }
          : item
      )
    );
  };

  const updateItemSize = (type, id, w, h) => {
    upsertArray(type, (items) =>
      items.map((item) =>
        item.id === id
          ? {
              ...item,
              w,
              h,
            }
          : item
      )
    );
  };

  const getCanvasPoint = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / effectiveZoom,
      y: (event.clientY - rect.top) / effectiveZoom,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
    };
  };

  const beginMoveDrag = (event, type, item) => {
    event.preventDefault();
    event.stopPropagation();

    const point = getCanvasPoint(event);
    if (!point) return;

    setSelected({ type, id: item.id, floorId: activeFloor.id });
    setDragging({
      mode: "move",
      type,
      id: item.id,
      offsetX: point.x - item.x,
      offsetY: point.y - item.y,
      itemWidth: item.w,
      itemHeight: item.h,
    });
  };

  const startMoveDrag = (event, type, item) => {
    setSelected({ type, id: item.id, floorId: activeFloor.id });

    if (event.pointerType === "touch") {
      event.preventDefault();
      event.stopPropagation();
      if (pendingHoldRef.current?.timer) clearTimeout(pendingHoldRef.current.timer);
      pendingHoldRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        timer: setTimeout(() => {
          beginMoveDrag(event, type, item);
          pendingHoldRef.current = null;
        }, 180),
      };
      return;
    }

    beginMoveDrag(event, type, item);
  };

  const startResizeDrag = (event, type, item) => {
    event.preventDefault();
    event.stopPropagation();

    const point = getCanvasPoint(event);
    if (!point) return;

    setSelected({ type, id: item.id, floorId: activeFloor.id });
    setDragging({
      mode: "resize",
      type,
      id: item.id,
      startX: point.x,
      startY: point.y,
      startW: item.w,
      startH: item.h,
      itemX: item.x,
      itemY: item.y,
    });
  };

  const onCanvasPointerMove = (event) => {
    if (!dragging) return;
    const point = getCanvasPoint(event);
    if (!point) return;

    if (dragging.mode === "move") {
      const maxX = Math.max(0, point.width - dragging.itemWidth);
      const maxY = Math.max(0, point.height - dragging.itemHeight);
      const rawX = clamp(Math.round(point.x - dragging.offsetX), 0, maxX);
      const rawY = clamp(Math.round(point.y - dragging.offsetY), 0, maxY);
      const snapped = snapPosition(
        dragging.type,
        dragging.id,
        rawX,
        rawY,
        dragging.itemWidth,
        dragging.itemHeight
      );
      updateItemPosition(dragging.type, dragging.id, snapped.x, snapped.y);
      return;
    }

    if (dragging.mode === "rotate") {
      const currentPointerAngle = Math.atan2(point.y - dragging.centerY, point.x - dragging.centerX);
      const deltaRadians = currentPointerAngle - dragging.startPointerAngle;
      const deltaDegrees = (deltaRadians * 180) / Math.PI;
      const rawAngle = normalizeAngle((dragging.startItemAngle || 0) + deltaDegrees);
      const nextAngle = snapRotation ? snapCardinalAngle(rawAngle) : rawAngle;
      upsertArray(dragging.type, (items) =>
        items.map((item) =>
          item.id === dragging.id
            ? {
                ...item,
                angle: nextAngle,
              }
            : item
        )
      );
      return;
    }

    const minSize = getMinSize(dragging.type);
    const deltaX = point.x - dragging.startX;
    const deltaY = point.y - dragging.startY;
    const maxWidth = CANVAS_WIDTH - dragging.itemX;
    const maxHeight = CANVAS_HEIGHT - dragging.itemY;
    let nextW = clamp(Math.round(dragging.startW + deltaX), minSize.w, maxWidth);
    let nextH = clamp(Math.round(dragging.startH + deltaY), minSize.h, maxHeight);

    const targets = getSnapTargets(dragging.type, dragging.id);
    const rightEdge = dragging.itemX + nextW;
    const bottomEdge = dragging.itemY + nextH;

    targets.forEach((target) => {
      const rightDeltas = [
        Math.abs(rightEdge - target.left),
        Math.abs(rightEdge - target.right),
      ];
      const minRightDelta = Math.min(...rightDeltas);
      if (minRightDelta <= SNAP_DISTANCE) {
        const snapTo = rightDeltas[0] <= rightDeltas[1] ? target.left : target.right;
        nextW = clamp(Math.round(snapTo - dragging.itemX), minSize.w, maxWidth);
      }

      const bottomDeltas = [
        Math.abs(bottomEdge - target.top),
        Math.abs(bottomEdge - target.bottom),
      ];
      const minBottomDelta = Math.min(...bottomDeltas);
      if (minBottomDelta <= SNAP_DISTANCE) {
        const snapTo = bottomDeltas[0] <= bottomDeltas[1] ? target.top : target.bottom;
        nextH = clamp(Math.round(snapTo - dragging.itemY), minSize.h, maxHeight);
      }
    });

    updateItemSize(dragging.type, dragging.id, nextW, nextH);
  };

  const stopDrag = () => {
    if (pendingHoldRef.current?.timer) clearTimeout(pendingHoldRef.current.timer);
    pendingHoldRef.current = null;
    if (!dragging) return;
    setDragging(null);
  };

  const distance = (touchA, touchB) => {
    const dx = touchB.clientX - touchA.clientX;
    const dy = touchB.clientY - touchA.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const onCanvasTouchStart = (event) => {
    if (event.touches.length !== 2) return;
    pinchStateRef.current = {
      startDistance: distance(event.touches[0], event.touches[1]),
      startZoom: zoom,
    };
  };

  const onCanvasTouchMove = (event) => {
    if (event.touches.length !== 2) return;
    event.preventDefault();
    const currentDistance = distance(event.touches[0], event.touches[1]);
    const { startDistance, startZoom } = pinchStateRef.current;
    if (!startDistance) return;
    const ratio = currentDistance / startDistance;
    setHasUserAdjustedZoom(true);
    setZoom(clamp(Number((startZoom * ratio).toFixed(2)), minZoom, maxZoom));
  };

  const onCanvasTouchEnd = (event) => {
    if (event.touches.length < 2) {
      pinchStateRef.current = {
        startDistance: null,
        startZoom: zoom,
      };
    }
  };

  const selectedStyle = "ring-2 ring-emerald-500";
  const getItemStyle = (item) => ({
    left: item.x,
    top: item.y,
    width: item.w,
    height: item.h,
    transform: `rotate(${item.angle || 0}deg)`,
    transformOrigin: "center center",
  });

  const renderResizeHandle = (type, item) =>
    selected?.floorId === activeFloor.id && selected?.type === type && selected?.id === item.id ? (
      <span
        onPointerDown={(event) => startResizeDrag(event, type, item)}
        className="absolute -bottom-3 -right-3 h-7 w-7 cursor-se-resize rounded-lg border-2 border-emerald-700 bg-emerald-500 shadow"
      />
    ) : null;

  const startRotateDrag = (event, type, item) => {
    event.preventDefault();
    event.stopPropagation();
    const point = getCanvasPoint(event);
    if (!point) return;
    const centerX = item.x + item.w / 2;
    const centerY = item.y + item.h / 2;
    const startPointerAngle = Math.atan2(point.y - centerY, point.x - centerX);
    setSelected({ type, id: item.id, floorId: activeFloor.id });
    setDragging({
      mode: "rotate",
      type,
      id: item.id,
      centerX,
      centerY,
      startPointerAngle,
      startItemAngle: item.angle || 0,
    });
  };

  const renderRotateHandle = (type, item) =>
    selected?.floorId === activeFloor.id && selected?.type === type && selected?.id === item.id ? (
      <span
        onPointerDown={(event) => startRotateDrag(event, type, item)}
        className="absolute -top-8 left-1/2 h-7 w-7 -translate-x-1/2 cursor-grab rounded-full border-2 border-blue-700 bg-blue-500 shadow"
      />
    ) : null;

  const renderSpaceSymbol = (item) => {
    const label = String(item.label || "").toLowerCase();

    if (label.includes("bed")) {
      return (
        <svg viewBox="0 0 120 60" className="pointer-events-none absolute inset-0 h-full w-full">
          <rect x="10" y="10" width="100" height="40" fill="#fff" stroke="#333" strokeWidth="2" />
          <rect x="14" y="14" width="26" height="14" fill="#f4f4f5" stroke="#555" strokeWidth="1.2" />
        </svg>
      );
    }
    if (label.includes("sofa")) {
      return (
        <svg viewBox="0 0 120 60" className="pointer-events-none absolute inset-0 h-full w-full">
          <rect x="18" y="20" width="84" height="24" rx="3" fill="#fff" stroke="#333" strokeWidth="2" />
          <rect x="10" y="22" width="10" height="20" fill="#fff" stroke="#333" strokeWidth="2" />
          <rect x="100" y="22" width="10" height="20" fill="#fff" stroke="#333" strokeWidth="2" />
        </svg>
      );
    }
    if (label.includes("table")) {
      return (
        <svg viewBox="0 0 120 60" className="pointer-events-none absolute inset-0 h-full w-full">
          <rect x="26" y="12" width="68" height="36" fill="#fff" stroke="#333" strokeWidth="2" />
        </svg>
      );
    }
    if (label.includes("chair")) {
      return (
        <svg viewBox="0 0 120 60" className="pointer-events-none absolute inset-0 h-full w-full">
          <rect x="42" y="18" width="36" height="24" fill="#fff" stroke="#333" strokeWidth="2" />
          <line x1="46" y1="42" x2="46" y2="52" stroke="#333" strokeWidth="2" />
          <line x1="74" y1="42" x2="74" y2="52" stroke="#333" strokeWidth="2" />
        </svg>
      );
    }
    if (label.includes("toilet")) {
      return (
        <svg viewBox="0 0 120 60" className="pointer-events-none absolute inset-0 h-full w-full">
          <rect x="44" y="8" width="32" height="16" fill="#fff" stroke="#333" strokeWidth="2" />
          <ellipse cx="60" cy="38" rx="20" ry="14" fill="#fff" stroke="#333" strokeWidth="2" />
        </svg>
      );
    }
    if (label.includes("bath") || label.includes("shower")) {
      return (
        <svg viewBox="0 0 120 60" className="pointer-events-none absolute inset-0 h-full w-full">
          <rect x="12" y="12" width="96" height="36" rx="8" fill="#fff" stroke="#333" strokeWidth="2" />
        </svg>
      );
    }
    if (label.includes("sink")) {
      return (
        <svg viewBox="0 0 120 60" className="pointer-events-none absolute inset-0 h-full w-full">
          <rect x="34" y="12" width="52" height="36" fill="#fff" stroke="#333" strokeWidth="2" />
          <circle cx="60" cy="30" r="8" fill="none" stroke="#333" strokeWidth="1.4" />
        </svg>
      );
    }
    if (label.includes("cabinet") || label.includes("wardrobe") || label.includes("cupboard")) {
      return (
        <svg viewBox="0 0 120 60" className="pointer-events-none absolute inset-0 h-full w-full">
          <rect x="10" y="10" width="100" height="40" fill="#fff" stroke="#333" strokeWidth="2" />
          <line x1="60" y1="10" x2="60" y2="50" stroke="#333" strokeWidth="1.2" />
        </svg>
      );
    }
    if (label.includes("oven") || label.includes("hob")) {
      return (
        <svg viewBox="0 0 120 60" className="pointer-events-none absolute inset-0 h-full w-full">
          <rect x="20" y="10" width="80" height="40" fill="#fff" stroke="#333" strokeWidth="2" />
          <circle cx="46" cy="24" r="4" fill="none" stroke="#333" strokeWidth="1.2" />
          <circle cx="74" cy="24" r="4" fill="none" stroke="#333" strokeWidth="1.2" />
          <rect x="40" y="32" width="40" height="12" fill="none" stroke="#333" strokeWidth="1.2" />
        </svg>
      );
    }
    if (label.includes("fridge")) {
      return (
        <svg viewBox="0 0 120 60" className="pointer-events-none absolute inset-0 h-full w-full">
          <rect x="38" y="8" width="44" height="44" fill="#fff" stroke="#333" strokeWidth="2" />
          <line x1="38" y1="30" x2="82" y2="30" stroke="#333" strokeWidth="1.2" />
        </svg>
      );
    }
    return null;
  };

  const hasSpaceSymbol = (item) => Boolean(renderSpaceSymbol(item));

  const renderRoom = (room) => (
    <button
      key={room.id}
      type="button"
      onClick={() => setSelected({ type: "rooms", id: room.id, floorId: activeFloor.id })}
      onPointerDown={(event) => startMoveDrag(event, "rooms", room)}
      className={`absolute box-border select-none rounded-md border-[4px] border-black bg-white px-2 py-1 text-center text-[11px] font-semibold text-zinc-800 transition ${
        selected?.floorId === activeFloor.id && selected?.type === "rooms" && selected?.id === room.id
          ? selectedStyle
          : ""
      }`}
      style={{ ...getItemStyle(room), userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
    >
      <span className="block truncate">{room.name}</span>
      <span className="block text-[10px] font-medium text-zinc-500">
        {Number((room.w / PIXELS_PER_METER).toFixed(1))}m x {Number((room.h / PIXELS_PER_METER).toFixed(1))}m
      </span>
      {renderResizeHandle("rooms", room)}
      {renderRotateHandle("rooms", room)}
    </button>
  );

  const renderDoor = (door) => (
    <button
      key={door.id}
      type="button"
      onClick={() => setSelected({ type: "doors", id: door.id, floorId: activeFloor.id })}
      onPointerDown={(event) => startMoveDrag(event, "doors", door)}
      className={`absolute box-border select-none rounded-none bg-transparent ${
        selected?.floorId === activeFloor.id && selected?.type === "doors" && selected?.id === door.id
          ? selectedStyle
          : ""
      }`}
      style={{ ...getItemStyle(door), userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
      title={door.label || "Door"}
    >
      <svg
        viewBox={`0 0 ${Math.max(door.w, 24)} ${Math.max(door.h, 20)}`}
        className="pointer-events-none h-full w-full"
      >
        <rect
          x="4"
          y={Math.max(door.h, 20) - 8}
          width={Math.max(door.w, 24) - 8}
          height="8"
          fill="#ffffff"
        />
        <rect
          x="1"
          y={Math.max(door.h, 20) - 7}
          width="5"
          height="7"
          fill="#111"
        />
        <rect
          x={Math.max(door.w, 24) - 6}
          y={Math.max(door.h, 20) - 7}
          width="5"
          height="7"
          fill="#111"
        />
        <line
          x1={door.flip ? Math.max(door.w, 24) - 2 : 2}
          y1={Math.max(door.h, 20) - 2}
          x2={door.flip ? 2 : Math.max(door.w, 24) - 2}
          y2="4"
          stroke="#222"
          strokeWidth="1.4"
        />
        <path
          d={
            door.flip
              ? `M ${Math.max(door.w, 24) - 2} ${Math.max(door.h, 20) - 2} A ${Math.max(door.w, 24) - 4} ${Math.max(
                  door.h,
                  20
                ) - 6} 0 0 0 2 4`
              : `M 2 ${Math.max(door.h, 20) - 2} A ${Math.max(door.w, 24) - 4} ${Math.max(
                  door.h,
                  20
                ) - 6} 0 0 1 ${Math.max(door.w, 24) - 2} 4`
          }
          fill="none"
          stroke="#666"
          strokeDasharray="2 2"
          strokeWidth="1.2"
        />
      </svg>
      {renderResizeHandle("doors", door)}
      {renderRotateHandle("doors", door)}
    </button>
  );

  const renderWindow = (windowItem) => (
    <button
      key={windowItem.id}
      type="button"
      onClick={() =>
        setSelected({ type: "windows", id: windowItem.id, floorId: activeFloor.id })
      }
      onPointerDown={(event) => startMoveDrag(event, "windows", windowItem)}
      className={`absolute box-border select-none rounded-[1px] border-[3px] border-black bg-white ${
        selected?.floorId === activeFloor.id &&
        selected?.type === "windows" &&
        selected?.id === windowItem.id
          ? selectedStyle
          : ""
      }`}
      style={{ ...getItemStyle(windowItem), userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
      title={windowItem.label || "Window"}
    >
      <span className="pointer-events-none absolute inset-y-[1px] left-[33%] w-px bg-black" />
      <span className="pointer-events-none absolute inset-y-[1px] left-[66%] w-px bg-black" />
      {renderResizeHandle("windows", windowItem)}
      {renderRotateHandle("windows", windowItem)}
    </button>
  );

  const renderSpace = (item) => (
    <button
      key={item.id}
      type="button"
      onClick={() => setSelected({ type: "spaces", id: item.id, floorId: activeFloor.id })}
      onPointerDown={(event) => startMoveDrag(event, "spaces", item)}
      className={`absolute box-border select-none rounded ${
        hasSpaceSymbol(item)
          ? "border-2 border-zinc-700 bg-white"
          : "border border-dashed border-zinc-500 bg-zinc-100/80"
      } text-[10px] font-semibold text-zinc-700 ${
        selected?.floorId === activeFloor.id && selected?.type === "spaces" && selected?.id === item.id
          ? selectedStyle
          : ""
      }`}
      style={{ ...getItemStyle(item), userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
    >
      {renderSpaceSymbol(item)}
      <span className="absolute bottom-0.5 left-0 right-0 block truncate px-1 text-center">
        {item.label || "Space"}
      </span>
      {renderResizeHandle("spaces", item)}
      {renderRotateHandle("spaces", item)}
    </button>
  );

  const renderStairs = (item) => (
    <button
      key={item.id}
      type="button"
      onClick={() => setSelected({ type: "stairs", id: item.id, floorId: activeFloor.id })}
      onPointerDown={(event) => startMoveDrag(event, "stairs", item)}
      className={`absolute box-border select-none rounded border border-zinc-700 bg-white text-[10px] font-semibold text-zinc-800 ${
        selected?.floorId === activeFloor.id && selected?.type === "stairs" && selected?.id === item.id
          ? selectedStyle
          : ""
      }`}
      style={{ ...getItemStyle(item), userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
      title={item.label || "Stairs"}
    >
      <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full">
        {[12, 28, 44, 60, 76].map((stepX, index) => (
          <path
            key={`step-${item.id}-${stepX}`}
            d={`M ${stepX} 82 L ${stepX} ${20 + index * 10} L ${stepX + 12} ${20 + index * 10}`}
            fill="none"
            stroke="#111"
            strokeWidth="4"
            strokeLinecap="round"
          />
        ))}
      </svg>
      <span className="absolute bottom-1 left-0 right-0 block truncate px-1 text-center">{item.label || "Stairs"}</span>
      {renderResizeHandle("stairs", item)}
      {renderRotateHandle("stairs", item)}
    </button>
  );

  const renderDrawingCanvas = ({ preview = false, className = "", floor = activeFloor } = {}) => {
    const scale = preview ? Math.min(0.74, effectiveZoom) : effectiveZoom;
    return (
      <div
        ref={preview ? undefined : viewportRef}
        className={`overflow-hidden rounded-lg border-2 border-zinc-400 bg-white shadow-inner ${className}`}
      >
        <div className="h-full w-full bg-zinc-100">
          <div
            style={{
              width: CANVAS_WIDTH * scale,
              height: CANVAS_HEIGHT * scale,
              margin: "0 auto",
            }}
          >
            <div
              ref={preview ? undefined : canvasRef}
              onPointerDown={
                preview
                  ? undefined
                  : (event) => {
                      if (event.target === event.currentTarget) {
                        setSelected(null);
                        setDragging(null);
                      }
                    }
              }
              onPointerMove={preview ? undefined : onCanvasPointerMove}
              onPointerUp={preview ? undefined : stopDrag}
              onPointerCancel={preview ? undefined : stopDrag}
              onPointerLeave={preview ? undefined : stopDrag}
              onTouchStart={preview ? undefined : onCanvasTouchStart}
              onTouchMove={preview ? undefined : onCanvasTouchMove}
              onTouchEnd={preview ? undefined : onCanvasTouchEnd}
              className={`relative origin-top-left border-2 border-dashed border-zinc-400 bg-zinc-50 ${preview ? "pointer-events-none" : ""}`}
              style={{
                width: CANVAS_WIDTH,
                height: CANVAS_HEIGHT,
                transform: `scale(${scale})`,
                touchAction: preview ? "auto" : dragging ? "none" : "pan-y pinch-zoom",
                userSelect: "none",
                WebkitUserSelect: "none",
                WebkitTouchCallout: "none",
              }}
            >
              {(floor.rooms || []).map(renderRoom)}
              {(floor.doors || []).map(renderDoor)}
              {(floor.windows || []).map(renderWindow)}
              {(floor.spaces || []).map(renderSpace)}
              {(floor.stairs || []).map(renderStairs)}
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!isFullscreenEditor) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
              Floorplan Preview
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Open fullscreen to edit rooms, tools, and symbols.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsFullscreenEditor(true)}
            className="h-10 rounded-lg bg-zinc-800 px-3 text-xs font-semibold text-white"
          >
            Open Fullscreen
          </button>
        </div>
        {floors.length > 1 ? (
          <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
            {floors.map((floor) => (
              <button
                key={`preview-floor-${floor.id}`}
                type="button"
                onClick={() => setPreviewFloorId(floor.id)}
                className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${
                  floor.id === previewFloor.id ? "bg-zinc-800 text-white" : "bg-zinc-200 text-zinc-700"
                }`}
              >
                {floor.name}
              </button>
            ))}
          </div>
        ) : null}
        {renderDrawingCanvas({ preview: true, className: "mt-2 h-[320px]", floor: previewFloor })}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 h-[100dvh] overflow-hidden overscroll-none bg-white">
      <div className="flex h-full min-h-0 flex-col">
        <div className="sticky top-0 z-20 border-b border-zinc-200 bg-white px-2 py-2" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">Floors</p>
              <div className="mt-1 flex min-w-0 gap-1 overflow-x-auto pb-1">
                {floors.map((floor) => (
                  <button
                    key={floor.id}
                    type="button"
                    onClick={() => setActiveFloor(floor.id)}
                    className={`h-9 shrink-0 rounded-xl px-3 text-[11px] font-semibold ${
                      floor.id === activeFloor.id ? "bg-zinc-800 text-white" : "bg-zinc-200 text-zinc-700"
                    }`}
                  >
                    {floor.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid w-full shrink-0 grid-cols-2 gap-2 sm:w-auto sm:grid-cols-4 lg:flex">
              <button
                type="button"
                onClick={undoLayoutChange}
                disabled={undoStackRef.current.length === 0}
                className="h-9 rounded-xl bg-zinc-100 px-3 text-[11px] font-semibold text-zinc-700 disabled:opacity-50"
              >
                Undo
              </button>
              <button
                type="button"
                onClick={addFloor}
                className="h-9 rounded-xl bg-zinc-100 px-3 text-[11px] font-semibold text-zinc-700"
              >
                + Floor
              </button>
              <button
                type="button"
                onClick={removeActiveFloor}
                disabled={floors.length <= 1}
                className="h-9 rounded-xl bg-red-100 px-3 text-[11px] font-semibold text-red-700 disabled:opacity-50"
              >
                Delete Floor
              </button>
              <button
                type="button"
                onClick={() => setIsFullscreenEditor(false)}
                className="h-9 rounded-xl bg-zinc-800 px-3 text-[11px] font-semibold text-white"
              >
                Done
              </button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 flex-1 text-[11px] text-zinc-500">
              Drag to move. Green handle resizes. Blue handle rotates.
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setHasUserAdjustedZoom(true);
                  setZoom((prev) => clamp(Number((prev - 0.05).toFixed(2)), minZoom, maxZoom));
                }}
                className="h-8 w-8 rounded-lg bg-zinc-200 text-sm font-bold text-zinc-700"
              >
                -
              </button>
              <span className="min-w-[44px] text-center text-[11px] font-semibold text-zinc-600">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => {
                  setHasUserAdjustedZoom(false);
                  setZoom(1);
                }}
                className="h-8 rounded-lg bg-zinc-100 px-2.5 text-[11px] font-semibold text-zinc-700"
              >
                Fit
              </button>
              <button
                type="button"
                onClick={() => {
                  setHasUserAdjustedZoom(true);
                  setZoom((prev) => clamp(Number((prev + 0.05).toFixed(2)), minZoom, maxZoom));
                }}
                className="h-8 w-8 rounded-lg bg-zinc-200 text-sm font-bold text-zinc-700"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => setSnapRotation((prev) => !prev)}
                className={`h-8 rounded-lg px-2.5 text-[11px] font-semibold ${
                  snapRotation ? "bg-zinc-800 text-white" : "bg-zinc-200 text-zinc-700"
                }`}
              >
                Snap {snapRotation ? "ON" : "OFF"}
              </button>
            </div>
          </div>
          <div className="mt-2 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sky-900">
            <ToolIcon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-[11px] font-medium">
              Press and hold an item, then move it. Tap once to select it and edit its properties.
            </p>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-neutral-100" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div
            className={`h-full p-2 ${
              selectedItem && propertiesOpen
                ? quickToolsOpen
                  ? "pb-[344px]"
                  : "pb-[240px]"
                : quickToolsOpen
                  ? "pb-[224px]"
                  : "pb-[132px]"
            }`}
          >
            {renderDrawingCanvas({ className: "h-full" })}
          </div>

          {quickToolsOpen ? (
            <div className="absolute inset-x-2 bottom-[116px] rounded-2xl border border-zinc-200 bg-white/98 p-3 shadow-lg backdrop-blur">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                    Quick Add
                  </p>
                  <p className="text-[11px] text-zinc-500">Tap to place common estate-agent items fast.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickToolsOpen(false)}
                  className="h-8 rounded-lg bg-zinc-100 px-3 text-[11px] font-semibold text-zinc-700"
                >
                  Close
                </button>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {quickSpaceTools.map((tool) => (
                  <button
                    key={`quick-panel-${tool.key}`}
                    type="button"
                    onClick={() => {
                      tool.onClick();
                      setQuickToolsOpen(false);
                    }}
                    className="rounded-xl border border-zinc-200 bg-zinc-50 px-2 py-3 text-[11px] font-semibold text-zinc-700"
                  >
                  <span className="mb-1 flex justify-center">
                    <span className="relative h-6 w-8 overflow-hidden">
                      {renderSpaceSymbol({ label: tool.previewLabel }) || <ToolIcon name={tool.icon} className="h-5 w-5" />}
                    </span>
                  </span>
                  {tool.label}
                </button>
              ))}
              </div>
            </div>
          ) : null}

          {selectedItem ? (
            <div
              className={`absolute z-10 ${
                isLandscape ? "left-1/2 w-[420px] max-w-[calc(100%-16px)] -translate-x-1/2" : "left-2 right-2"
              } bottom-[124px]`}
            >
              <div className="rounded-2xl border border-zinc-200 bg-white/98 p-3 shadow-lg backdrop-blur">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">Selection</p>
                    <p className="text-xs font-semibold text-zinc-800">
                      {selectedItem.name || selectedItem.label || "Selected item"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPropertiesOpen((prev) => !prev)}
                      className="h-8 rounded-lg bg-zinc-100 px-3 text-[11px] font-semibold text-zinc-700"
                    >
                    {propertiesOpen ? "Hide" : "Show"}
                    </button>
                    <button
                      type="button"
                      onClick={removeSelected}
                      className="h-8 rounded-lg bg-red-100 px-3 text-[11px] font-semibold text-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {propertiesOpen ? (
                  <>
                    <input
                      value={selectedItem.name || selectedItem.label || ""}
                      onChange={(event) =>
                        updateSelected(
                          selected?.type === "rooms" ? { name: event.target.value } : { label: event.target.value }
                        )
                      }
                      className="mt-3 h-9 w-full rounded-xl border border-zinc-300 px-3 text-sm"
                    />

                    {selected?.type === "rooms" ? (
                      <>
                        <select
                          value={selected.floorId || activeFloor.id}
                          onChange={(event) => moveSelectedRoomToFloor(event.target.value)}
                          className="mt-2 h-9 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm"
                        >
                          {floors.map((floor) => (
                            <option key={`fs-floor-${floor.id}`} value={floor.id}>
                              {floor.name}
                            </option>
                          ))}
                        </select>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <label className="text-[11px] font-medium text-zinc-600">
                            Width (m)
                            <input
                              type="number"
                              step="0.1"
                              min={Number((getMinSize("rooms").w / PIXELS_PER_METER).toFixed(1))}
                              max="20"
                              value={roomMeasurementDraft.width}
                              onChange={(event) =>
                                setRoomMeasurementDraft((prev) => ({
                                  ...prev,
                                  width: event.target.value,
                                }))
                              }
                              onBlur={() => commitSelectedRoomMeasurementDraft("width")}
                              onKeyDown={(event) => {
                                event.stopPropagation();
                                if (event.key === "Enter") {
                                  event.currentTarget.blur();
                                }
                              }}
                              className="mt-1 h-10 w-full rounded-xl border border-zinc-300 px-3 text-sm"
                            />
                          </label>
                          <label className="text-[11px] font-medium text-zinc-600">
                            Height (m)
                            <input
                              type="number"
                              step="0.1"
                              min={Number((getMinSize("rooms").h / PIXELS_PER_METER).toFixed(1))}
                              max="20"
                              value={roomMeasurementDraft.height}
                              onChange={(event) =>
                                setRoomMeasurementDraft((prev) => ({
                                  ...prev,
                                  height: event.target.value,
                                }))
                              }
                              onBlur={() => commitSelectedRoomMeasurementDraft("height")}
                              onKeyDown={(event) => {
                                event.stopPropagation();
                                if (event.key === "Enter") {
                                  event.currentTarget.blur();
                                }
                              }}
                              className="mt-1 h-10 w-full rounded-xl border border-zinc-300 px-3 text-sm"
                            />
                          </label>
                          <label className="col-span-2 text-[11px] font-medium text-zinc-600">
                            Rotation
                            <input
                              type="number"
                              step="1"
                              min="-180"
                              max="180"
                              value={selectedPropertyDraft.angle}
                              onChange={(event) =>
                                setSelectedPropertyDraft((prev) => ({
                                  ...prev,
                                  angle: event.target.value,
                                }))
                              }
                              onBlur={() => commitSelectedPropertyDraft("angle")}
                              onKeyDown={(event) => {
                                event.stopPropagation();
                                if (event.key === "Enter") {
                                  event.currentTarget.blur();
                                }
                              }}
                              className="mt-1 h-10 w-full rounded-xl border border-zinc-300 px-3 text-sm"
                            />
                          </label>
                        </div>
                      </>
                    ) : (
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {["w", "h", "angle"].map((key) => (
                          <input
                            key={`prop-${key}`}
                            type="number"
                            value={selectedPropertyDraft[key]}
                            onChange={(event) =>
                              setSelectedPropertyDraft((prev) => ({
                                ...prev,
                                [key]: event.target.value,
                              }))
                            }
                            onBlur={() => commitSelectedPropertyDraft(key)}
                            onKeyDown={(event) => {
                              event.stopPropagation();
                              if (event.key === "Enter") {
                                event.currentTarget.blur();
                              }
                            }}
                            className="h-9 rounded-xl border border-zinc-300 px-2 text-sm"
                          />
                        ))}
                        {selected?.type === "doors" ? (
                          <button
                            type="button"
                            onClick={() => updateSelected({ flip: !selectedItem.flip })}
                            className="col-span-3 h-10 rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm font-semibold text-zinc-700"
                          >
                            {selectedItem.flip ? "Flip Door Back" : "Flip Door Opening"}
                          </button>
                        ) : null}
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="absolute inset-x-0 bottom-0 border-t border-zinc-200 bg-white/98 px-2 py-2 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur">
            <div className="grid grid-cols-5 gap-2">
              {mainEditorTools.map((tool) => (
                <button
                  key={`toolbar-${tool.key}`}
                  type="button"
                  onClick={tool.onClick}
                  disabled={tool.disabled}
                  className={`flex h-11 flex-col items-center justify-center rounded-xl px-2 text-[11px] font-semibold ${tool.className || "border border-zinc-200 bg-zinc-50 text-zinc-700"}`}
                >
                  <ToolIcon name={tool.icon} className="mb-0.5 h-4 w-4" />
                  {tool.label}
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setQuickToolsOpen((prev) => !prev)}
                className={`h-10 rounded-xl px-3 text-xs font-semibold ${
                  quickToolsOpen ? "bg-zinc-800 text-white" : "bg-zinc-100 text-zinc-700"
                }`}
              >
                {quickToolsOpen ? "Hide Quick Add" : "Quick Add Items"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!selectedItem) return;
                  setPropertiesOpen((prev) => !prev);
                }}
                disabled={!selectedItem}
                className="h-10 rounded-xl bg-zinc-100 px-3 text-xs font-semibold text-zinc-700 disabled:opacity-50"
              >
                {selectedItem ? (propertiesOpen ? "Hide Selection" : "Show Selection") : "Select Item"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
