// ════════════════════════════════════════════════════════════
// POST /api/ai
// Body: { prompt: string, system?: string }
// Response: { ok: true, text: string, provider: string }
//
// This is the ONLY place an AI provider key is ever read.
// The frontend never sees any key — it only talks to this URL.
// ════════════════════════════════════════════════════════════

const { routeAICall } = require('./_router');

module.exports = async function handler(req, res) {
  // CORS: allow the GitHub Pages frontend to call this endpoint.
  // Tighten ALLOWED_ORIGIN in production once your Pages URL is final.
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const { prompt, system } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ ok: false, error: 'Missing or invalid "prompt"' });
      return;
    }
    if (prompt.length > 8000) {
      res.status(400).json({ ok: false, error: 'Prompt too long' });
      return;
    }

    const result = await routeAICall(prompt, typeof system === 'string' ? system : undefined);
    res.status(200).json(result);
  } catch (err) {
    // routeAICall is designed to never throw (it degrades to offline),
    // so reaching here means something unexpected happened.
    res.status(500).json({ ok: false, error: 'Internal server error' });
  }
};
