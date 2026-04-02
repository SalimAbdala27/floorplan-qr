export default function Room({ room, className = "" }) {
  return (
    <div
      className={className}
      style={{
        position: "absolute",
        left: room.x,
        top: room.y,
        width: room.width,
        height: room.height,
      }}
    >
      {room.name || room.id}
    </div>
  );
}
