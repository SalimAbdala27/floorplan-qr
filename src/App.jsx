import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import FloorPlan from "./components/Floorplan.jsx";
import FuseBox from "./components/Fusebox.jsx";
import AuthScreen from "./components/AuthScreen.jsx";
import { supabase } from "./lib/supabaseClient";

const STORAGE_KEY_PREFIX = "floorplan_qr_state_v2";
const REMOTE_STATE_TABLE = "user_home_configs";

function createBaseHome(id, name) {
  return {
    id,
    name,
    fuses: [],
    rooms: [],
    breakers: {},
    nextFuseNumber: 1,
  };
}

function isValidStateShape(value) {
  return Boolean(value && Array.isArray(value.homes));
}

function getStorageKey(userId) {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

function loadSavedState(userId) {
  if (!userId) return null;

  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isValidStateShape(parsed)) {
        return parsed;
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function loadRemoteState(userId) {
  const { data, error } = await supabase
    .from(REMOTE_STATE_TABLE)
    .select("state")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return isValidStateShape(data?.state) ? data.state : null;
}

async function saveRemoteState(userId, state) {
  const { error } = await supabase.from(REMOTE_STATE_TABLE).upsert(
    {
      user_id: userId,
      state,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    throw error;
  }
}

function HomeScreen({
  home,
  onBack,
  userEmail,
  onSignOut,
  onUpdateHome,
  onDeleteHome,
  onRenameHome,
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

  const exportFuseboxPdf = () => {
    const doc = new jsPDF();
    const generatedAt = new Date().toLocaleString();
    const safeHomeName = (home.name || "Home").replace(/[^\w\s-]/g, "").trim() || "home";

    doc.setFontSize(18);
    doc.text(`${home.name} - Fusebox Report`, 14, 18);
    doc.setFontSize(10);
    doc.text(`Generated ${generatedAt}`, 14, 24);

    doc.setFontSize(11);
    doc.text("Main Switch: 100A Main Isolator (ON)", 14, 32);

    const fuseBody = home.fuses.map((fuse) => {
      const linked = home.rooms
        .flatMap((room) => {
          const circuits = [];
          if (room.lightsFuseId === fuse.id) circuits.push(`${room.name} (Lights)`);
          if (room.socketsFuseId === fuse.id) circuits.push(`${room.name} (Sockets)`);
          return circuits;
        })
        .join(", ");

      return [`C${fuse.number}`, fuse.rating, home.breakers[fuse.id] ? "ON" : "OFF", linked || "Spare"];
    });

    autoTable(doc, {
      startY: 38,
      head: [["Circuit", "Rating", "Status", "Linked Circuits"]],
      body: fuseBody.length ? fuseBody : [["-", "-", "-", "No fuses added"]],
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [31, 41, 55] },
    });

    const roomBody = home.rooms.map((room) => {
      const lightsFuse = room.lightsFuseId
        ? home.fuses.find((fuse) => fuse.id === room.lightsFuseId)
        : null;
      const socketsFuse = room.socketsFuseId
        ? home.fuses.find((fuse) => fuse.id === room.socketsFuseId)
        : null;

      return [
        room.name,
        lightsFuse ? `C${lightsFuse.number} (${lightsFuse.rating})` : "Unassigned",
        socketsFuse ? `C${socketsFuse.number} (${socketsFuse.rating})` : "Unassigned",
      ];
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [["Room", "Lights Fuse", "Sockets Fuse"]],
      body: roomBody.length ? roomBody : [["-", "No rooms added", "No rooms added"]],
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [31, 41, 55] },
    });

    const fileName = `${safeHomeName.toLowerCase().replace(/\s+/g, "_")}_fusebox_report.pdf`;
    doc.save(fileName);
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
              onClick={() => onRenameHome(home.id)}
              className="h-8 rounded-lg bg-zinc-200 px-3 text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-300"
            >
              Rename
            </button>
            <button
              type="button"
              onClick={() => onDeleteHome(home.id)}
              className="h-8 rounded-lg bg-red-100 px-3 text-[11px] font-semibold text-red-700 transition hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-200"
            >
              Delete Home
            </button>
            <button
              type="button"
              onClick={exportFuseboxPdf}
              className="h-8 rounded-lg bg-zinc-800 px-3 text-[11px] font-semibold text-white transition hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-300"
            >
              Export PDF
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

function HomesIndex({
  homes,
  onOpenHome,
  onCreateHome,
  onSignOut,
  onRenameHome,
  userEmail,
}) {
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
            <div
              key={home.id}
              className="w-full rounded-2xl border border-zinc-200 bg-white p-3 text-left shadow-sm transition hover:border-zinc-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onOpenHome(home.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm font-semibold text-zinc-800">{home.name}</p>
                  <p className="text-xs text-zinc-500">
                    {home.rooms.length} rooms · {home.fuses.length} fuses
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => onRenameHome(home.id)}
                  className="h-7 rounded-lg bg-zinc-200 px-2.5 text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-300"
                >
                  Rename
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [isCloudHydrated, setIsCloudHydrated] = useState(false);
  const [homes, setHomes] = useState([]);
  const [activeHomeId, setActiveHomeId] = useState(null);
  const [renameHomeId, setRenameHomeId] = useState(null);
  const [renameHomeName, setRenameHomeName] = useState("");
  const userId = session?.user?.id || null;
  const currentState = useMemo(() => ({ homes, activeHomeId }), [homes, activeHomeId]);

  useEffect(() => {
    if (!userId) return;

    localStorage.setItem(
      getStorageKey(userId),
      JSON.stringify({
        homes,
        activeHomeId,
      })
    );
  }, [userId, homes, activeHomeId]);

  useEffect(() => {
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

  useEffect(() => {
    let cancelled = false;

    const syncFromCloud = async () => {
      if (!userId) {
        setHomes([]);
        setActiveHomeId(null);
        setCloudLoading(false);
        setIsCloudHydrated(false);
        return;
      }

      setCloudLoading(true);
      setIsCloudHydrated(false);

      try {
        const localState = loadSavedState(userId);
        setHomes(localState?.homes ?? []);
        setActiveHomeId(null);

        const remoteState = await loadRemoteState(userId);

        if (cancelled) return;

        if (remoteState && isValidStateShape(remoteState)) {
          setHomes(remoteState.homes ?? []);
          setActiveHomeId(null);
        } else if (!localState) {
          // New account with no remote/local data starts as blank canvas.
          setHomes([]);
          setActiveHomeId(null);
        }
      } catch (error) {
        // If the table/policies are not set yet, keep local state and log the issue.
        console.error("Supabase sync load failed:", error.message || error);
      } finally {
        if (!cancelled) {
          setCloudLoading(false);
          setIsCloudHydrated(true);
        }
      }
    };

    syncFromCloud();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Always start on Homes page after auth/session is established.
  useEffect(() => {
    if (!userId) return;
    setActiveHomeId(null);
  }, [userId]);

  useEffect(() => {
    if (!userId || !isCloudHydrated) return;

    const timeoutId = setTimeout(() => {
      saveRemoteState(userId, currentState).catch((error) => {
        console.error("Supabase sync save failed:", error.message || error);
      });
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [userId, isCloudHydrated, currentState]);

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

  const openRenameHome = (homeId) => {
    const target = homes.find((home) => home.id === homeId);
    if (!target) return;
    setRenameHomeId(homeId);
    setRenameHomeName(target.name);
  };

  const closeRenameHome = () => {
    setRenameHomeId(null);
    setRenameHomeName("");
  };

  const saveRenameHome = () => {
    if (!renameHomeId) return;
    const cleaned = renameHomeName.trim();
    if (!cleaned) return;

    setHomes((prev) =>
      prev.map((home) =>
        home.id === renameHomeId
          ? {
              ...home,
              name: cleaned,
            }
          : home
      )
    );
    closeRenameHome();
  };

  if (loading || (session && cloudLoading)) {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center">
        <p className="text-sm text-zinc-600">
          {loading ? "Loading..." : "Syncing your home data..."}
        </p>
      </div>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  const activeHome = homes.find((home) => home.id === activeHomeId) || null;

  const content = !activeHome ? (
    <HomesIndex
      homes={homes}
      onOpenHome={setActiveHomeId}
      onCreateHome={createHome}
      onSignOut={handleSignOut}
      onRenameHome={openRenameHome}
      userEmail={session.user?.email}
    />
  ) : (
    <HomeScreen
      home={activeHome}
      onBack={() => setActiveHomeId(null)}
      userEmail={session.user?.email}
      onSignOut={handleSignOut}
      onUpdateHome={(mutator) => updateHome(activeHome.id, mutator)}
      onDeleteHome={deleteHome}
      onRenameHome={openRenameHome}
    />
  );

  return (
    <>
      {content}
      {renameHomeId ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/35 p-3">
          <div className="mx-auto w-full max-w-[23rem] rounded-2xl border border-zinc-200 bg-white p-3 shadow-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-600">
              Rename Home
            </p>
            <input
              value={renameHomeName}
              onChange={(event) => setRenameHomeName(event.target.value)}
              className="mt-2 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm text-zinc-800 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              placeholder="Home name"
              autoFocus
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeRenameHome}
                className="h-9 rounded-lg bg-zinc-200 px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveRenameHome}
                className="h-9 rounded-lg bg-zinc-800 px-3 text-xs font-semibold text-white transition hover:bg-zinc-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
