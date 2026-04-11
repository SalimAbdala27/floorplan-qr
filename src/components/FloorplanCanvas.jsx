import FloorplanGenerator from "./FloorplanGenerator.jsx";

export default function FloorplanCanvas({
  layout,
  onLayoutChange,
  availableRooms,
  onRoomFloorChange,
}) {
  const handleLayoutChange = (nextLayout) => {
    onLayoutChange(nextLayout);
  };

  return (
    <FloorplanGenerator
      layout={layout}
      onLayoutChange={handleLayoutChange}
      availableRooms={availableRooms}
      onRoomFloorChange={onRoomFloorChange}
    />
  );
}
