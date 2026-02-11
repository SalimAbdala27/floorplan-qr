import { useEffect, useMemo, useState } from "react";
import FloorPlan from "./components/Floorplan.jsx";
import FuseBox from "./components/Fusebox.jsx";

const STORAGE_KEY = "floorplan_qr_state_v1";

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

function loadSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!Array.isArray(parsed.fuses) || !Array.isArray(parsed.rooms)) return null;
    if (!parsed.breakers || typeof parsed.breakers !== "object") return null;
    if (typeof parsed.nextFuseNumber !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export default function App() {
  const savedState = loadSavedState();

  const [fuses, setFuses] = useState(savedState?.fuses ?? initialFuses);
  const [rooms, setRooms] = useState(savedState?.rooms ?? initialRooms);
  const [breakers, setBreakers] = useState(
    savedState?.breakers ?? Object.fromEntries(initialFuses.map((fuse) => [fuse.id, true]))
  );
  const [nextFuseNumber, setNextFuseNumber] = useState(
    savedState?.nextFuseNumber ?? initialFuses.length + 1
  );
  const [newFuseRating, setNewFuseRating] = useState("B6");

  useEffect(() => {
    const validFuseIds = new Set(fuses.map((fuse) => fuse.id));

    setBreakers((prev) => {
      const normalized = {};
      fuses.forEach((fuse) => {
        normalized[fuse.id] = prev[fuse.id] ?? true;
      });
      return normalized;
    });

    setRooms((prev) =>
      prev.map((room) => ({
        ...room,
        lightsFuseId: room.lightsFuseId && validFuseIds.has(room.lightsFuseId)
          ? room.lightsFuseId
          : null,
        socketsFuseId: room.socketsFuseId && validFuseIds.has(room.socketsFuseId)
          ? room.socketsFuseId
          : null,
      }))
    );
  }, [fuses]);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        fuses,
        rooms,
        breakers,
        nextFuseNumber,
      })
    );
  }, [fuses, rooms, breakers, nextFuseNumber]);

  const fuseById = useMemo(
    () => Object.fromEntries(fuses.map((fuse) => [fuse.id, fuse])),
    [fuses]
  );

  const circuitsByFuse = useMemo(
    () =>
      rooms.reduce((acc, room) => {
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
    [rooms]
  );

  const affectedCircuits = rooms.flatMap((room) => {
    const impacted = [];
    if (room.lightsFuseId && !breakers[room.lightsFuseId]) {
      impacted.push(`${room.name} Lights`);
    }
    if (room.socketsFuseId && !breakers[room.socketsFuseId]) {
      impacted.push(`${room.name} Sockets`);
    }
    return impacted;
  });

  const affectedRooms = rooms
    .filter(
      (room) =>
        (room.lightsFuseId && !breakers[room.lightsFuseId]) ||
        (room.socketsFuseId && !breakers[room.socketsFuseId])
    )
    .map((room) => room.name);

  const toggleBreaker = (fuseId) => {
    if (!fuseById[fuseId]) return;
    setBreakers((prev) => ({
      ...prev,
      [fuseId]: !prev[fuseId],
    }));
  };

  const addFuse = () => {
    const cleanedRating = newFuseRating.trim().toUpperCase();
    if (!cleanedRating) return;

    const newFuse = {
      id: `fuse${nextFuseNumber}`,
      number: nextFuseNumber,
      rating: cleanedRating,
    };

    setFuses((prev) => [...prev, newFuse]);
    setBreakers((prev) => ({ ...prev, [newFuse.id]: true }));
    setNextFuseNumber((prev) => prev + 1);
    setNewFuseRating("B6");
  };

  const removeFuse = (fuseId) => {
    setFuses((prev) => prev.filter((fuse) => fuse.id !== fuseId));

    setBreakers((prev) => {
      const updated = { ...prev };
      delete updated[fuseId];
      return updated;
    });

    setRooms((prev) =>
      prev.map((room) => ({
        ...room,
        lightsFuseId: room.lightsFuseId === fuseId ? null : room.lightsFuseId,
        socketsFuseId: room.socketsFuseId === fuseId ? null : room.socketsFuseId,
      }))
    );
  };

  const updateRoomFuse = (roomId, circuitType, fuseId) => {
    const field = circuitType === "lights" ? "lightsFuseId" : "socketsFuseId";
    setRooms((prev) =>
      prev.map((room) =>
        room.id === roomId
          ? {
              ...room,
              [field]: fuseId || null,
            }
          : room
      )
    );
  };

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col">
      <div className="flex-1 p-4">
        <FloorPlan rooms={rooms} breakers={breakers} fuseById={fuseById} />
      </div>

      <FuseBox
        fuses={fuses}
        rooms={rooms}
        breakers={breakers}
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
