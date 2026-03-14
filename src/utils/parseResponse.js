// ─────────────────────────────────────────────────────────────
// parseResponse.js
// Parses the raw Gemini text response into structured sections.
//
// Gemini is prompted to return exactly:
//   What I see: …
//   Solution:
//   …numbered steps…
//   Answer: …
//
// We use regex to extract each section. If parsing fails we fall
// back to returning { raw: text } so nothing is lost.
// ─────────────────────────────────────────────────────────────

export function parseGeminiResponse(text) {
  if (!text) return { raw: "" };

  // Each regex captures everything after the label up until the
  // next known label or end-of-string. The 'si' flags make it
  // case-insensitive and allow . to match newlines.
  const whatMatch   = text.match(/what i see[:\s*]*(.+?)(?=solution:|steps:|answer:|$)/si);
  const stepsMatch  = text.match(/(?:solution|steps)[:\s*]*(.+?)(?=answer:|$)/si);
  const answerMatch = text.match(/answer[:\s*]*(.+?)$/si);

  const what   = whatMatch?.[1]?.trim();
  const steps  = stepsMatch?.[1]?.trim();
  const answer = answerMatch?.[1]?.trim();

  // If we found at least one section, return structured data
  if (what || steps || answer) {
    return { what, steps, answer, raw: text };
  }

  // Fallback — return raw text for display
  return { raw: text };
}
