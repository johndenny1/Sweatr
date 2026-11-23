// Shared Gemini caller with retries and model fallbacks (used by scanning and scouting).

// Google Gemini — has a free tier (free-tier requests may be used by Google to improve its products).
// Free models get overloaded at busy times, so retry once and then fall back to other free models.
const GEMINI_FALLBACKS = ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geminiOnce(key, model, images, text, fast = true, opts = {}) {
  const generationConfig = { responseMimeType: 'application/json', temperature: opts.temperature ?? 0, maxOutputTokens: opts.maxOutputTokens ?? 8192 };
  // Reading a slip doesn't need the model to "think" first; skipping it saves seconds.
  if (fast) generationConfig.thinkingConfig = /2\.5/.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: 'minimal' };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [...images.map((data) => ({ inline_data: { mime_type: 'image/jpeg', data } })), { text }] }],
      generationConfig,
    }),
  });
  const data = await r.json().catch(() => ({}));
  // Model doesn't support that thinking setting: retry once without it.
  if (!r.ok && fast && r.status === 400 && /thinking/i.test(data?.error?.message || '')) return geminiOnce(key, model, images, text, false, opts);
  if (!r.ok) return { status: r.status, error: data?.error?.message || `Gemini returned ${r.status}` };
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return { text: parts.map((p) => p.text || '').join('') };
}

export async function askGemini(key, images, text, opts = {}) {
  const models = [...new Set([process.env.GEMINI_MODEL, ...GEMINI_FALLBACKS].filter(Boolean))];
  let last = null;
  for (const [i, model] of models.entries()) {
    for (let attempt = 0; attempt < (i === 0 ? 2 : 1); attempt++) {
      const result = await geminiOnce(key, model, images, text, true, opts);
      if (result.text) return result;
      last = result;
      // Busy / rate-limited / server error → try again or move on. 404 = model name not available → move on.
      if (![429, 500, 502, 503, 504, 404].includes(result.status)) return { error: result.error };
      if (attempt === 0 && i === 0) await sleep(600);
    }
  }
  return {
    error:
      last?.status === 429
        ? opts.limitMessage || 'Scan limit hit for now. Try again in a minute.'
        : opts.busyMessage || "Google's scanner is busy right now. Try again in a minute, or add the legs by hand.",
  };
}
