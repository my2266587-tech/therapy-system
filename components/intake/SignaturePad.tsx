'use client';

import {
  forwardRef, useImperativeHandle, useRef, useEffect, useState, useCallback,
  type PointerEvent as ReactPointerEvent,
} from 'react';

export interface SignaturePadHandle {
  /** PNG data-URL of the drawn signature, or null if nothing was drawn. */
  getDataUrl: () => string | null;
  clear: () => void;
  isEmpty: () => boolean;
}

/**
 * A minimal mouse/touch signature pad built on a <canvas> + Pointer Events
 * (so a single code path covers mouse, touch and stylus). No external deps.
 * The drawn image is exposed imperatively via a ref so the parent can grab a
 * PNG data-URL at submit time.
 */
const SignaturePad = forwardRef<SignaturePadHandle, { height?: number }>(
  function SignaturePad({ height = 180 }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const wrapRef   = useRef<HTMLDivElement | null>(null);
    const drawing   = useRef(false);
    const dirty     = useRef(false);
    const last      = useRef<{ x: number; y: number } | null>(null);
    const [empty, setEmpty] = useState(true);

    // Size the backing store to the rendered size × devicePixelRatio so lines
    // stay crisp. Re-runs on resize.
    const sizeCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth;
      const h = height;
      canvas.width  = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width  = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#1A2332';
      }
    }, [height]);

    useEffect(() => {
      sizeCanvas();
      window.addEventListener('resize', sizeCanvas);
      return () => window.removeEventListener('resize', sizeCanvas);
    }, [sizeCanvas]);

    function pos(e: ReactPointerEvent<HTMLCanvasElement>) {
      const rect = canvasRef.current!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function start(e: ReactPointerEvent<HTMLCanvasElement>) {
      e.preventDefault();
      canvasRef.current?.setPointerCapture(e.pointerId);
      drawing.current = true;
      last.current = pos(e);
    }

    function move(e: ReactPointerEvent<HTMLCanvasElement>) {
      if (!drawing.current) return;
      e.preventDefault();
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx || !last.current) return;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(last.current.x, last.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last.current = p;
      if (!dirty.current) { dirty.current = true; setEmpty(false); }
    }

    function end(e: ReactPointerEvent<HTMLCanvasElement>) {
      drawing.current = false;
      last.current = null;
      try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    }

    const clear = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      dirty.current = false;
      setEmpty(true);
    }, []);

    useImperativeHandle(ref, () => ({
      getDataUrl: () => (dirty.current ? canvasRef.current?.toDataURL('image/png') ?? null : null),
      clear,
      isEmpty: () => !dirty.current,
    }), [clear]);

    return (
      <div ref={wrapRef} style={{ width: '100%' }}>
        <div style={{ position: 'relative' }}>
          <canvas
            ref={canvasRef}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
            style={{
              width: '100%', height, display: 'block',
              borderRadius: 12, border: '1px solid #E8ECF0',
              backgroundColor: '#FFFFFF', touchAction: 'none', cursor: 'crosshair',
            }}
          />
          {empty && (
            <span style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: 13, color: '#94A3B8', pointerEvents: 'none',
            }}>
              חתמי כאן באמצעות העכבר או המגע
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={clear}
          style={{
            marginTop: 8, padding: '6px 14px', borderRadius: 8,
            fontSize: 12, fontWeight: 600, color: '#64748B',
            backgroundColor: '#F8FAFC', border: '1px solid #E8ECF0', cursor: 'pointer',
          }}
        >
          ניקוי חתימה
        </button>
      </div>
    );
  },
);

export default SignaturePad;
