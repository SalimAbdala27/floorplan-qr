import { groupRoomsByZone } from "./zoning";

const GRID = 40;

function clonePlan(plan) {
  return {
    floors: (plan?.floors || []).map((floor) => floor.map((room) => ({ ...room }))),
  };
}

function toGrid(value) {
  return Math.round(value / GRID) * GRID;
}

function minSize(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.max(GRID, toGrid(num));
}

function placeRoomsInGrid(rooms, startX, startY, columns) {
  return rooms.map((room, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const width = minSize(room.width, GRID * 4);
    const height = minSize(room.height, GRID * 3);

    return {
      ...room,
      x: toGrid(startX + col * (width + GRID)),
      y: toGrid(startY + row * (height + GRID)),
      width,
      height,
    };
  });
}

export function generateLayout(inputPlan) {
  const plan = clonePlan(inputPlan);

  plan.floors = plan.floors.map((floorRooms, floorIndex) => {
    const withoutHallways = (floorRooms || []).filter((room) => room.type !== "hallway");
    const byZone = groupRoomsByZone(withoutHallways);

    const orderedRooms = [
      ...byZone.public,
      ...byZone.utility.filter((room) => room.type !== "stairs"),
      ...byZone.private,
      ...byZone.utility.filter((room) => room.type === "stairs"),
    ];

    const placed = placeRoomsInGrid(orderedRooms, GRID, GRID, 2).map((room) => ({
      ...room,
      floor: floorIndex,
      x: toGrid(room.x),
      y: toGrid(room.y),
      width: minSize(room.width, GRID * 4),
      height: minSize(room.height, GRID * 3),
    }));

    return placed;
  });

  return plan;
}
