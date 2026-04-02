import { useEffect, useMemo, useRef, useState } from "react";

const CANVAS_WIDTH = 420;
const CANVAS_HEIGHT = 640;
const ITEM_SAFE_MARGIN = 8;
const SNAP_DISTANCE = 10;
const PIXELS_PER_METER = 40;
const CENTIMETERS_PER_PIXEL = 100 / PIXELS_PER_METER;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseNumber(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDecimal(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeItemForCanvas(type, item) {
  const minSize = getMinSize(type);
  const maxWidth = Math.max(minSize.w, CANVAS_WIDTH - ITEM_SAFE_MARGIN * 2);
  const maxHeight = Math.max(minSize.h, CANVAS_HEIGHT - ITEM_SAFE_MARGIN * 2);
  const width = clamp(item.w ?? minSize.w, minSize.w, maxWidth);
  const height = clamp(item.h ?? minSize.h, minSize.h, maxHeight);
  const x = clamp(
    item.x ?? ITEM_SAFE_MARGIN,
    ITEM_SAFE_MARGIN,
    Math.max(ITEM_SAFE_MARGIN, CANVAS_WIDTH - ITEM_SAFE_MARGIN - width)
  );
  const y = clamp(
    item.y ?? ITEM_SAFE_MARGIN,
    ITEM_SAFE_MARGIN,
    Math.max(ITEM_SAFE_MARGIN, CANVAS_HEIGHT - ITEM_SAFE_MARGIN - height)
  );

  return {
    ...item,
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
  if (type === "rooms") return { w: 70, h: 55 };
  if (type === "spaces") return { w: 40, h: 26 };
  if (type === "stairs") return { w: 40, h: 40 };
  return { w: 22, h: 8 };
}

export default function FloorplanGenerator({
  layout,
  onLayoutChange,
  availableRooms = [],
  onRoomFloorChange,
}) {
  const [selected, setSelected] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [hasUserAdjustedZoom, setHasUserAdjustedZoom] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [floorNameDraft, setFloorNameDraft] = useState("");

  const canvasRef = useRef(null);
  const viewportRef = useRef(null);
  const pinchStateRef = useRef({ startDistance: null, startZoom: 1 });

  const normalizedLayout = useMemo(() => normalizeLayout(layout), [layout]);
  const floors = normalizedLayout.floors;
  const activeFloorId = normalizedLayout.activeFloorId;
  const activeFloor =
    floors.find((floor) => floor.id === activeFloorId) || floors[0] || baseFloor("floor_1", "Ground Floor");

  const selectedItem = useMemo(() => {
    if (!selected) return null;
    if (selected.floorId !== activeFloor.id) return null;
    return activeFloor[selected.type]?.find((item) => item.id === selected.id) || null;
  }, [activeFloor, selected]);
  const selectedRoomWidthMeters =
    selected?.type === "rooms" && selectedItem ? Number((selectedItem.w / PIXELS_PER_METER).toFixed(2)) : null;
  const selectedRoomHeightMeters =
    selected?.type === "rooms" && selectedItem ? Number((selectedItem.h / PIXELS_PER_METER).toFixed(2)) : null;
  const selectedWindowWidthCm =
    selected?.type === "windows" && selectedItem
      ? Math.round(selectedItem.w * CENTIMETERS_PER_PIXEL)
      : null;
  const selectedWindowHeightCm =
    selected?.type === "windows" && selectedItem
      ? Math.round(selectedItem.h * CENTIMETERS_PER_PIXEL)
      : null;
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
  const minZoom = 0.5;
  const maxZoom = 1;
  const effectiveZoom = zoom * fitZoom;

  useEffect(() => {
    if (!viewportWidth || !fitZoom || hasUserAdjustedZoom) return;
    const targetZoom = 0.8;
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

  const commitLayout = (next) => {
    onLayoutChange(next);
  };

  const setActiveFloor = (nextFloorId) => {
    setSelected(null);
    setFloorNameDraft("");
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

  const removeCurrentFloor = () => {
    if (floors.length <= 1) return;
    const nextFloors = floors.filter((floor) => floor.id !== activeFloor.id);
    commitLayout({
      floors: nextFloors,
      activeFloorId: nextFloors[0].id,
    });
    setSelected(null);
  };

  const saveFloorName = () => {
    const clean = floorNameDraft.trim();
    if (!clean) {
      setFloorNameDraft("");
      return;
    }

    updateActiveFloor((floor) => ({
      ...floor,
      name: clean,
    }));

    setFloorNameDraft("");
  };

  const addItem = (type) => {
    const id = type === "rooms" ? `layout_room_${Date.now()}` : `${type}_${Date.now()}`;

    const itemMap = {
      rooms: {
        id,
        name: `Room ${((activeFloor.rooms || []).length || 0) + 1}`,
        x: 36,
        y: 36,
        w: 160,
        h: 110,
      },
      doors: {
        id,
        x: 90,
        y: 190,
        w: 34,
        h: 8,
        label: "Door",
      },
      windows: {
        id,
        x: 160,
        y: 40,
        w: 42,
        h: 8,
        label: "Window",
      },
      spaces: {
        id,
        x: 240,
        y: 120,
        w: 110,
        h: 40,
        label: "Space",
      },
      stairs: {
        id,
        x: 30,
        y: 30,
        w: 60,
        h: 60,
        label: "Stairs",
      },
    };

    upsertArray(type, (items) => [...items, itemMap[type]]);
    setSelected({ type, id, floorId: activeFloor.id });
  };

  const removeSelected = () => {
    if (!selected) return;
    upsertArray(selected.type, (items) => items.filter((item) => item.id !== selected.id));
    setSelected(null);
  };

  const updateSelected = (patch) => {
    if (!selected) return;
    upsertArray(selected.type, (items) =>
      items.map((item) => (item.id === selected.id ? { ...item, ...patch } : item))
    );
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

  const isOverlapping = (a, b) =>
    !(
      a.x + a.w <= b.x ||
      b.x + b.w <= a.x ||
      a.y + a.h <= b.y ||
      b.y + b.h <= a.y
    );

  const moveSelectedRoomToFloor = (nextFloorId) => {
    if (selected?.type !== "rooms" || !selectedItem) return;
    const targetFloorExists = floors.some((floor) => floor.id === nextFloorId);
    if (!targetFloorExists) return;

    const nextFloors = floors.map((floor) => ({
      ...floor,
      rooms: (floor.rooms || []).filter((room) => room.id !== selectedItem.id),
    }));

    const targetIndex = nextFloors.findIndex((floor) => floor.id === nextFloorId);
    const targetFloor = nextFloors[targetIndex];
    const occupiedRooms = targetFloor.rooms || [];

    let candidate = normalizeItemForCanvas("rooms", { ...selectedItem });
    let guard = 0;
    while (guard < 40) {
      let hasOverlap = false;
      for (const room of occupiedRooms) {
        if (isOverlapping(candidate, room)) {
          hasOverlap = true;
          break;
        }
      }
      if (!hasOverlap) break;

      candidate = normalizeItemForCanvas("rooms", {
        ...candidate,
        x: candidate.x + 24,
        y: candidate.y + 24,
      });
      guard += 1;
    }

    nextFloors[targetIndex] = {
      ...targetFloor,
      rooms: [...occupiedRooms, candidate],
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

  const startMoveDrag = (event, type, item) => {
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

  const adjustSelectedSize = (deltaW, deltaH) => {
    if (!selectedItem || !selected) return;
    const minSize = getMinSize(selected.type);
    const nextW = clamp(selectedItem.w + deltaW, minSize.w, CANVAS_WIDTH - selectedItem.x);
    const nextH = clamp(selectedItem.h + deltaH, minSize.h, CANVAS_HEIGHT - selectedItem.y);
    updateSelected({ w: nextW, h: nextH });
  };

  const selectedStyle = "ring-2 ring-emerald-500";

  const renderResizeHandle = (type, item) =>
    selected?.floorId === activeFloor.id && selected?.type === type && selected?.id === item.id ? (
      <span
        onPointerDown={(event) => startResizeDrag(event, type, item)}
        className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-se-resize rounded-sm border border-emerald-700 bg-emerald-500"
      />
    ) : null;

  const renderRoom = (room) => (
    <button
      key={room.id}
      type="button"
      onClick={() => setSelected({ type: "rooms", id: room.id, floorId: activeFloor.id })}
      onPointerDown={(event) => startMoveDrag(event, "rooms", room)}
      className={`absolute box-border rounded-[4px] border-[5px] border-black bg-white px-1 text-center text-[10px] font-semibold text-zinc-800 shadow-sm transition ${
        selected?.floorId === activeFloor.id && selected?.type === "rooms" && selected?.id === room.id
          ? selectedStyle
          : ""
      }`}
      style={{ left: room.x, top: room.y, width: room.w, height: room.h }}
    >
      <span className="block truncate">{room.name}</span>
      {renderResizeHandle("rooms", room)}
    </button>
  );

  const renderDoor = (door) => (
    <button
      key={door.id}
      type="button"
      onClick={() => setSelected({ type: "doors", id: door.id, floorId: activeFloor.id })}
      onPointerDown={(event) => startMoveDrag(event, "doors", door)}
      className={`absolute box-border rounded-none border-t-[3px] border-black bg-amber-100 ${
        selected?.floorId === activeFloor.id && selected?.type === "doors" && selected?.id === door.id
          ? selectedStyle
          : ""
      }`}
      style={{ left: door.x, top: door.y, width: door.w, height: door.h }}
      title={door.label || "Door"}
    >
      <span className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full border border-black border-t-0 bg-transparent" />
      {renderResizeHandle("doors", door)}
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
      className={`absolute box-border rounded-sm border-[2px] border-sky-700 bg-sky-100 ${
        selected?.floorId === activeFloor.id &&
        selected?.type === "windows" &&
        selected?.id === windowItem.id
          ? selectedStyle
          : ""
      }`}
      style={{ left: windowItem.x, top: windowItem.y, width: windowItem.w, height: windowItem.h }}
      title={windowItem.label || "Window"}
    >
      {renderResizeHandle("windows", windowItem)}
    </button>
  );

  const renderSpace = (item) => (
    <button
      key={item.id}
      type="button"
      onClick={() => setSelected({ type: "spaces", id: item.id, floorId: activeFloor.id })}
      onPointerDown={(event) => startMoveDrag(event, "spaces", item)}
      className={`absolute box-border rounded border border-dashed border-zinc-500 bg-zinc-100/80 text-[10px] font-semibold text-zinc-700 ${
        selected?.floorId === activeFloor.id && selected?.type === "spaces" && selected?.id === item.id
          ? selectedStyle
          : ""
      }`}
      style={{ left: item.x, top: item.y, width: item.w, height: item.h }}
    >
      <span className="block truncate px-1">{item.label || "Space"}</span>
      {renderResizeHandle("spaces", item)}
    </button>
  );

  const renderStairs = (item) => (
    <button
      key={item.id}
      type="button"
      onClick={() => setSelected({ type: "stairs", id: item.id, floorId: activeFloor.id })}
      onPointerDown={(event) => startMoveDrag(event, "stairs", item)}
      className={`absolute box-border rounded border border-zinc-700 bg-zinc-200 text-[10px] font-semibold text-zinc-800 ${
        selected?.floorId === activeFloor.id && selected?.type === "stairs" && selected?.id === item.id
          ? selectedStyle
          : ""
      }`}
      style={{ left: item.x, top: item.y, width: item.w, height: item.h }}
      title={item.label || "Stairs"}
    >
      <span className="block truncate px-1">{item.label || "Stairs"}</span>
      {renderResizeHandle("stairs", item)}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-zinc-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">Floors</p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={addFloor}
              className="h-8 rounded-lg bg-zinc-800 px-2.5 text-[11px] font-semibold text-white"
            >
              Add Floor
            </button>
            <button
              type="button"
              onClick={removeCurrentFloor}
              disabled={floors.length <= 1}
              className="h-8 rounded-lg bg-red-100 px-2.5 text-[11px] font-semibold text-red-700 disabled:opacity-40"
            >
              Remove
            </button>
          </div>
        </div>

        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {floors.map((floor) => (
            <button
              key={floor.id}
              type="button"
              onClick={() => setActiveFloor(floor.id)}
              className={`h-8 shrink-0 rounded-lg px-3 text-[11px] font-semibold ${
                floor.id === activeFloor.id ? "bg-zinc-800 text-white" : "bg-zinc-200 text-zinc-700"
              }`}
            >
              {floor.name}
            </button>
          ))}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <input
            value={floorNameDraft}
            onChange={(event) => setFloorNameDraft(event.target.value)}
            placeholder={`Rename ${activeFloor.name}`}
            className="h-9 flex-1 rounded-lg border border-zinc-300 px-2 text-xs"
          />
          <button
            type="button"
            onClick={saveFloorName}
            className="h-9 rounded-lg bg-zinc-200 px-3 text-[11px] font-semibold text-zinc-700"
          >
            Save
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">Tools</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => addItem("rooms")} className="h-9 rounded-lg bg-zinc-800 text-xs font-semibold text-white">Add Room</button>
          <button type="button" onClick={() => addItem("doors")} className="h-9 rounded-lg bg-zinc-200 text-xs font-semibold text-zinc-700">Add Door</button>
          <button type="button" onClick={() => addItem("windows")} className="h-9 rounded-lg bg-zinc-200 text-xs font-semibold text-zinc-700">Add Window</button>
          <button type="button" onClick={() => addItem("spaces")} className="h-9 rounded-lg bg-zinc-200 text-xs font-semibold text-zinc-700">Add Space</button>
          <button type="button" onClick={() => addItem("stairs")} className="h-9 rounded-lg bg-zinc-200 text-xs font-semibold text-zinc-700">Add Stairs</button>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">Drawing</p>
          <div className="flex items-center gap-1.5">
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
            <span className="min-w-[52px] text-center text-[11px] font-semibold text-zinc-600">
              {Math.round(zoom * 100)}%
            </span>
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
          </div>
        </div>
        <p className="mt-1 text-[11px] text-zinc-500">Drag items freely. Boxes snap when close. Drag green corner to resize.</p>

        <div
          ref={viewportRef}
          className="mt-2 h-[520px] md:h-[640px] overflow-hidden rounded-lg border border-zinc-300 bg-white"
        >
          <div className="h-full w-full bg-zinc-50">
            <div
              style={{
                width: CANVAS_WIDTH * effectiveZoom,
                height: CANVAS_HEIGHT * effectiveZoom,
                margin: "0 auto",
              }}
            >
            <div
              ref={canvasRef}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={stopDrag}
              onPointerCancel={stopDrag}
              onPointerLeave={stopDrag}
              onTouchStart={onCanvasTouchStart}
              onTouchMove={onCanvasTouchMove}
              onTouchEnd={onCanvasTouchEnd}
              className="relative origin-top-left bg-zinc-50 touch-none"
              style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, transform: `scale(${effectiveZoom})` }}
            >
              {(activeFloor.rooms || []).map(renderRoom)}
              {(activeFloor.doors || []).map(renderDoor)}
              {(activeFloor.windows || []).map(renderWindow)}
              {(activeFloor.spaces || []).map(renderSpace)}
              {(activeFloor.stairs || []).map(renderStairs)}
            </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">Properties</p>
          <button type="button" onClick={removeSelected} disabled={!selectedItem} className="h-8 rounded-lg bg-red-100 px-2.5 text-[11px] font-semibold text-red-700 disabled:opacity-50">Delete</button>
        </div>

        {selectedItem ? (
          <div className="mt-2 space-y-2">
            <label className="block text-[10px] text-zinc-500">
              Label / Name
              <input
                value={selectedItem.name || selectedItem.label || ""}
                onChange={(event) =>
                  updateSelected(
                    selected.type === "rooms" ? { name: event.target.value } : { label: event.target.value }
                  )
                }
                className="mt-1 h-9 w-full rounded-lg border border-zinc-300 px-2 text-xs"
                list={selected.type === "rooms" ? "room-name-options" : undefined}
              />
              {selected.type === "rooms" ? (
                <datalist id="room-name-options">
                  {availableRooms.map((roomName) => (
                    <option key={roomName} value={roomName} />
                  ))}
                </datalist>
              ) : null}
            </label>

            {selected.type !== "rooms" ? (
              <div className="grid grid-cols-2 gap-2">
                {["x", "y", "w", "h"].map((key) => (
                  <label key={key} className="block text-[10px] text-zinc-500 uppercase">
                    {key}
                    <input
                      type="number"
                      value={selectedItem[key]}
                      onChange={(event) =>
                        updateSelected({
                          [key]: clamp(parseNumber(event.target.value, selectedItem[key]), 0, 800),
                        })
                      }
                      className="mt-1 h-9 w-full rounded-lg border border-zinc-300 px-2 text-xs"
                    />
                  </label>
                ))}
              </div>
            ) : null}

            {selected.type === "rooms" ? (
              <div className="space-y-2">
                <label className="block text-[10px] text-zinc-500">
                  Floor
                  <select
                    value={selected?.floorId || activeFloor.id}
                    onChange={(event) => moveSelectedRoomToFloor(event.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-zinc-300 bg-white px-2 text-xs"
                  >
                    {floors.map((floor) => (
                      <option key={`properties-floor-${floor.id}`} value={floor.id}>
                        {floor.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-2">
                <label className="block text-[10px] text-zinc-500">
                  Room Width (m)
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    max="20"
                    value={selectedRoomWidthMeters ?? 4}
                    onChange={(event) =>
                      updateSelected({
                        w: clamp(
                          Math.round(parseDecimal(event.target.value, selectedRoomWidthMeters || 4) * PIXELS_PER_METER),
                          40,
                          800
                        ),
                      })
                    }
                    className="mt-1 h-9 w-full rounded-lg border border-zinc-300 px-2 text-xs"
                  />
                </label>
                <label className="block text-[10px] text-zinc-500">
                  Room Height (m)
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    max="20"
                    value={selectedRoomHeightMeters ?? 3}
                    onChange={(event) =>
                      updateSelected({
                        h: clamp(
                          Math.round(parseDecimal(event.target.value, selectedRoomHeightMeters || 3) * PIXELS_PER_METER),
                          40,
                          800
                        ),
                      })
                    }
                    className="mt-1 h-9 w-full rounded-lg border border-zinc-300 px-2 text-xs"
                  />
                </label>
                </div>
              </div>
            ) : null}

            {selected.type === "windows" ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-[10px] text-zinc-500">
                  Window Width (cm)
                  <input
                    type="number"
                    min="20"
                    max="400"
                    value={selectedWindowWidthCm ?? 100}
                    onChange={(event) =>
                      updateSelected({
                        w: clamp(
                          Math.round(parseDecimal(event.target.value, selectedWindowWidthCm || 100) / CENTIMETERS_PER_PIXEL),
                          8,
                          500
                        ),
                      })
                    }
                    className="mt-1 h-9 w-full rounded-lg border border-zinc-300 px-2 text-xs"
                  />
                </label>
                <label className="block text-[10px] text-zinc-500">
                  Window Height (cm)
                  <input
                    type="number"
                    min="10"
                    max="120"
                    value={selectedWindowHeightCm ?? 20}
                    onChange={(event) =>
                      updateSelected({
                        h: clamp(
                          Math.round(parseDecimal(event.target.value, selectedWindowHeightCm || 20) / CENTIMETERS_PER_PIXEL),
                          4,
                          120
                        ),
                      })
                    }
                    className="mt-1 h-9 w-full rounded-lg border border-zinc-300 px-2 text-xs"
                  />
                </label>
              </div>
            ) : null}

            {selected.type !== "rooms" ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => adjustSelectedSize(-10, 0)}
                  className="h-8 rounded-lg bg-zinc-200 text-[11px] font-semibold text-zinc-700"
                >
                  Width -
                </button>
                <button
                  type="button"
                  onClick={() => adjustSelectedSize(10, 0)}
                  className="h-8 rounded-lg bg-zinc-200 text-[11px] font-semibold text-zinc-700"
                >
                  Width +
                </button>
                <button
                  type="button"
                  onClick={() => adjustSelectedSize(0, -10)}
                  className="h-8 rounded-lg bg-zinc-200 text-[11px] font-semibold text-zinc-700"
                >
                  Height -
                </button>
                <button
                  type="button"
                  onClick={() => adjustSelectedSize(0, 10)}
                  className="h-8 rounded-lg bg-zinc-200 text-[11px] font-semibold text-zinc-700"
                >
                  Height +
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-xs text-zinc-500">Tap an item in the drawing to edit it.</p>
        )}
      </div>
    </div>
  );
}
