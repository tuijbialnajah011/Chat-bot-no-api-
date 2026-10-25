import { GoogleGenAI } from '@google/genai';

const AVAILABLE_MODELS = [
  {
    id: 'llama-3.3-70b',
    label: 'Llama 3.3 70B',
    providerId: 'ovh',
    providerName: 'OVHcloud AI',
    upstreamModel: 'Meta-Llama-3_3-70B-Instruct',
  },
  {
    id: 'gpt-oss-120b',
    label: 'GPT-OSS 120B',
    providerId: 'ovh',
    providerName: 'OVHcloud AI',
    upstreamModel: 'gpt-oss-120b',
  },
  {
    id: 'qwen-3.5-397b',
    label: 'Qwen 3.5 397B',
    providerId: 'ovh',
    providerName: 'OVHcloud AI',
    upstreamModel: 'Qwen3.5-397B-A17B',
  },
  {
    id: 'qwen-3.8-27b',
    label: 'Qwen 3.8 27B',
    providerId: 'ovh',
    providerName: 'OVHcloud AI',
    upstreamModel: 'Qwen3.8-27B',
  },
  {
    id: 'mistral-small-3.2',
    label: 'Mistral Small 3.2',
    providerId: 'ovh',
    providerName: 'OVHcloud AI',
    upstreamModel: 'Mistral-Small-3.2-24B-Instruct-2506',
  },
  {
    id: 'gpt-oss-20b-fast',
    label: 'GPT-OSS 20B Fast',
    providerId: 'pollinations',
    providerName: 'Pollinations',
    upstreamModel: 'openai-fast',
  },
  {
    id: 'mistral-nemo',
    label: 'Mistral Nemo 12B',
    providerId: 'ovh',
    providerName: 'OVHcloud AI',
    upstreamModel: 'Mistral-Nemo-Instruct-2407',
  },
  {
    id: 'gemini-3.8-flash',
    label: 'Gemini 3.8 Flash',
    providerId: 'gemini',
    providerName: 'Google AI Studio',
    upstreamModel: 'gemini-3.8-flash',
  },
];

async function callOvhEndpoint(upstreamModel, messages) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch('https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: upstreamModel,
        messages,
        max_tokens: 2048,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    const msg = data.choices?.[0]?.message;
    const reasoning = (msg?.reasoning || msg?.reasoning_content || '').trim() || undefined;
    const content = (msg?.content || '').trim() || reasoning || '';

    if (!content) {
      throw new Error('Empty response from OVH endpoint');
    }

    return { content, reasoning: msg?.content ? reasoning : undefined };
  } finally {
    clearTimeout(timeout);
  }
}

async function callPollinationsEndpoint(upstreamModel, messages) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: upstreamModel || 'openai-fast',
        messages,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    const msg = data.choices?.[0]?.message;
    const reasoning = (msg?.reasoning || msg?.reasoning_content || '').trim() || undefined;
    const content = (msg?.content || '').trim() || reasoning || '';

    if (!content) {
      throw new Error('Empty response from Pollinations');
    }

    return { content, reasoning: msg?.content ? reasoning : undefined };
  } finally {
    clearTimeout(timeout);
  }
}

async function callGeminiEndpoint(upstreamModel, messages) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const systemMsg = messages.find((m) => m.role === 'system')?.content;
  const conversationText = messages
    .filter((m) => m.role !== 'system')
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  const response = await ai.models.generateContent({
    model: upstreamModel,
    contents: conversationText || 'Hello',
    config: systemMsg ? { systemInstruction: systemMsg } : undefined,
  });

  const text = response.text?.trim();
  if (!text) {
    throw new Error('Empty response from Gemini');
  }

  return { content: text };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { messages, model = 'auto', prompt } = body;

    let normalizedMessages = [];
    if (Array.isArray(messages) && messages.length > 0) {
      normalizedMessages = messages
        .filter((m) => typeof m?.content === 'string' && m.content.trim())
        .map((m) => ({
          role: m.role === 'assistant' || m.role === 'system' ? m.role : 'user',
          content: m.content.trim(),
        }));
    } else if (typeof prompt === 'string' && prompt.trim()) {
      normalizedMessages = [{ role: 'user', content: prompt.trim() }];
    }

    if (normalizedMessages.length === 0) {
      res.status(400).json({ error: 'Please enter a message.' });
      return;
    }

    const startedAt = Date.now();
    const candidates = [];

    if (model && model !== 'auto') {
      const picked = AVAILABLE_MODELS.find((m) => m.id === model || m.upstreamModel === model);
      if (picked) candidates.push(picked);
    }

    for (const item of AVAILABLE_MODELS) {
      if (!candidates.some((c) => c.id === item.id)) {
        candidates.push(item);
      }
    }

    const attempts = [];

    for (const candidate of candidates) {
      const hopStart = Date.now();
      try {
        let result;
        if (candidate.providerId === 'ovh') {
          result = await callOvhEndpoint(candidate.upstreamModel, normalizedMessages);
        } else if (candidate.providerId === 'pollinations') {
          result = await callPollinationsEndpoint(candidate.upstreamModel, normalizedMessages);
        } else {
          result = await callGeminiEndpoint(candidate.upstreamModel, normalizedMessages);
        }

        const latencyMs = Date.now() - hopStart;
        attempts.push({
          model: candidate.label,
          provider: candidate.providerName,
          status: 'ok',
          latencyMs,
        });

        res.status(200).json({
          content: result.content,
          reasoning: result.reasoning,
          resolvedModelId: candidate.id,
          resolvedModelLabel: candidate.label,
          resolvedProvider: candidate.providerName,
          upstreamModel: candidate.upstreamModel,
          totalLatencyMs: Date.now() - startedAt,
          attempts,
        });
        return;
      } catch {
        const latencyMs = Date.now() - hopStart;
        attempts.push({
          model: candidate.label,
          provider: candidate.providerName,
          status: 'failover',
          latencyMs,
        });
      }
    }

    res.status(502).json({
      error: 'All free model endpoints are temporarily busy. Please try again in a few seconds.',
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Internal server error',
    });
  }
}
