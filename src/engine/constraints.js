import { generateLayout } from "./layout";

const ROOM_TYPES = ["bedroom", "kitchen", "bathroom", "stairs", "living", "hallway"];
const GRID = 40;
const BATHROOM_NEAR_DISTANCE = GRID * 4;

function inferRoomType(name = "") {
  const value = String(name).toLowerCase();
  if (value.includes("hall") || value.includes("landing")) return "hallway";
  if (value.includes("bed") || value.includes("ensuite")) return "bedroom";
  if (value.includes("kitchen") || value.includes("utility")) return "kitchen";
  if (value.includes("bath") || value.includes("toilet") || value.includes("wc")) return "bathroom";
  if (value.includes("stair")) return "stairs";
  if (value.includes("living") || value.includes("lounge") || value.includes("dining")) return "living";
  return "living";
}

function sanitizeRoomName(name) {
  const value = String(name || "").trim();
  if (!value) return "Room";
  if (value.startsWith("layout_room_")) return "Room";
  return value;
}

function clonePlan(plan) {
  return {
    floors: (plan?.floors || []).map((floor) => floor.map((room) => ({ ...room }))),
  };
}

function ensureFloor(plan, floorIndex) {
  while (plan.floors.length <= floorIndex) plan.floors.push([]);
}

function snapToGrid(value) {
  return Math.round(Number(value || 0) / GRID) * GRID;
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeRoom(room, fallbackFloor) {
  const type = ROOM_TYPES.includes(room?.type) ? room.type : inferRoomType(room?.name || room?.id || "");
  return {
    id: String(room?.id || `room_${Date.now()}`),
    name: sanitizeRoomName(room?.name || "Room"),
    type,
    floor: clampNumber(room?.floor, 0, 32, fallbackFloor),
    x: snapToGrid(clampNumber(room?.x, 0, 3000, GRID)),
    y: snapToGrid(clampNumber(room?.y, 0, 3000, GRID)),
    width: Math.max(GRID, snapToGrid(clampNumber(room?.width, GRID, 3000, GRID * 4))),
    height: Math.max(GRID, snapToGrid(clampNumber(room?.height, GRID, 3000, GRID * 3))),
  };
}

function flattenWithLocations(plan) {
  return plan.floors.flatMap((floorRooms, floorIndex) =>
    floorRooms.map((room) => ({ room, floorIndex }))
  );
}

function moveRoom(plan, roomId, toFloor) {
  ensureFloor(plan, toFloor);
  let found = null;

  plan.floors = plan.floors.map((floorRooms) =>
    floorRooms.filter((room) => {
      if (room.id !== roomId) return true;
      found = room;
      return false;
    })
  );

  if (found) {
    found.floor = toFloor;
    plan.floors[toFloor].push(found);
  }
}

function overlap(a, b) {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

function distance(a, b) {
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

function resolveOverlapsOnFloor(floorRooms) {
  const rooms = floorRooms.map((room) => ({ ...room }));
  for (let i = 0; i < rooms.length; i += 1) {
    for (let j = i + 1; j < rooms.length; j += 1) {
      const a = rooms[i];
      const b = rooms[j];
      if (!overlap(a, b)) continue;

      b.x = snapToGrid(a.x + a.width + GRID);
      if (overlap(a, b)) {
        b.x = snapToGrid(b.x + GRID * 2);
        b.y = snapToGrid(a.y + a.height + GRID);
      }
    }
  }
  return rooms;
}

export function normalizePlan(inputPlan) {
  const plan = clonePlan(inputPlan || { floors: [] });
  if (!plan.floors.length) plan.floors = [[]];

  plan.floors = plan.floors.map((floorRooms, floorIndex) =>
    (floorRooms || []).map((room) => normalizeRoom(room, floorIndex))
  );

  return plan;
}

export function applyConstraints(inputPlan) {
  const plan = normalizePlan(inputPlan);

  flattenWithLocations(plan)
    .filter(({ room }) => {
      const roomName = String(room.name || "").toLowerCase();
      return (
        roomName.includes("upstairs") ||
        roomName.includes("landing") ||
        roomName.includes("first floor") ||
        roomName.includes("1st floor")
      ) && room.floor !== 1;
    })
    .forEach(({ room }) => moveRoom(plan, room.id, 1));

  // Bedrooms must be upstairs.
  flattenWithLocations(plan)
    .filter(({ room }) => room.type === "bedroom" && room.floor === 0)
    .forEach(({ room }) => moveRoom(plan, room.id, 1));

  // Living and kitchen remain on ground floor.
  flattenWithLocations(plan)
    .filter(({ room }) => (room.type === "living" || room.type === "kitchen") && room.floor !== 0)
    .forEach(({ room }) => moveRoom(plan, room.id, 0));

  // Bathrooms near bedrooms, and stacked where possible.
  const bedroomsByFloor = new Map();
  flattenWithLocations(plan)
    .filter(({ room }) => room.type === "bedroom")
    .forEach(({ room, floorIndex }) => {
      if (!bedroomsByFloor.has(floorIndex)) bedroomsByFloor.set(floorIndex, []);
      bedroomsByFloor.get(floorIndex).push(room);
    });

  const bathrooms = flattenWithLocations(plan).filter(({ room }) => room.type === "bathroom");
  let sharedBathroomX = null;

  bathrooms.forEach(({ room }) => {
    const roomName = String(room.name || "").toLowerCase();
    const isDownstairsWc = roomName.includes("downstairs wc") || roomName.includes("ground floor wc");
    const isUpstairsWc = roomName.includes("upstairs wc");

    if (isDownstairsWc) {
      moveRoom(plan, room.id, 0);
      room.floor = 0;
      room.x = GRID * 2;
      room.y = GRID * 3;
      return;
    }

    if (isUpstairsWc) {
      moveRoom(plan, room.id, 1);
      room.floor = 1;
    }

    const sameFloorBedrooms = bedroomsByFloor.get(room.floor) || [];

    if (!sameFloorBedrooms.length && bedroomsByFloor.size) {
      const [bestFloor] = [...bedroomsByFloor.entries()].sort((a, b) => b[1].length - a[1].length)[0];
      moveRoom(plan, room.id, bestFloor);
      room.floor = bestFloor;
    }

    const targetBedrooms = bedroomsByFloor.get(room.floor) || [];
    if (targetBedrooms.length) {
      const closest = targetBedrooms.sort((a, b) => distance(room, a) - distance(room, b))[0];
      if (distance(room, closest) > BATHROOM_NEAR_DISTANCE) {
        room.x = snapToGrid(closest.x + GRID);
        room.y = snapToGrid(closest.y + GRID);
      }
    }

    if (sharedBathroomX === null) sharedBathroomX = room.x;
    room.x = sharedBathroomX;
  });

  // Snap and resolve overlaps. Never delete rooms.
  plan.floors = plan.floors.map((floorRooms, floorIndex) => {
    const snapped = floorRooms.map((room) => ({
      ...room,
      floor: floorIndex,
      x: snapToGrid(room.x),
      y: snapToGrid(room.y),
      width: Math.max(GRID, snapToGrid(room.width)),
      height: Math.max(GRID, snapToGrid(room.height)),
    }));

    return resolveOverlapsOnFloor(snapped);
  });

  return normalizePlan(plan);
}

export function layoutToStructuredPlan(layout) {
  const floors = (layout?.floors || []).map((floor, floorIndex) =>
    (floor.rooms || []).map((room) => ({
      id: String(room.id),
      name: sanitizeRoomName(room.name || "Room"),
      type: inferRoomType(room.name || room.id),
      floor: floorIndex,
      x: room.x,
      y: room.y,
      width: room.w,
      height: room.h,
    }))
  );

  return normalizePlan({ floors });
}

export function structuredPlanToLayout(structuredPlan, currentLayout) {
  const normalized = normalizePlan(structuredPlan);
  const currentFloors = currentLayout?.floors || [];
  const nameById = new Map(
    currentFloors.flatMap((floor) =>
      (floor?.rooms || []).map((room) => [room.id, sanitizeRoomName(room.name)])
    )
  );

  const floorNames = currentFloors.map((floor, index) => floor?.name || `Floor ${index + 1}`);

  const nextFloors = normalized.floors.map((rooms, floorIndex) => {
    const existingFloor = currentFloors[floorIndex];

    return {
      id: existingFloor?.id || `floor_${floorIndex + 1}`,
      name: floorNames[floorIndex] || `Floor ${floorIndex + 1}`,
      rooms: rooms.map((room) => ({
        id: room.id,
        name: sanitizeRoomName(nameById.get(room.id) || room.name || "Room"),
        x: room.x,
        y: room.y,
        w: room.width,
        h: room.height,
      })),
      doors: existingFloor?.doors || [],
      windows: existingFloor?.windows || [],
      spaces: existingFloor?.spaces || [],
    };
  });

  const requestedActiveFloorId = currentLayout?.activeFloorId;
  const activeFloorId = nextFloors.some((floor) => floor.id === requestedActiveFloorId)
    ? requestedActiveFloorId
    : nextFloors[0]?.id || "floor_1";

  return {
    floors: nextFloors,
    activeFloorId,
  };
}

export function generateConstrainedLayout(inputPlan) {
  return applyConstraints(generateLayout(normalizePlan(inputPlan)));
}
