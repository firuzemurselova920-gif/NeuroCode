// ════════════════════════════════════════════════════════════
// NeuroCode AI Router — provider-agnostic core
// ────────────────────────────────────────────────────────────
// This module knows how to call each AI provider and normalizes
// every response to a single shape: { ok: true, text, provider }
// or { ok: false, error, provider }.
//
// Adding a new provider later = write one new `callX` function
// below and add it to the PROVIDER_CHAIN array. Nothing else
// in this file, the route handler, or the frontend needs to change.
// ════════════════════════════════════════════════════════════

// ---- Individual provider callers ----------------------------

async function callGemini(prompt, system) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not configured');

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  };
  if (system) body.system_instruction = { parts: [{ text: system }] };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  if (!text) throw new Error('Gemini returned empty response');
  return text;
}

async function callGPT(prompt, system) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not configured');

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model, messages, max_tokens: 1000 }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`GPT HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('GPT returned empty response');
  return text;
}

async function callClaude(prompt, system) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured');

  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  const body = {
    model,
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  };
  if (system) body.system = system;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Claude HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = (data?.content || []).map(c => c.text || '').filter(Boolean).join('\n');
  if (!text) throw new Error('Claude returned empty response');
  return text;
}

// ---- Offline fallback (always succeeds, never throws) -------
// Used only when every live provider has failed. Keeps the
// feature "working" in a degraded form instead of showing
// nothing to the student/teacher.
function offlineFallback(prompt) {
  return {
    text:
      'AI server hazırda əlçatan deyil. Bu, avtomatik yaranan ümumi rəydir: ' +
      'cavabınızı diqqətlə yoxlayın — əsas fikir aydın ifadə olunubmu, dəlillərlə ' +
      'dəstəklənibmi və nəticə məntiqlə tezisə bağlıdırmı? Real AI qiymətləndirməsi ' +
      'üçün bir az sonra yenidən cəhd edin.',
    provider: 'offline',
  };
}

// ---- Provider chain (order = fallback priority) -------------
// Each entry: { name, fn }. To add GPT/Claude "for real" once
// keys exist, nothing here needs to change — they're already
// wired in. To reorder priority, just reorder this array.
const PROVIDER_CHAIN = [
  { name: 'gemini', fn: callGemini },
  { name: 'gpt', fn: callGPT },
  { name: 'claude', fn: callClaude },
];

// ---- Public entry point --------------------------------------
// Tries each provider in order; on failure (missing key, HTTP
// error, timeout, empty response) moves to the next. Only
// falls back to the offline static response if ALL fail.
async function routeAICall(prompt, system) {
  const attempts = [];

  for (const provider of PROVIDER_CHAIN) {
    try {
      const text = await provider.fn(prompt, system);
      return { ok: true, text, provider: provider.name, attempts };
    } catch (err) {
      attempts.push({ provider: provider.name, error: err.message });
      // continue to next provider
    }
  }

  // every provider failed — degrade gracefully, do not throw
  const fb = offlineFallback(prompt);
  return { ok: true, text: fb.text, provider: fb.provider, attempts, degraded: true };
}

module.exports = { routeAICall, PROVIDER_CHAIN };
