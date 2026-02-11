export default function FuseBox({
  fuses,
  rooms,
  breakers,
  toggleBreaker,
  circuitsByFuse,
  affectedCircuits = [],
  affectedRooms = [],
  addFuse,
  removeFuse,
  newFuseRating,
  setNewFuseRating,
  updateRoomFuse,
}) {
  return (
    <div className="mt-4 px-3 pb-4">
      <div className="mx-auto w-full max-w-[23rem] rounded-2xl border border-zinc-500 bg-gradient-to-b from-zinc-100 via-zinc-200 to-zinc-300 p-3 shadow-[0_16px_35px_rgba(0,0,0,0.22)]">
        <div className="relative rounded-xl border border-zinc-400 bg-zinc-50 p-3 shadow-inner">
          <span className="absolute left-2 top-2 h-2.5 w-2.5 rounded-full border border-zinc-500 bg-zinc-300" />
          <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border border-zinc-500 bg-zinc-300" />
          <span className="absolute bottom-2 left-2 h-2.5 w-2.5 rounded-full border border-zinc-500 bg-zinc-300" />
          <span className="absolute bottom-2 right-2 h-2.5 w-2.5 rounded-full border border-zinc-500 bg-zinc-300" />

          <div className="mb-3 border-b border-zinc-300 pb-2 text-center">
            <p className="text-[10px] tracking-[0.2em] text-zinc-500">METAL CLAD</p>
            <h2 className="text-xs font-semibold tracking-[0.25em] text-zinc-700">
              CONSUMER UNIT
            </h2>
          </div>

          <div className="mb-2 grid grid-cols-4 gap-1.5 border-b border-zinc-300 pb-2">
            {fuses.map((fuse) => {
              const isOn = breakers[fuse.id];
              const linkedCircuits = circuitsByFuse[fuse.id] || [];

              return (
                <div
                  key={fuse.id}
                  className="rounded-md border border-zinc-300 bg-zinc-200 p-1 text-center shadow-inner"
                >
                  <p className="text-[9px] font-semibold text-zinc-700">{fuse.rating}</p>
                  <button
                    onClick={() => toggleBreaker(fuse.id)}
                    aria-label={`Toggle fuse ${fuse.number}`}
                    className={`my-1 h-7 w-7 rounded-sm shadow-[inset_0_-2px_0_rgba(0,0,0,0.2)] transition-all duration-200 ${
                      isOn ? "bg-red-500 translate-y-0" : "bg-zinc-400 translate-y-1"
                    }`}
                  />
                  <p className="text-[8px] font-semibold uppercase text-zinc-500">C{fuse.number}</p>
                  <button
                    onClick={() => removeFuse(fuse.id)}
                    className="mt-0.5 rounded bg-zinc-700 px-1.5 py-0.5 text-[8px] text-zinc-100"
                  >
                    Remove
                  </button>
                  <p className="mt-0.5 min-h-[16px] text-[8px] leading-tight text-zinc-500">
                    {linkedCircuits.length ? linkedCircuits.join("/") : "Spare"}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mb-2 rounded-md border border-zinc-300 bg-zinc-100 p-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
              Add Fuse
            </p>
            <div className="mt-1 flex items-center gap-2">
              <input
                value={newFuseRating}
                onChange={(event) => setNewFuseRating(event.target.value)}
                placeholder="e.g. B20"
                className="h-8 w-full rounded border border-zinc-300 px-2 text-xs text-zinc-700 outline-none"
              />
              <button
                onClick={addFuse}
                className="h-8 rounded bg-zinc-700 px-3 text-xs font-semibold text-zinc-100"
              >
                Add
              </button>
            </div>
          </div>

          <div className="mb-2 rounded-md border border-zinc-300 bg-zinc-100 p-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
              Room Circuit Mapping
            </p>

            <div className="mt-2 space-y-2">
              {rooms.map((room) => (
                <div key={room.id} className="rounded border border-zinc-200 bg-white p-2">
                  <p className="text-xs font-semibold text-zinc-700">{room.name}</p>

                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <label className="text-[10px] text-zinc-500">
                      Lights
                      <select
                        value={room.lightsFuseId || ""}
                        onChange={(event) =>
                          updateRoomFuse(room.id, "lights", event.target.value)
                        }
                        className="mt-0.5 h-7 w-full rounded border border-zinc-300 bg-white px-1 text-xs text-zinc-700"
                      >
                        <option value="">Unassigned</option>
                        {fuses.map((fuse) => (
                          <option key={`${room.id}-lights-${fuse.id}`} value={fuse.id}>
                            C{fuse.number} ({fuse.rating})
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-[10px] text-zinc-500">
                      Sockets
                      <select
                        value={room.socketsFuseId || ""}
                        onChange={(event) =>
                          updateRoomFuse(room.id, "sockets", event.target.value)
                        }
                        className="mt-0.5 h-7 w-full rounded border border-zinc-300 bg-white px-1 text-xs text-zinc-700"
                      >
                        <option value="">Unassigned</option>
                        {fuses.map((fuse) => (
                          <option key={`${room.id}-sockets-${fuse.id}`} value={fuse.id}>
                            C{fuse.number} ({fuse.rating})
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-500">
              Affected Circuits
            </p>
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                affectedCircuits.length ? "bg-red-500" : "bg-green-500"
              }`}
            />
          </div>

          <p className="mt-1 text-xs text-zinc-600">
            {affectedCircuits.length ? affectedCircuits.join(", ") : "None"}
          </p>

          <p className="mt-1 text-[11px] text-zinc-500">
            Rooms impacted: {affectedRooms.length ? affectedRooms.join(", ") : "None"}
          </p>
        </div>
      </div>
    </div>
  );
}
