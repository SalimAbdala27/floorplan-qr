import { useState } from "react";

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
  const [showAddFuse, setShowAddFuse] = useState(true);
  const [showRoomMapping, setShowRoomMapping] = useState(true);

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

          <div className="mb-2 rounded-lg border border-zinc-300 bg-zinc-100 p-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
              Main Switch
            </p>
            <div className="mt-2 flex items-center justify-between rounded-lg border border-zinc-300 bg-zinc-200 p-2 shadow-inner">
              <div>
                <p className="text-xs font-semibold text-zinc-700">Main Isolator</p>
                <p className="text-[10px] text-zinc-500">Always present in every fusebox</p>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="rounded bg-zinc-700 px-2 py-0.5 text-[9px] font-semibold text-zinc-100">
                  100A
                </span>
                <span className="h-8 w-8 rounded bg-red-600 shadow-[inset_0_-2px_0_rgba(0,0,0,0.2)]" />
                <span className="text-[9px] font-semibold text-emerald-700">ON</span>
              </div>
            </div>
          </div>

          <div className="mb-2 grid grid-cols-4 gap-2 border-b border-zinc-300 pb-2">
            {fuses.map((fuse) => {
              const isOn = breakers[fuse.id];
              const linkedCircuits = circuitsByFuse[fuse.id] || [];
              const circuitsSummary =
                linkedCircuits.length > 2
                  ? `${linkedCircuits.slice(0, 2).join(", ")} +${linkedCircuits.length - 2} more`
                  : linkedCircuits.join(", ");

              return (
                <div
                  key={fuse.id}
                  className="rounded-lg border border-zinc-300 bg-zinc-200 p-1.5 text-center shadow-inner"
                >
                  <p className="text-[10px] font-semibold text-zinc-700">{fuse.rating}</p>
                  <button
                    onClick={() => toggleBreaker(fuse.id)}
                    aria-label={`Toggle fuse ${fuse.number}`}
                    className={`my-1 h-8 w-8 rounded shadow-[inset_0_-2px_0_rgba(0,0,0,0.2)] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-zinc-300 ${
                      isOn ? "bg-red-500 translate-y-0" : "bg-zinc-400 translate-y-1"
                    }`}
                  />
                  <p className="text-[9px] font-semibold uppercase text-zinc-500">C{fuse.number}</p>
                  <button
                    onClick={() => removeFuse(fuse.id)}
                    className="mt-1 h-6 rounded-md bg-zinc-700 px-2 text-[9px] font-semibold text-zinc-100 transition hover:bg-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-400"
                  >
                    Remove
                  </button>
                  <p
                    title={linkedCircuits.length ? linkedCircuits.join(", ") : "Spare"}
                    className="mt-1 min-h-[28px] text-[9px] leading-tight text-zinc-500 break-words"
                  >
                    {linkedCircuits.length ? circuitsSummary : "Spare"}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mb-2 rounded-md border border-zinc-300 bg-zinc-100 p-2">
            <button
              type="button"
              onClick={() => setShowAddFuse((prev) => !prev)}
              className="flex w-full items-center justify-between text-left"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
                Add Fuse
              </p>
              <span className="text-xs font-semibold text-zinc-500">
                {showAddFuse ? "Hide" : "Show"}
              </span>
            </button>

            {showAddFuse ? (
              <div className="mt-2 flex items-center gap-2">
                <input
                  value={newFuseRating}
                  onChange={(event) => setNewFuseRating(event.target.value)}
                  placeholder="e.g. B20"
                  className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm text-zinc-700 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                />
                <button
                  onClick={addFuse}
                  className="h-10 rounded-lg bg-zinc-800 px-3 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400"
                >
                  Add
                </button>
              </div>
            ) : null}
          </div>

          <div className="mb-2 rounded-md border border-zinc-300 bg-zinc-100 p-2">
            <button
              type="button"
              onClick={() => setShowRoomMapping((prev) => !prev)}
              className="flex w-full items-center justify-between text-left"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
                Room Circuit Mapping
              </p>
              <span className="text-xs font-semibold text-zinc-500">
                {showRoomMapping ? "Hide" : "Show"}
              </span>
            </button>

            {showRoomMapping ? (
              <div className="mt-2 space-y-2">
                {rooms.map((room) => (
                  <div key={room.id} className="rounded-lg border border-zinc-200 bg-white p-2.5">
                    <p className="text-sm font-semibold text-zinc-700">{room.name}</p>

                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <label className="text-[10px] text-zinc-500">
                        Lights
                        <select
                          value={room.lightsFuseId || ""}
                          onChange={(event) =>
                            updateRoomFuse(room.id, "lights", event.target.value)
                          }
                          className="mt-1 h-9 w-full rounded-lg border border-zinc-300 bg-white px-2 text-xs text-zinc-700 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
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
                          className="mt-1 h-9 w-full rounded-lg border border-zinc-300 bg-white px-2 text-xs text-zinc-700 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
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
            ) : null}
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
