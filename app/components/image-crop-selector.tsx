import { useRef, useState, type PointerEvent } from "react";

import type { EquationCrop } from "~/recognition/types";

type Point = { x: number; y: number };

export function cropFromPoints(start: Point, end: Point): EquationCrop {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function pointInElement(event: PointerEvent<HTMLDivElement>): Point {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
  };
}

export function ImageCropSelector({
  imageUrl,
  crop,
  onCropChange,
}: {
  imageUrl: string;
  crop?: EquationCrop;
  onCropChange: (crop?: EquationCrop) => void;
}) {
  const start = useRef<Point | null>(null);
  const [dragging, setDragging] = useState(false);

  function begin(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = pointInElement(event);
    setDragging(true);
    onCropChange({ ...start.current, width: 0, height: 0 });
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    if (!dragging || !start.current) return;
    onCropChange(cropFromPoints(start.current, pointInElement(event)));
  }

  function finish(event: PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const next = cropFromPoints(start.current, pointInElement(event));
    onCropChange(next.width >= 0.01 && next.height >= 0.01 ? next : undefined);
    start.current = null;
    setDragging(false);
  }

  return (
    <div>
      <div
        className="relative mx-auto inline-block max-w-full touch-none cursor-crosshair select-none overflow-hidden rounded-lg"
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
        aria-label="Drag to select the equation region"
      >
        <img
          src={imageUrl}
          alt="Selected equation photograph"
          draggable={false}
          className="block max-h-64 max-w-full object-contain"
        />
        {crop && crop.width > 0 && crop.height > 0 && (
          <div
            className="pointer-events-none absolute border-2 border-violet-500 bg-violet-400/15 shadow-[0_0_0_9999px_rgba(15,23,42,0.35)]"
            style={{
              left: `${crop.x * 100}%`,
              top: `${crop.y * 100}%`,
              width: `${crop.width * 100}%`,
              height: `${crop.height * 100}%`,
            }}
          />
        )}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
        <span>{crop ? "Manual crop selected" : "Automatic equation detection"}</span>
        {crop && (
          <button
            type="button"
            onClick={() => onCropChange(undefined)}
            className="font-semibold text-violet-700 hover:text-violet-900"
          >
            Use automatic crop
          </button>
        )}
      </div>
    </div>
  );
}
