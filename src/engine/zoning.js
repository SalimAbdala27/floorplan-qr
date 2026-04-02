export const ZONE_BY_TYPE = {
  living: "public",
  kitchen: "public",
  bedroom: "private",
  bathroom: "utility",
  stairs: "utility",
  hallway: "circulation",
};

export function getZoneForType(type) {
  return ZONE_BY_TYPE[type] || "public";
}

export function groupRoomsByZone(rooms) {
  return rooms.reduce(
    (acc, room) => {
      const zone = getZoneForType(room.type);
      acc[zone].push(room);
      return acc;
    },
    {
      public: [],
      private: [],
      utility: [],
      circulation: [],
    }
  );
}

export function zonePriority(zone) {
  if (zone === "public") return 0;
  if (zone === "circulation") return 1;
  if (zone === "utility") return 2;
  if (zone === "private") return 3;
  return 4;
}
