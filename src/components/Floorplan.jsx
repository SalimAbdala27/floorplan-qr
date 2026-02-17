export default function FloorPlan({ rooms, breakers, fuseById }) {
  const anyRoomOff = rooms.some((room) => {
    const lightsOn = room.lightsFuseId ? breakers[room.lightsFuseId] : false;
    const socketsOn = room.socketsFuseId ? breakers[room.socketsFuseId] : true;
    return !lightsOn || !socketsOn;
  });

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition sm:p-6">
      <div className="mb-4 flex items-center justify-between border-b border-zinc-200 pb-2">
        <h3 className="text-sm font-semibold tracking-[0.15em] text-zinc-700">
          FLOORPLAN
        </h3>
        <span
          className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
            anyRoomOff ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
          }`}
        >
          {anyRoomOff ? "Some Circuits Off" : "All Room Circuits Live"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {rooms.map((room) => {
          const lightsFuse = room.lightsFuseId ? fuseById[room.lightsFuseId] : null;
          const socketsFuse = room.socketsFuseId ? fuseById[room.socketsFuseId] : null;
          const lightsOn = room.lightsFuseId ? breakers[room.lightsFuseId] : false;
          const socketsOn = room.socketsFuseId ? breakers[room.socketsFuseId] : null;
          const roomHealthy = lightsOn && (socketsOn === null || socketsOn);

          return (
            <div
              key={room.id}
              className={`rounded-xl border px-4 py-3 transition duration-300 ${
                roomHealthy
                  ? "border-amber-300 bg-amber-100"
                  : "border-red-200 bg-red-50"
              }`}
            >
              <h4 className="mb-2 text-sm font-semibold text-zinc-800">{room.name}</h4>

              <p className="text-xs text-zinc-700">
                Lights: {lightsFuse ? (lightsOn ? "Powered" : "No power") : "Not assigned"}
                {lightsFuse ? ` (${lightsFuse.rating} / C${lightsFuse.number})` : ""}
              </p>

              <p className="mt-0.5 text-xs text-zinc-700">
                Sockets: {
                  socketsFuse
                    ? socketsOn
                      ? "Powered"
                      : "No power"
                    : "Not assigned"
                }
                {socketsFuse ? ` (${socketsFuse.rating} / C${socketsFuse.number})` : ""}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
