import { useEffect, useMemo, useRef, useState } from "react";

type Point = { x: number; y: number };
type Stroke = { color: string; width: number; points: Point[] };

function getPos(e: PointerEvent, el: HTMLElement): Point {
  const r = el.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

export function AnnotationOverlay({
  enabled,
  clearSignal,
  onClearHandled,
}: {
  enabled: boolean;
  /** Increment to clear strokes */
  clearSignal: number;
  onClearHandled: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [active, setActive] = useState<Stroke | null>(null);

  const style = useMemo(
    () =>
      ({
        pointerEvents: enabled ? "auto" : "none",
      }) as const,
    [enabled],
  );

  // Resize canvas to match container
  useEffect(() => {
    const el = containerRef.current;
    const c = canvasRef.current;
    if (!el || !c) return;

    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.max(1, Math.floor(r.width * dpr));
      c.height = Math.max(1, Math.floor(r.height * dpr));
      c.style.width = `${r.width}px`;
      c.style.height = `${r.height}px`;
      redraw();
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes]);

  // Clear strokes when signal changes
  useEffect(() => {
    if (clearSignal === 0) return;
    setStrokes([]);
    setActive(null);
    redraw(true);
    onClearHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearSignal]);

  function redraw(clearOnly = false) {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    if (clearOnly) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.scale(dpr, dpr);

    const drawStroke = (s: Stroke) => {
      if (s.points.length < 2) return;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
      ctx.stroke();
    };

    for (const s of strokes) drawStroke(s);
    if (active) drawStroke(active);
    ctx.restore();
  }

  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, active]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      if (!enabled) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      setActive({ color: "#ffd27a", width: 4, points: [getPos(e, el)] });
    };
    const onMove = (e: PointerEvent) => {
      if (!enabled) return;
      if (!active) return;
      e.preventDefault();
      setActive((s) => (s ? { ...s, points: [...s.points, getPos(e, el)] } : s));
    };
    const onUp = (e: PointerEvent) => {
      if (!enabled) return;
      if (!active) return;
      e.preventDefault();
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      setStrokes((prev) => [...prev, active]);
      setActive(null);
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [enabled, active]);

  return (
    <div ref={containerRef} className={`anno ${enabled ? "anno-on" : ""}`} style={style}>
      <canvas ref={canvasRef} />
    </div>
  );
}

