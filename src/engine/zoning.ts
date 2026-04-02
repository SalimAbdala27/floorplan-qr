export type Zone = "public" | "private" | "utility" | "circulation";

export { ZONE_BY_TYPE, getZoneForType, groupRoomsByZone, zonePriority } from "./zoning.js";
