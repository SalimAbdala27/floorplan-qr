import { useEffect, useRef, useState } from "react";

function getCanvasPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}

export default function SignaturePad({ value = "", onChange }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const [signed, setSigned] = useState(Boolean(value));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    if (!value) {
      context.strokeStyle = "#d4d4d8";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(20, canvas.height - 28);
      context.lineTo(canvas.width - 20, canvas.height - 28);
      context.stroke();
      setSigned(false);
      return;
    }

    const image = new Image();
    image.onload = () => {
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      setSigned(true);
    };
    image.src = value;
  }, [value]);

  const beginDraw = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const point = getCanvasPoint(canvas, event);
    drawingRef.current = true;
    context.strokeStyle = "#18181b";
    context.lineWidth = 2.2;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(point.x, point.y);
    setSigned(true);
  };

  const draw = (event) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const point = getCanvasPoint(canvas, event);
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const endDraw = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas || !onChange) return;
    onChange(canvas.toDataURL("image/png"));
  };

  const clearSignature = () => {
    setSigned(false);
    onChange?.("");
  };

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border border-zinc-300 bg-white">
        <canvas
          ref={canvasRef}
          width={720}
          height={220}
          onPointerDown={beginDraw}
          onPointerMove={draw}
          onPointerUp={endDraw}
          onPointerLeave={endDraw}
          onPointerCancel={endDraw}
          className="h-40 w-full touch-none bg-white"
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-zinc-500">
          {signed ? "Signature captured." : "Sign inside the box."}
        </p>
        <button
          type="button"
          onClick={clearSignature}
          className="h-8 rounded-lg bg-zinc-100 px-3 text-[11px] font-semibold text-zinc-700"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
