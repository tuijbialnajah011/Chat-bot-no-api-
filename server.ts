import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

const PORT = 3000;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelOption {
  id: string;
  label: string;
  providerId: 'ovh' | 'pollinations' | 'gemini' | 'groq' | 'cerebras' | 'openrouter' | 'mistral';
  providerName: string;
  upstreamModel: string;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: 'llama-3.3-70b',
    label: 'Llama 3.3 70B Instruct',
    providerId: 'ovh',
    providerName: 'OVHcloud AI Free Tier',
    upstreamModel: 'Meta-Llama-3_3-70B-Instruct',
  },
  {
    id: 'gpt-oss-120b',
    label: 'GPT-OSS 120B',
    providerId: 'ovh',
    providerName: 'OVHcloud AI Free Tier',
    upstreamModel: 'gpt-oss-120b',
  },
  {
    id: 'qwen-3.5-397b',
    label: 'Qwen 3.5 397B MoE',
    providerId: 'ovh',
    providerName: 'OVHcloud AI Free Tier',
    upstreamModel: 'Qwen3.5-397B-A17B',
  },
  {
    id: 'qwen-3.8-27b',
    label: 'Qwen 3.8 27B',
    providerId: 'ovh',
    providerName: 'OVHcloud AI Free Tier',
    upstreamModel: 'Qwen3.8-27B',
  },
  {
    id: 'mistral-small-3.2',
    label: 'Mistral Small 3.2 24B',
    providerId: 'ovh',
    providerName: 'OVHcloud AI Free Tier',
    upstreamModel: 'Mistral-Small-3.2-24B-Instruct-2506',
  },
  {
    id: 'gpt-oss-20b-fast',
    label: 'GPT-OSS 20B Fast',
    providerId: 'pollinations',
    providerName: 'Pollinations Free Gateway',
    upstreamModel: 'openai-fast',
  },
  {
    id: 'mistral-nemo',
    label: 'Mistral Nemo 12B',
    providerId: 'ovh',
    providerName: 'OVHcloud AI Free Tier',
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

const cooldownUntilByModel = new Map<string, number>();

function isModelAvailable(modelId: string): boolean {
  const until = cooldownUntilByModel.get(modelId);
  if (!until) return true;
  if (Date.now() >= until) {
    cooldownUntilByModel.delete(modelId);
    return true;
  }
  return false;
}

function markModelCooldown(modelId: string, durationMs: number) {
  cooldownUntilByModel.set(modelId, Date.now() + durationMs);
}

async function callOvhEndpoint(
  upstreamModel: string,
  messages: ChatMessage[]
): Promise<{ content: string; reasoning?: string }> {
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

    const data = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          reasoning?: string | null;
          reasoning_content?: string | null;
        };
      }>;
    };

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

async function callPollinationsEndpoint(
  upstreamModel: string,
  messages: ChatMessage[]
): Promise<{ content: string; reasoning?: string }> {
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

    const data = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          reasoning?: string | null;
          reasoning_content?: string | null;
        };
      }>;
    };

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

async function callGeminiEndpoint(
  upstreamModel: string,
  messages: ChatMessage[]
): Promise<{ content: string; reasoning?: string }> {
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

async function routeChatCompletion(options: {
  messages: ChatMessage[];
  requestedModelId?: string;
}) {
  const startedAt = Date.now();
  const candidates: ModelOption[] = [];

  if (options.requestedModelId && options.requestedModelId !== 'auto') {
    const picked = AVAILABLE_MODELS.find(
      (m) => m.id === options.requestedModelId || m.upstreamModel === options.requestedModelId
    );
    if (picked) {
      candidates.push(picked);
    }
  }

  for (const model of AVAILABLE_MODELS) {
    if (!candidates.some((c) => c.id === model.id) && isModelAvailable(model.id)) {
      candidates.push(model);
    }
  }

  if (candidates.length === 0) {
    candidates.push(...AVAILABLE_MODELS);
  }

  const attempts: Array<{ model: string; provider: string; status: string; latencyMs: number }> = [];

  for (const candidate of candidates) {
    const hopStart = Date.now();
    try {
      let result: { content: string; reasoning?: string };
      if (candidate.providerId === 'ovh') {
        result = await callOvhEndpoint(candidate.upstreamModel, options.messages);
      } else if (candidate.providerId === 'pollinations') {
        result = await callPollinationsEndpoint(candidate.upstreamModel, options.messages);
      } else {
        result = await callGeminiEndpoint(candidate.upstreamModel, options.messages);
      }

      const latencyMs = Date.now() - hopStart;
      attempts.push({
        model: candidate.label,
        provider: candidate.providerName,
        status: 'ok',
        latencyMs,
      });

      return {
        content: result.content,
        reasoning: result.reasoning,
        resolvedModelId: candidate.id,
        resolvedModelLabel: candidate.label,
        resolvedProvider: candidate.providerName,
        upstreamModel: candidate.upstreamModel,
        totalLatencyMs: Date.now() - startedAt,
        attempts,
      };
    } catch (err) {
      const latencyMs = Date.now() - hopStart;
      const errMsg = err instanceof Error ? err.message : String(err);
      const isAuthOrSuspended =
        errMsg.includes('401') || errMsg.includes('403') || errMsg.includes('CONSUMER_SUSPENDED');
      markModelCooldown(candidate.id, isAuthOrSuspended ? 10 * 60_000 : 20_000);

      attempts.push({
        model: candidate.label,
        provider: candidate.providerName,
        status: isAuthOrSuspended ? 'auth_unavailable' : 'failover',
        latencyMs,
      });
    }
  }

  throw new Error('All free model endpoints are temporarily busy. Please try again in a few seconds.');
}

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/api/models', (_req: Request, res: Response) => {
  res.json({
    models: AVAILABLE_MODELS.map((m) => ({
      ...m,
      available: isModelAvailable(m.id),
    })),
  });
});

app.post('/api/chat', async (req: Request, res: Response) => {
  try {
    const { messages, model = 'auto', prompt } = req.body || {};

    let normalizedMessages: ChatMessage[] = [];
    if (Array.isArray(messages) && messages.length > 0) {
      normalizedMessages = messages
        .filter((m: { content?: unknown }) => typeof m?.content === 'string' && m.content.trim())
        .map((m: { role?: string; content: string }) => ({
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

    const result = await routeChatCompletion({
      messages: normalizedMessages,
      requestedModelId: model,
    });

    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Request failed';
    res.status(502).json({ error: message });
  }
});

app.post('/v1/chat/completions', async (req: Request, res: Response) => {
  try {
    const { model = 'auto', messages = [] } = req.body || {};
    const result = await routeChatCompletion({
      messages: Array.isArray(messages) ? messages : [],
      requestedModelId: String(model),
    });

    res.json({
      id: `chatcmpl-${Date.now().toString(36)}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: result.upstreamModel,
      provider: result.resolvedProvider,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: result.content,
          },
          finish_reason: 'stop',
        },
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gateway error';
    res.status(502).json({ error: { message } });
  }
});

async function startLocalServer() {
  if (process.env.VERCEL) return;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FreeLLM Chat Server running on http://0.0.0.0:${PORT}`);
  });
}

startLocalServer();

export default app;
