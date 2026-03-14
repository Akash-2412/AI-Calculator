// ─────────────────────────────────────────────────────────────
// Toolbar.jsx
// Renders the drawing tools, color palette, stroke sizes, undo.
// All state lives in App and is passed down via props.
// ─────────────────────────────────────────────────────────────

const COLORS = [
  { hex: "#1a1a1a", label: "Black"  },
  { hex: "#e24b4a", label: "Red"    },
  { hex: "#378add", label: "Blue"   },
  { hex: "#639922", label: "Green"  },
  { hex: "#BA7517", label: "Amber"  },
  { hex: "#7F77DD", label: "Purple" },
];

const STROKES = [
  { size: 2,  dot: 4  },
  { size: 4,  dot: 7  },
  { size: 8,  dot: 11 },
];

// Small reusable icon button
function TBtn({ id, active, title, onClick, children }) {
  return (
    <button
      id={id}
      title={title}
      onClick={onClick}
      className={`tb-btn ${active ? "tb-btn--active" : ""}`}
    >
      {children}
    </button>
  );
}

// SVG icons — kept inline to avoid an icon lib dependency
const Icons = {
  pen: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4z"/>
    </svg>
  ),
  eraser: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 20H7L3 16l11-11 6 6-3.5 3.5"/><path d="M6 11l7 7"/>
    </svg>
  ),
  rect: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="3" y="5" width="18" height="14" rx="1"/>
    </svg>
  ),
  circle: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9"/>
    </svg>
  ),
  line: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="4" y1="20" x2="20" y2="4"/>
    </svg>
  ),
  arrow: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="19" x2="19" y2="5"/><polyline points="9 5 19 5 19 15"/>
    </svg>
  ),
  undo: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 100-.49"/>
    </svg>
  ),
};

export default function Toolbar({ tool, setTool, color, setColor, strokeSize, setStroke, onUndo }) {
  return (
    <div className="toolbar">
      {/* ── Drawing tools ── */}
      <span className="tb-label">Tool</span>
      <TBtn active={tool === "pen"}    title="Pen (P)"    onClick={() => setTool("pen")}>{Icons.pen}</TBtn>
      <TBtn active={tool === "eraser"} title="Eraser (E)" onClick={() => setTool("eraser")}>{Icons.eraser}</TBtn>

      <div className="tb-sep" />

      {/* ── Shapes ── */}
      <span className="tb-label">Shape</span>
      <TBtn active={tool === "rect"}   title="Rectangle" onClick={() => setTool("rect")}>{Icons.rect}</TBtn>
      <TBtn active={tool === "circle"} title="Circle"    onClick={() => setTool("circle")}>{Icons.circle}</TBtn>
      <TBtn active={tool === "line"}   title="Line"      onClick={() => setTool("line")}>{Icons.line}</TBtn>
      <TBtn active={tool === "arrow"}  title="Arrow"     onClick={() => setTool("arrow")}>{Icons.arrow}</TBtn>

      <div className="tb-sep" />

      {/* ── Colors ── */}
      <span className="tb-label">Color</span>
      {COLORS.map((c) => (
        <button
          key={c.hex}
          title={c.label}
          className={`color-swatch ${color === c.hex ? "color-swatch--active" : ""}`}
          style={{ background: c.hex }}
          onClick={() => { setColor(c.hex); if (tool === "eraser") setTool("pen"); }}
        />
      ))}

      <div className="tb-sep" />

      {/* ── Stroke sizes ── */}
      <span className="tb-label">Size</span>
      {STROKES.map((s) => (
        <button
          key={s.size}
          title={`${s.size}px`}
          className={`stroke-btn ${strokeSize === s.size ? "stroke-btn--active" : ""}`}
          onClick={() => setStroke(s.size)}
        >
          <span className="stroke-dot" style={{ width: s.dot, height: s.dot }} />
        </button>
      ))}

      <div className="tb-sep" />

      {/* ── Undo ── */}
      <TBtn title="Undo (Ctrl+Z)" onClick={onUndo}>{Icons.undo}</TBtn>
    </div>
  );
}
