import { useEffect, useRef, useState, useCallback } from "react";
import Toolbar from "./components/Toolbar";
import ResultModal from "./components/ResultModal";
import { parseGeminiResponse } from "./utils/parseResponse";
import "./App.css";

// ─────────────────────────────────────────────────────────────
// App — root component
// Manages all drawing state, canvas logic, and API call
// to our Express backend (which holds the Gemini API key)
// ─────────────────────────────────────────────────────────────
export default function App() {
  // ── Refs ──
  const areaRef    = useRef(null);   // wrapper div (for sizing)
  const canvasRef  = useRef(null);   // permanent drawing layer
  const previewRef = useRef(null);   // shape-preview overlay layer
  const historyRef = useRef([]);     // undo snapshots (ImageData[])

  // ── Drawing state ──
  const [tool, setTool]             = useState("pen");
  const [color, setColor]           = useState("#1a1a1a");
  const [strokeSize, setStroke]     = useState(4);
  const [hasContent, setHasContent] = useState(false);
  const isDrawing = useRef(false);
  const startPos  = useRef({ x: 0, y: 0 });
  const lastPos   = useRef({ x: 0, y: 0 });

  // ── API / Modal state ──
  const [loading, setLoading] = useState(false);
  const [modal, setModal]     = useState({ open: false, data: null, error: null });

  // ─────────────────────────────────────────
  // CANVAS RESIZE
  // Keeps canvas pixel dimensions in sync with
  // the layout size and devicePixelRatio (retina)
  // ─────────────────────────────────────────
  const resizeCanvases = useCallback(() => {
    const area    = areaRef.current;
    const canvas  = canvasRef.current;
    const preview = previewRef.current;
    if (!area || !canvas || !preview) return;

    const dpr  = window.devicePixelRatio || 1;
    const rect = area.getBoundingClientRect();

    // Snapshot current drawing before resize wipes it
    const ctx  = canvas.getContext("2d");
    const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);

    [canvas, preview].forEach((c) => {
      c.width  = rect.width  * dpr;
      c.height = rect.height * dpr;
      c.style.width  = rect.width  + "px";
      c.style.height = rect.height + "px";
      c.getContext("2d").scale(dpr, dpr);
    });

    // Restore drawing after resize
    ctx.putImageData(snap, 0, 0);
    applyCtxDefaults(ctx);
  }, []);

  useEffect(() => {
    setTimeout(resizeCanvases, 50);
    window.addEventListener("resize", resizeCanvases);
    return () => window.removeEventListener("resize", resizeCanvases);
  }, [resizeCanvases]);

  function applyCtxDefaults(ctx) {
    ctx.lineCap  = "round";
    ctx.lineJoin = "round";
  }

  // ─────────────────────────────────────────
  // COORDINATE HELPER
  // Converts mouse/touch event to canvas-relative coords
  // ─────────────────────────────────────────
  function getPos(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  // ─────────────────────────────────────────
  // HISTORY (UNDO)
  // Saves a full ImageData snapshot before each stroke
  // ─────────────────────────────────────────
  function saveHistory() {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");
    if (historyRef.current.length >= 30) historyRef.current.shift();
    historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  }

  function undo() {
    if (!historyRef.current.length) return;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");
    ctx.putImageData(historyRef.current.pop(), 0, 0);
    checkContent();
  }

  // ─────────────────────────────────────────
  // CONTENT CHECK
  // Scans pixels to set hasContent flag
  // Controls hint text and button availability
  // ─────────────────────────────────────────
  function checkContent() {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");
    const d      = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    setHasContent(d.some((v) => v !== 0));
  }

  // ─────────────────────────────────────────
  // CLEAR ALL
  // ─────────────────────────────────────────
  function clearAll() {
    saveHistory();
    const canvas  = canvasRef.current;
    const preview = previewRef.current;
    const dpr     = window.devicePixelRatio || 1;
    canvas.getContext("2d").clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    preview.getContext("2d").clearRect(0, 0, preview.width / dpr, preview.height / dpr);
    setHasContent(false);
  }

  // ─────────────────────────────────────────
  // SHAPE RENDERER
  // Used by both preview layer (dashed) and commit (solid)
  // ─────────────────────────────────────────
  function renderShape(c, sx, sy, ex, ey, isDashed) {
    c.save();
    c.strokeStyle = color;
    c.fillStyle   = "transparent";
    c.lineWidth   = strokeSize;
    c.lineCap     = "round";
    c.lineJoin    = "round";
    c.setLineDash(isDashed ? [5, 4] : []);
    c.beginPath();

    if (tool === "rect") {
      // roundRect for nicer corners
      c.roundRect(
        Math.min(sx, ex), Math.min(sy, ey),
        Math.abs(ex - sx), Math.abs(ey - sy),
        3
      );
      c.stroke();

    } else if (tool === "circle") {
      const cx = (sx + ex) / 2;
      const cy = (sy + ey) / 2;
      c.ellipse(cx, cy, Math.abs(ex - sx) / 2, Math.abs(ey - sy) / 2, 0, 0, Math.PI * 2);
      c.stroke();

    } else if (tool === "line") {
      c.moveTo(sx, sy);
      c.lineTo(ex, ey);
      c.stroke();

    } else if (tool === "arrow") {
      // Draw shaft
      c.moveTo(sx, sy);
      c.lineTo(ex, ey);
      c.stroke();
      // Filled arrowhead — atan2 gives angle, ±π/7 offsets the two wings
      const angle   = Math.atan2(ey - sy, ex - sx);
      const headLen = Math.max(14, strokeSize * 3.5);
      c.setLineDash([]);
      c.beginPath();
      c.moveTo(ex, ey);
      c.lineTo(
        ex - headLen * Math.cos(angle - Math.PI / 7),
        ey - headLen * Math.sin(angle - Math.PI / 7)
      );
      c.lineTo(
        ex - headLen * Math.cos(angle + Math.PI / 7),
        ey - headLen * Math.sin(angle + Math.PI / 7)
      );
      c.closePath();
      c.fillStyle = color;
      c.fill();
    }

    c.restore();
  }

  // ─────────────────────────────────────────
  // POINTER EVENT HANDLERS
  // ─────────────────────────────────────────
  function onPointerDown(e) {
    e.preventDefault();
    saveHistory();
    isDrawing.current = true;
    const p = getPos(e);
    startPos.current = p;
    lastPos.current  = p;

    const isShape = ["rect", "circle", "line", "arrow"].includes(tool);
    if (isShape) return; // shapes wait for drag

    // Pen / eraser: draw a dot immediately on click
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    if (tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.arc(p.x, p.y, strokeSize * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,1)";
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    } else {
      ctx.arc(p.x, p.y, strokeSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  function onPointerMove(e) {
    if (!isDrawing.current) return;
    e.preventDefault();
    const p    = getPos(e);
    const ctx  = canvasRef.current.getContext("2d");
    const pCtx = previewRef.current.getContext("2d");

    if (tool === "pen") {
      // Continuous smooth line
      ctx.beginPath();
      ctx.globalCompositeOperation = "source-over";
      ctx.lineWidth   = strokeSize;
      ctx.strokeStyle = color;
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastPos.current = p;

    } else if (tool === "eraser") {
      // Erase by poking transparent holes
      ctx.beginPath();
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth   = strokeSize * 3;
      ctx.strokeStyle = "rgba(0,0,0,1)";
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      lastPos.current = p;

    } else {
      // Shape preview — dashed ghost on preview canvas
      const dpr = window.devicePixelRatio || 1;
      pCtx.clearRect(0, 0, previewRef.current.width / dpr, previewRef.current.height / dpr);
      renderShape(pCtx, startPos.current.x, startPos.current.y, p.x, p.y, true);
    }
  }

  function onPointerUp(e) {
    if (!isDrawing.current) return;
    isDrawing.current = false;

    const isShape = ["rect", "circle", "line", "arrow"].includes(tool);
    if (isShape) {
      // Commit shape to permanent canvas, clear preview
      const p    = getPos(e.changedTouches
        ? { clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY }
        : e
      );
      const ctx  = canvasRef.current.getContext("2d");
      const pCtx = previewRef.current.getContext("2d");
      renderShape(ctx, startPos.current.x, startPos.current.y, p.x, p.y, false);
      const dpr = window.devicePixelRatio || 1;
      pCtx.clearRect(0, 0, previewRef.current.width / dpr, previewRef.current.height / dpr);
    }

    canvasRef.current.getContext("2d").globalCompositeOperation = "source-over";
    checkContent();
  }

  // ─────────────────────────────────────────
  // KEYBOARD SHORTCUTS
  // ─────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo(); }
      if (e.key === "Escape") setModal((m) => ({ ...m, open: false }));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ─────────────────────────────────────────
  // CALCULATE
  // Sends canvas image to our Express backend
  // Backend holds the Gemini key — never exposed to browser
  //
  // Flow:
  // 1. Export canvas as white-bg base64 PNG
  // 2. POST to http://localhost:3001/calculate
  // 3. Backend calls Gemini and returns { result: "..." }
  // 4. Parse result into sections and show in modal
  // ─────────────────────────────────────────
  async function calculate() {
    if (!hasContent) {
      alert("Please draw something first.");
      return;
    }

    setLoading(true);
    setModal({ open: true, data: null, error: null });

    try {
      // Step 1: Export canvas with white background
      // (Gemini sees clean white, not transparent)
      const canvas = canvasRef.current;
      const dpr    = window.devicePixelRatio || 1;
      const w      = canvas.width  / dpr;
      const h      = canvas.height / dpr;

      const temp   = document.createElement("canvas");
      temp.width   = canvas.width;
      temp.height  = canvas.height;
      const tc     = temp.getContext("2d");
      tc.scale(dpr, dpr);
      tc.fillStyle = "#ffffff";
      tc.fillRect(0, 0, w, h);
      tc.drawImage(canvas, 0, 0, w, h);

      // Strip the "data:image/png;base64," prefix
      const b64 = temp.toDataURL("image/png").split(",")[1];

      // Step 2: Send to our backend
      const res = await fetch("https://ai-calculator-v618.onrender.com/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: b64 }),
      });

      const data = await res.json();

      // Step 3: Handle errors from backend
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);

      // Step 4: Parse and display result
      setModal({ open: true, data: parseGeminiResponse(data.result), error: null });

    } catch (err) {
      // Show network or server errors in modal
      setModal({ open: true, data: null, error: err.message });
    } finally {
      setLoading(false);
    }
  }

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────
  return (
    <div className="app">

      {/* ── Header ── */}
      <header className="header">
        <h1 className="header-title">AI Drawing Calculator</h1>
        <span className="header-sub">Powered by Gemini Vision</span>
      </header>

      {/* ── Toolbar ── */}
      <Toolbar
        tool={tool}           setTool={setTool}
        color={color}         setColor={setColor}
        strokeSize={strokeSize} setStroke={setStroke}
        onUndo={undo}
      />

      {/* ── Canvas area — fills all remaining space ── */}
      <div className="canvas-area" ref={areaRef}>

        {/* Layer 1: permanent drawing */}
        <canvas ref={canvasRef} className="draw-canvas" />

        {/* Layer 2: shape preview + event target (on top) */}
        <canvas
          ref={previewRef}
          className="preview-canvas"
          style={{ cursor: tool === "eraser" ? "cell" : undefined }}
          onMouseDown={onPointerDown}
          onMouseMove={onPointerMove}
          onMouseUp={onPointerUp}
          onMouseLeave={onPointerUp}
          onTouchStart={onPointerDown}
          onTouchMove={onPointerMove}
          onTouchEnd={onPointerUp}
        />

        {/* Hint — visible until user starts drawing */}
        {!hasContent && (
          <div className="canvas-hint">
            <p>Draw an equation, shape, or diagram<br />then click Calculate</p>
          </div>
        )}
        <style>{`
  .canvas-area { cursor: none; }
  .preview-canvas { cursor: none; }
`}</style>
      </div>

      {/* ── Bottom action bar ── */}
      <div className="calc-bar">
        <button className="clear-btn" onClick={clearAll}>
          Clear All
        </button>
        <button className="calc-btn" onClick={calculate} disabled={loading}>
          {loading ? (
            <>
              <span className="spinner" />
              Sending…
            </>
          ) : (
            <>
              <svg
                width="15" height="15"
                fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round"
                viewBox="0 0 24 24"
              >
                <path d="M13 2L3 14h9l-1 8 10-12h-9z" />
              </svg>
              Calculate with Gemini
            </>
          )}
        </button>
      </div>

      {/* ── Result modal ── */}
      <ResultModal
        open={modal.open}
        loading={loading}
        data={modal.data}
        error={modal.error}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
      />
    </div>
  );
}