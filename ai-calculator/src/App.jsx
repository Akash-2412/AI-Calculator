import { useEffect, useRef, useState, useCallback } from "react";
import Toolbar from "./components/Toolbar";
import ResultModal from "./components/ResultModal";
import { parseGeminiResponse } from "./utils/parseResponse";
import "./App.css";

// ─────────────────────────────────────────────────────────────
// App — root component
// Manages all drawing state, canvas logic, and Gemini API call
// ─────────────────────────────────────────────────────────────
export default function App() {
  // ── Refs ──
  const areaRef    = useRef(null);   // wrapper div (for sizing)
  const canvasRef  = useRef(null);   // permanent drawing layer
  const previewRef = useRef(null);   // shape-preview overlay layer
  const historyRef = useRef([]);     // undo snapshots (ImageData[])

  // ── Drawing state ──
  const [tool, setTool]           = useState("pen");
  const [color, setColor]         = useState("#1a1a1a");
  const [strokeSize, setStroke]   = useState(4);
  const [hasContent, setHasContent] = useState(false);
  const isDrawing = useRef(false);
  const startPos  = useRef({ x: 0, y: 0 });
  const lastPos   = useRef({ x: 0, y: 0 });

  // ── API / Modal state ──
  const [apiKey, setApiKey]   = useState("");
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
  // After any operation, scan pixels to set hasContent
  // (controls hint text visibility and button state)
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
  // Used by both the preview layer (dashed) and commit (solid)
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
      // roundRect gives nicer corners
      c.roundRect(Math.min(sx, ex), Math.min(sy, ey), Math.abs(ex - sx), Math.abs(ey - sy), 3);
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
      // Shaft
      c.moveTo(sx, sy);
      c.lineTo(ex, ey);
      c.stroke();
      // Filled arrowhead — atan2 gives the angle, ±π/7 offsets the wings
      const angle   = Math.atan2(ey - sy, ex - sx);
      const headLen = Math.max(14, strokeSize * 3.5);
      c.setLineDash([]);
      c.beginPath();
      c.moveTo(ex, ey);
      c.lineTo(ex - headLen * Math.cos(angle - Math.PI / 7), ey - headLen * Math.sin(angle - Math.PI / 7));
      c.lineTo(ex - headLen * Math.cos(angle + Math.PI / 7), ey - headLen * Math.sin(angle + Math.PI / 7));
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
    if (isShape) return; // shapes wait until mousemove

    // Pen / eraser: draw a dot on click (no drag needed)
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
    const p   = getPos(e);
    const ctx = canvasRef.current.getContext("2d");
    const pCtx = previewRef.current.getContext("2d");

    if (tool === "pen") {
      ctx.beginPath();
      ctx.globalCompositeOperation = "source-over";
      ctx.lineWidth   = strokeSize;
      ctx.strokeStyle = color;
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastPos.current = p;

    } else if (tool === "eraser") {
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
      // Shape preview: clear preview canvas, redraw ghost
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
      const p   = getPos(e.changedTouches ? { clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY } : e);
      const ctx = canvasRef.current.getContext("2d");
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
  // GEMINI API CALL
  // 1. Stamp canvas onto white background
  // 2. Export as base64 PNG
  // 3. POST to Gemini 1.5 Flash vision endpoint
  // 4. Parse structured response
  // ─────────────────────────────────────────
  async function calculate() {
    if (!apiKey.trim()) { alert("Please enter your Gemini API key."); return; }
    if (!hasContent)    { alert("Please draw something first."); return; }

    setLoading(true);
    setModal({ open: true, data: null, error: null });

    try {
      // White-background export
      const canvas = canvasRef.current;
      const dpr    = window.devicePixelRatio || 1;
      const w      = canvas.width / dpr;
      const h      = canvas.height / dpr;
      const temp   = document.createElement("canvas");
      temp.width   = canvas.width;
      temp.height  = canvas.height;
      const tc     = temp.getContext("2d");
      tc.scale(dpr, dpr);
      tc.fillStyle = "#ffffff";
      tc.fillRect(0, 0, w, h);
      tc.drawImage(canvas, 0, 0, w, h);
      const b64 = temp.toDataURL("image/png").split(",")[1];

      const prompt = `You are an expert math and science solver. The user has drawn a problem on a canvas.

Please respond in this EXACT format (keep the labels exactly as shown):
What I see: [describe what is drawn — equation, diagram, expression etc.]
Solution:
[numbered steps showing all working clearly]
Answer: [the final answer, concise]

If the drawing is unclear, still follow the format and describe what you see.`;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: "image/png", data: b64 } },
              { text: prompt },
            ],
          }],
          generationConfig: { temperature: 0.15, maxOutputTokens: 1024 },
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);

      const text = data.candidates?.[0]?.content?.parts
        ?.filter((p) => p.text)
        .map((p) => p.text)
        .join("\n");

      if (!text) {
        const reason = data.candidates?.[0]?.finishReason;
        throw new Error(reason === "SAFETY" ? "Response blocked by safety filter." : "No response from Gemini.");
      }

      setModal({ open: true, data: parseGeminiResponse(text), error: null });

    } catch (err) {
      setModal({ open: true, data: null, error: err.message });
    } finally {
      setLoading(false);
    }
  }

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────
  const isShapeTool = ["rect", "circle", "line", "arrow"].includes(tool);
  const cursorStyle = tool === "eraser" ? "cell" : "crosshair";

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <h1 className="header-title">AI Drawing Calculator</h1>
        <div className="api-wrap">
          <label className="api-label" htmlFor="apiKey">Gemini Key</label>
          <input
            id="apiKey"
            type="password"
            className="api-input"
            placeholder="AIza…"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
          />
        </div>
      </header>

      {/* Toolbar */}
      <Toolbar
        tool={tool}      setTool={setTool}
        color={color}    setColor={setColor}
        strokeSize={strokeSize} setStroke={setStroke}
        onUndo={undo}
      />

      {/* Canvas area */}
      <div className="canvas-area" ref={areaRef}>
        {/* Permanent drawing layer */}
        <canvas ref={canvasRef} className="draw-canvas" />

        {/* Shape preview layer — also the event target (sits on top) */}
        <canvas
          ref={previewRef}
          className="preview-canvas"
          style={{ cursor: cursorStyle }}
          onMouseDown={onPointerDown}
          onMouseMove={onPointerMove}
          onMouseUp={onPointerUp}
          onMouseLeave={onPointerUp}
          onTouchStart={onPointerDown}
          onTouchMove={onPointerMove}
          onTouchEnd={onPointerUp}
        />

        {/* Hint text — hidden once user starts drawing */}
        {!hasContent && (
          <div className="canvas-hint">
            <p>Draw equations, shapes, or diagrams<br />then click Calculate</p>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="calc-bar">
        <button className="clear-btn" onClick={clearAll}>Clear All</button>
        <button className="calc-btn" onClick={calculate} disabled={loading}>
          {loading ? (
            <><span className="spinner" /> Sending…</>
          ) : (
            <>
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
                <path d="M13 2L3 14h9l-1 8 10-12h-9z" />
              </svg>
              Calculate with Gemini
            </>
          )}
        </button>
      </div>

      {/* Result modal */}
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
