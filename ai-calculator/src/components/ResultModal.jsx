// ─────────────────────────────────────────────────────────────
// ResultModal.jsx
// Slide-up modal that shows:
//  - Loading spinner while Gemini is thinking
//  - Structured result (What I see / Solution / Answer)
//  - Error message if the API call fails
// ─────────────────────────────────────────────────────────────

export default function ResultModal({ open, loading, data, error, onClose }) {
  if (!open) return null;

  // Close if user clicks the dark backdrop (not the modal card itself)
  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdrop}>
      <div className="modal">

        {/* Header */}
        <div className="modal-header">
          <span className="modal-title">
            {loading ? "Analyzing…" : error ? "Error" : "Result"}
          </span>
          <button className="modal-close" onClick={onClose} title="Close (Esc)">
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
              <line x1="18" y1="6"  x2="6"  y2="18" />
              <line x1="6"  y1="6"  x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">

          {/* ── Loading state ── */}
          {loading && (
            <div className="modal-loader">
              <div className="modal-spinner" />
              <p>Sending to Gemini Vision…</p>
            </div>
          )}

          {/* ── Error state ── */}
          {!loading && error && (
            <div className="modal-error">{error}</div>
          )}

          {/* ── Success: structured result ── */}
          {!loading && data && (
            <div className="modal-result">

              {data.what && (
                <Section label="What I see" body={data.what} />
              )}

              {data.steps && (
                <Section label="Step-by-step solution" body={data.steps} />
              )}

              {data.answer && (
                <div className="result-answer-wrap">
                  <div className="result-section-label">Answer</div>
                  <div className="result-answer">{data.answer}</div>
                </div>
              )}

              {/* Fallback: raw text if parsing found no sections */}
              {!data.what && !data.steps && !data.answer && (
                <div className="result-section-body">{data.raw}</div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// Small helper component for labelled sections
function Section({ label, body }) {
  return (
    <div className="result-section">
      <div className="result-section-label">{label}</div>
      <div className="result-section-body">{body}</div>
    </div>
  );
}
