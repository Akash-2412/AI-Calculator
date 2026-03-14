// server.js — Express backend
// Keeps your Gemini API key secret on the server side
// The frontend sends the canvas image here, we forward it to Gemini

import express from "express";
import cors from "cors";

// Load variables from .env file into process.env
//dotenv.config({ override: false });

const app = express();
const PORT = process.env.PORT || 3001;

// Allow requests from the React frontend (localhost:5173)
app.use(cors({ origin: "*" }));

// Accept large base64 image payloads (canvas can be big)
app.use(express.json({ limit: "10mb" }));

// ── POST /calculate ──
// Frontend sends: { imageBase64: "..." }
// We send it to Gemini and return the result
app.post("/calculate", async (req, res) => {
  const { imageBase64 } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: "No image provided" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Gemini API key not configured on server" });
  }

  const prompt = `You are an expert math and science solver. The user has drawn a problem on a canvas.

Please respond in this EXACT format (keep the labels exactly as shown):
What I see: [describe what is drawn — equation, diagram, expression etc.]
Solution:
[numbered steps showing all working clearly]
Answer: [the final answer, concise]

If the drawing is unclear, still follow the format and describe what you see.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: "image/png", data: imageBase64 } },
            { text: prompt },
          ],
        }],
        generationConfig: { temperature: 0.15, maxOutputTokens: 1024 },
      }),
    });

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      return res.status(geminiRes.status).json({ error: data.error?.message || "Gemini error" });
    }

    const text = data.candidates?.[0]?.content?.parts
      ?.filter((p) => p.text)
      .map((p) => p.text)
      .join("\n");

    if (!text) {
      return res.status(500).json({ error: "No response from Gemini" });
    }

    res.json({ result: text });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});