import { useEffect, useMemo, useState } from "react";
import FloorPlan from "./components/Floorplan.jsx";
import FuseBox from "./components/Fusebox.jsx";
import AuthScreen from "./components/AuthScreen.jsx";
import { supabase } from "./lib/supabaseClient";

const STORAGE_KEY = "floorplan_qr_state_v2";

const initialFuseRatings = [
  "B6",
  "B32",
  "B6",
  "B16",
  "B32",
  "B6",
  "B32",
  "B32",
  "B40",
  "B16",
  "B6",
  "B6",
  "B6",
  "B32",
];

const initialFuses = initialFuseRatings.map((rating, index) => ({
  id: `fuse${index + 1}`,
  number: index + 1,
  rating,
}));

const initialRooms = [
  { id: "entrance", name: "Entrance", lightsFuseId: "fuse1", socketsFuseId: "fuse2" },
  {
    id: "downstairsBathroom",
    name: "Downstairs Bathroom",
    lightsFuseId: "fuse3",
    socketsFuseId: "fuse4",
  },
  { id: "livingRoom", name: "Living Room", lightsFuseId: "fuse5", socketsFuseId: "fuse6" },
  { id: "kitchen", name: "Kitchen", lightsFuseId: "fuse7", socketsFuseId: "fuse8" },
  { id: "outsideLights", name: "Outside Lights", lightsFuseId: "fuse9", socketsFuseId: null },
  {
    id: "secondFloorLanding",
    name: "Second Floor Landing",
    lightsFuseId: "fuse10",
    socketsFuseId: "fuse2",
  },
  {
    id: "upstairsToilet",
    name: "Upstairs Toilet",
    lightsFuseId: "fuse11",
    socketsFuseId: "fuse4",
  },
  {
    id: "upstairsBathroom",
    name: "Upstairs Bathroom",
    lightsFuseId: "fuse12",
    socketsFuseId: "fuse8",
  },
  {
    id: "alishaBedroom",
    name: "Alisha Bedroom",
    lightsFuseId: "fuse13",
    socketsFuseId: "fuse14",
  },
  {
    id: "mumsBedroom",
    name: "Mum's Bedroom",
    lightsFuseId: "fuse13",
    socketsFuseId: "fuse14",
  },
  { id: "office", name: "Office", lightsFuseId: "fuse11", socketsFuseId: "fuse6" },
  {
    id: "myBedroom",
    name: "My Bedroom",
    lightsFuseId: "fuse12",
    socketsFuseId: "fuse14",
  },
];

function createBaseHome(id, name) {
  return {
    id,
    name,
    fuses: initialFuses,
    rooms: initialRooms,
    breakers: Object.fromEntries(initialFuses.map((fuse) => [fuse.id, true])),
    nextFuseNumber: initialFuses.length + 1,
  };
}

function loadSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.homes)) {
        return parsed;
      }
    }

    // Migration from older single-home storage shape
    const oldRaw = localStorage.getItem("floorplan_qr_state_v1");
    if (oldRaw) {
      const oldParsed = JSON.parse(oldRaw);
      if (
        Array.isArray(oldParsed?.fuses) &&
        Array.isArray(oldParsed?.rooms) &&
        oldParsed?.breakers &&
        typeof oldParsed.nextFuseNumber === "number"
      ) {
        return {
          homes: [
            {
              id: "home1",
              name: "My Home",
              fuses: oldParsed.fuses,
              rooms: oldParsed.rooms,
              breakers: oldParsed.breakers,
              nextFuseNumber: oldParsed.nextFuseNumber,
            },
          ],
          activeHomeId: null,
        };
      }
    }

    return null;
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
}) {
  const [newFuseRating, setNewFuseRating] = useState("B6");
  const [newRoomName, setNewRoomName] = useState("");
  const [showAddRoom, setShowAddRoom] = useState(true);
  const [showFloorplan, setShowFloorplan] = useState(true);

  useEffect(() => {
    setNewFuseRating("B6");
    setNewRoomName("");
    setShowAddRoom(true);
    setShowFloorplan(true);
  }, [home.id]);

  const fuseById = useMemo(
    () => Object.fromEntries(home.fuses.map((fuse) => [fuse.id, fuse])),
    [home.fuses]
  );

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

    const normalizedBreakers = {};
    nextHome.fuses.forEach((fuse) => {
      normalizedBreakers[fuse.id] = nextHome.breakers[fuse.id] ?? true;
    });

    const normalizedRooms = nextHome.rooms.map((room) => ({
      ...room,
      lightsFuseId:
        room.lightsFuseId && validFuseIds.has(room.lightsFuseId) ? room.lightsFuseId : null,
      socketsFuseId:
        room.socketsFuseId && validFuseIds.has(room.socketsFuseId) ? room.socketsFuseId : null,
    }));

    return {
      ...nextHome,
      rooms: normalizedRooms,
      breakers: normalizedBreakers,
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

    const roomId = `room_${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${Date.now()}`;

    updateHome((prev) => ({
      ...prev,
      rooms: [
        ...prev.rooms,
        {
          id: roomId,
          name: cleanName,
          lightsFuseId: null,
          socketsFuseId: null,
        },
      ],
    }));

    setNewRoomName("");
  };

  const removeRoom = (roomId) => {
    updateHome((prev) => ({
      ...prev,
      rooms: prev.rooms.filter((room) => room.id !== roomId),
    }));
  };

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col">
      <div className="px-4 pt-3">
        <div className="mx-auto w-full max-w-[23rem] rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 shadow-sm">
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
        <div className="mx-auto w-full max-w-[23rem] rounded-xl border border-zinc-200 bg-white px-3 py-2 shadow-sm">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="h-8 rounded-lg bg-zinc-200 px-3 text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-300"
            >
              Homes
            </button>
            <button
              type="button"
              onClick={() => onDeleteHome(home.id)}
              className="h-8 rounded-lg bg-red-100 px-3 text-[11px] font-semibold text-red-700 transition hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-200"
            >
              Delete Home
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-3">
        <div className="mx-auto w-full max-w-[23rem] rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
          <button
            type="button"
            onClick={() => setShowAddRoom((prev) => !prev)}
            className="flex w-full items-center justify-between text-left"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
              Add Room
            </p>
            <span className="text-xs font-semibold text-zinc-500">
              {showAddRoom ? "Hide" : "Show"}
            </span>
          </button>

          {showAddRoom ? (
            <>
              <div className="mt-2 flex items-center gap-2">
                <input
                  value={newRoomName}
                  onChange={(event) => setNewRoomName(event.target.value)}
                  placeholder="e.g. Utility Room"
                  className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm text-zinc-700 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                />
                <button
                  type="button"
                  onClick={addRoom}
                  className="h-10 rounded-lg bg-zinc-800 px-3 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400"
                >
                  Add
                </button>
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {home.rooms.map((room) => (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => removeRoom(room.id)}
                    className="rounded-lg border border-zinc-300 bg-zinc-50 px-2.5 py-1.5 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-200"
                  >
                    {room.name} x
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex-1 p-4">
        <div className="mx-auto w-full max-w-[23rem] rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
          <button
            type="button"
            onClick={() => setShowFloorplan((prev) => !prev)}
            className="flex w-full items-center justify-between text-left"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
              Floorplan
            </p>
            <span className="text-xs font-semibold text-zinc-500">
              {showFloorplan ? "Hide" : "Show"}
            </span>
          </button>

          {showFloorplan ? (
            <div className="mt-3">
              <FloorPlan rooms={home.rooms} breakers={home.breakers} fuseById={fuseById} />
            </div>
          ) : null}
        </div>
      </div>

      <FuseBox
        fuses={home.fuses}
        rooms={home.rooms}
        breakers={home.breakers}
        toggleBreaker={toggleBreaker}
        circuitsByFuse={circuitsByFuse}
        affectedCircuits={affectedCircuits}
        affectedRooms={affectedRooms}
        addFuse={addFuse}
        removeFuse={removeFuse}
        newFuseRating={newFuseRating}
        setNewFuseRating={setNewFuseRating}
        updateRoomFuse={updateRoomFuse}
      />
    </div>
  );
}

function HomesIndex({ homes, onOpenHome, onCreateHome, onSignOut, userEmail }) {
  const [newHomeName, setNewHomeName] = useState("");

  const createHome = () => {
    const cleanName = newHomeName.trim();
    if (!cleanName) return;
    onCreateHome(cleanName);
    setNewHomeName("");
  };

  return (
    <div className="min-h-screen bg-neutral-100 p-4">
      <div className="mx-auto w-full max-w-[23rem] space-y-3">
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
            Add Home
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={newHomeName}
              onChange={(event) => setNewHomeName(event.target.value)}
              placeholder="e.g. Mum's House"
              className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm text-zinc-700 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
            <button
              type="button"
              onClick={createHome}
              className="h-10 rounded-lg bg-zinc-800 px-3 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            >
              Add
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {homes.map((home) => (
            <button
              key={home.id}
              type="button"
              onClick={() => onOpenHome(home.id)}
              className="w-full rounded-2xl border border-zinc-200 bg-white p-3 text-left shadow-sm transition hover:border-zinc-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-zinc-300"
            >
              <p className="text-sm font-semibold text-zinc-800">{home.name}</p>
              <p className="text-xs text-zinc-500">
                {home.rooms.length} rooms · {home.fuses.length} fuses
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const savedState = loadSavedState();

  const [homes, setHomes] = useState(
    savedState?.homes?.length ? savedState.homes : [createBaseHome("home1", "My Home")]
  );
  const [activeHomeId, setActiveHomeId] = useState(savedState?.activeHomeId ?? null);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        homes,
        activeHomeId,
      })
    );
  }, [homes, activeHomeId]);

  useEffect(() => {
    if (!homes.length) {
      const fallback = createBaseHome(`home${Date.now()}`, "My Home");
      setHomes([fallback]);
      setActiveHomeId(fallback.id);
      return;
    }

    if (activeHomeId && !homes.some((home) => home.id === activeHomeId)) {
      setActiveHomeId(null);
    }
  }, [homes, activeHomeId]);

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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const createHome = (name) => {
    const id = `home_${Date.now()}`;
    setHomes((prev) => [...prev, createBaseHome(id, name)]);
  };

  const updateHome = (homeId, mutator) => {
    setHomes((prev) => prev.map((home) => (home.id === homeId ? mutator(home) : home)));
  };

  const deleteHome = (homeId) => {
    setHomes((prev) => prev.filter((home) => home.id !== homeId));
    setActiveHomeId(null);
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

  if (!activeHome) {
    return (
      <HomesIndex
        homes={homes}
        onOpenHome={setActiveHomeId}
        onCreateHome={createHome}
        onSignOut={handleSignOut}
        userEmail={session.user?.email}
      />
    );
  }

  return (
    <HomeScreen
      home={activeHome}
      onBack={() => setActiveHomeId(null)}
      userEmail={session.user?.email}
      onSignOut={handleSignOut}
      onUpdateHome={(mutator) => updateHome(activeHome.id, mutator)}
      onDeleteHome={deleteHome}
    />
  );
}
