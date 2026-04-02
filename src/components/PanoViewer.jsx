import { useRef, useState } from "react";

export default function PanoViewer({ src, alt }) {
  const [offsetX, setOffsetX] = useState(0);
  const draggingRef = useRef(false);
  const lastXRef = useRef(0);

  const onPointerDown = (event) => {
    draggingRef.current = true;
    lastXRef.current = event.clientX;
  };

  const onPointerMove = (event) => {
    if (!draggingRef.current) return;
    const delta = event.clientX - lastXRef.current;
    lastXRef.current = event.clientX;
    setOffsetX((prev) => prev + delta);
  };

  const stopDragging = () => {
    draggingRef.current = false;
  };

  return (
    <div
      className="relative h-28 w-full overflow-hidden rounded border border-zinc-200 bg-zinc-100"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopDragging}
      onPointerLeave={stopDragging}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="h-full max-w-none object-cover"
        style={{ transform: `translateX(${offsetX}px)` }}
      />
    </div>
  );
}
