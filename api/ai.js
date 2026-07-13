module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  const { prompt, system } = req.body || {};
  if (!prompt) return res.status(400).json({ ok: false, error: 'prompt required' });
  const gk = process.env.GEMINI_API_KEY;
  if (!gk) return res.status(501).json({ ok: false, error: 'GEMINI_API_KEY env var tələb olunur' });
  try {
    const contents = [];
    if (system) { contents.push({ role: 'user', parts: [{ text: 'System: ' + system }] }, { role: 'model', parts: [{ text: 'OK.' }] }); }
    contents.push({ role: 'user', parts: [{ text: prompt }] });
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + gk, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: 2048, temperature: 0.7 } })
    });
    if (!r.ok) { const t = await r.text(); return res.status(r.status).json({ ok: false, error: 'Gemini ' + r.status + ': ' + t.slice(0, 200) }); }
    const d = await r.json();
    const t = d?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (t) return res.json({ ok: true, text: t });
    return res.status(500).json({ ok: false, error: 'empty response' });
  } catch (e) { return res.status(502).json({ ok: false, error: e.message }); }
};
