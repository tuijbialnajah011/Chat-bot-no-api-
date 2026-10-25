import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  ArrowUp,
  Trash2,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  PanelLeft,
  RotateCcw,
} from 'lucide-react';

interface ModelOption {
  id: string;
  label: string;
  providerId: string;
  providerName: string;
  upstreamModel: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  modelLabel?: string;
  providerName?: string;
  latencyMs?: number;
  failoverCount?: number;
  timestamp: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
}

const DEFAULT_MODELS: ModelOption[] = [
  {
    id: 'auto',
    label: 'Auto Router',
    providerId: 'auto',
    providerName: 'Smart Failover',
    upstreamModel: 'auto',
  },
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
];

const STARTER_PROMPTS = [
  {
    title: 'API Retry Architecture',
    prompt: 'Write a clean TypeScript fetch wrapper with exponential backoff and automatic 429 retry.',
  },
  {
    title: 'Authentication Security',
    prompt: 'Compare stateless JWT tokens vs server-side session cookies for a modern web application.',
  },
  {
    title: 'React Performance',
    prompt: 'Explain the most common causes of unnecessary re-renders in React 19 and how to fix them.',
  },
];

const STORAGE_KEY = 'freellm_chat_sessions_v1';

function createInitialSession(): ChatSession {
  return {
    id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: 'New Chat',
    messages: [],
    updatedAt: Date.now(),
  };
}

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return [createInitialSession()];
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() => sessions[0]?.id || '');
  const [selectedModel, setSelectedModel] = useState<string>('auto');
  const [modelMenuOpen, setModelMenuOpen] = useState<boolean>(false);
  const [input, setInput] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedReasoningIds, setExpandedReasoningIds] = useState<Record<string, boolean>>({});
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];
  const currentModelObj =
    DEFAULT_MODELS.find((m) => m.id === selectedModel) || DEFAULT_MODELS[0];

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch {
      // ignore storage errors
    }
  }, [sessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages.length, isSending]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        modelDropdownRef.current &&
        !modelDropdownRef.current.contains(e.target as Node)
      ) {
        setModelMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const adjustTextareaHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [input]);

  const handleNewChat = () => {
    const fresh = createInitialSession();
    setSessions((prev) => [fresh, ...prev]);
    setActiveSessionId(fresh.id);
    setErrorBanner(null);
    setMobileDrawerOpen(false);
    textareaRef.current?.focus();
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions((prev) => {
      const remaining = prev.filter((s) => s.id !== id);
      if (remaining.length === 0) {
        const fresh = createInitialSession();
        setActiveSessionId(fresh.id);
        return [fresh];
      }
      if (activeSessionId === id) {
        setActiveSessionId(remaining[0].id);
      }
      return remaining;
    });
  };

  const handleClearCurrentChat = () => {
    if (!activeSession) return;
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id
          ? { ...s, title: 'New Chat', messages: [], updatedAt: Date.now() }
          : s
      )
    );
    setErrorBanner(null);
  };

  const sendMessage = async (textToSend?: string) => {
    const content = (textToSend ?? input).trim();
    if (!content || isSending || !activeSession) return;

    const userMsg: Message = {
      id: `msg_${Date.now()}_u`,
      role: 'user',
      content,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const updatedMessages = [...activeSession.messages, userMsg];
    const nextTitle =
      activeSession.messages.length === 0
        ? content.slice(0, 34) + (content.length > 34 ? '...' : '')
        : activeSession.title;

    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id
          ? { ...s, title: nextTitle, messages: updatedMessages, updatedAt: Date.now() }
          : s
      )
    );

    if (!textToSend) {
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
    setIsSending(true);
    setErrorBanner(null);

    try {
      const normalizedHistory = updatedMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      let data: {
        content?: string;
        reasoning?: string;
        resolvedModelLabel?: string;
        resolvedProvider?: string;
        totalLatencyMs?: number;
        attempts?: unknown[];
        error?: string;
      } | null = null;

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: selectedModel,
            messages: normalizedHistory,
          }),
        });
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          data = await res.json();
        }
      } catch {
        // Fallback below if /api/chat is unavailable
      }

      if (!data || !data.content) {
        const fallbackStart = Date.now();
        const picked =
          DEFAULT_MODELS.find((m) => m.id === selectedModel && m.id !== 'auto') ||
          DEFAULT_MODELS[1];

        const fallbackRes = await fetch('https://text.pollinations.ai/openai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'openai-fast',
            messages: normalizedHistory,
          }),
        });

        if (!fallbackRes.ok) {
          throw new Error(`Request failed (HTTP ${fallbackRes.status})`);
        }

        const fallbackJson = await fallbackRes.json();
        const msg = fallbackJson.choices?.[0]?.message;
        const reasoning = (msg?.reasoning || msg?.reasoning_content || '').trim() || undefined;
        const text = (msg?.content || '').trim() || reasoning || '';
        if (!text) {
          throw new Error('Empty response from model');
        }

        data = {
          content: text,
          reasoning: msg?.content ? reasoning : undefined,
          resolvedModelLabel: picked.label,
          resolvedProvider: 'Direct Free Gateway',
          totalLatencyMs: Date.now() - fallbackStart,
          attempts: [1],
        };
      }

      const assistantMsg: Message = {
        id: `msg_${Date.now()}_a`,
        role: 'assistant',
        content: data.content || '',
        reasoning: data.reasoning,
        modelLabel: data.resolvedModelLabel,
        providerName: data.resolvedProvider,
        latencyMs: data.totalLatencyMs,
        failoverCount: Array.isArray(data.attempts) ? Math.max(0, data.attempts.length - 1) : 0,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSession.id
            ? {
                ...s,
                messages: [...updatedMessages, assistantMsg],
                updatedAt: Date.now(),
              }
            : s
        )
      );
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const toggleReasoning = (id: string) => {
    setExpandedReasoningIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="relative h-screen w-full bg-[#060911] text-slate-100 flex overflow-hidden select-none sm:select-auto">
      {/* Subtle Ambient Background Light Diffusion for Glass Depth */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden z-0"
      >
        <div className="absolute -top-40 left-1/4 w-[520px] h-[520px] rounded-full bg-sky-500/[0.07] blur-[130px]" />
        <div className="absolute bottom-[-180px] right-1/5 w-[480px] h-[480px] rounded-full bg-indigo-500/[0.06] blur-[140px]" />
      </div>

      {/* Mobile Scrim Overlay */}
      {mobileDrawerOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-30 md:hidden"
          onClick={() => setMobileDrawerOpen(false)}
        />
      )}

      {/* Frosted Glass Sidebar */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 flex flex-col justify-between transition-all duration-200 ease-out backdrop-blur-2xl bg-white/[0.025] border-r border-white/[0.07] shadow-[inset_-1px_0_0_0_rgba(255,255,255,0.03)] ${
          mobileDrawerOpen
            ? 'translate-x-0 w-[260px]'
            : '-translate-x-full md:translate-x-0'
        } ${sidebarOpen ? 'md:w-[260px]' : 'md:w-0 md:overflow-hidden md:border-r-0'}`}
      >
        <div className="p-3.5 flex flex-col h-full min-w-[260px]">
          {/* Sidebar Header & New Chat Action */}
          <div className="flex items-center justify-between gap-2 pb-3">
            <span className="text-sm font-semibold tracking-tight text-white/95 px-1.5 whitespace-nowrap">
              OmniFree Chat
            </span>
            <button
              type="button"
              onClick={handleNewChat}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-white bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.1] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] transition-all cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New</span>
            </button>
          </div>

          {/* Conversation History List */}
          <div className="flex-1 overflow-y-auto space-y-1 pr-0.5 mt-1">
            {sessions.map((session) => {
              const isActive = session.id === activeSession?.id;
              return (
                <div
                  key={session.id}
                  onClick={() => {
                    setActiveSessionId(session.id);
                    setMobileDrawerOpen(false);
                  }}
                  className={`group flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-xs cursor-pointer transition-all ${
                    isActive
                      ? 'bg-white/[0.09] text-white font-medium border border-white/[0.1] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]'
                      : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-60" />
                    <span className="truncate">{session.title}</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteSession(session.id, e)}
                    aria-label="Delete chat"
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-white/[0.06] transition-opacity shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Minimal Glass Footer Info */}
          <div className="pt-3 mt-2 border-t border-white/[0.06] px-1.5 flex items-center justify-between text-[11px] text-slate-400">
            <span>Smart Failover</span>
            <span className="font-mono tabular-nums text-slate-300">7 Free Models</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="relative z-10 flex-1 flex flex-col min-w-0 h-full">
        {/* Translucent Glass Top Navigation Bar */}
        <header className="h-14 shrink-0 px-4 sm:px-6 flex items-center justify-between gap-4 backdrop-blur-xl bg-[#060911]/60 border-b border-white/[0.07]">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                if (window.innerWidth < 768) {
                  setMobileDrawerOpen(!mobileDrawerOpen);
                } else {
                  setSidebarOpen(!sidebarOpen);
                }
              }}
              aria-label="Toggle sidebar"
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              <PanelLeft className="w-4 h-4" />
            </button>

            {/* Glassmorphic Model Selector Dropdown */}
            <div className="relative" ref={modelDropdownRef}>
              <button
                type="button"
                onClick={() => setModelMenuOpen(!modelMenuOpen)}
                className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl text-xs font-medium text-white backdrop-blur-xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.1] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] transition-all cursor-pointer whitespace-nowrap"
              >
                <span>{currentModelObj.label}</span>
                <span className="text-slate-400 font-normal hidden sm:inline">
                  · {currentModelObj.providerName}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {modelMenuOpen && (
                <div className="absolute left-0 mt-2 w-64 rounded-2xl p-1.5 backdrop-blur-2xl bg-[#0D1322]/90 border border-white/[0.12] shadow-2xl z-50 space-y-0.5">
                  {DEFAULT_MODELS.map((m) => {
                    const active = m.id === selectedModel;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setSelectedModel(m.id);
                          setModelMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-left transition-colors cursor-pointer ${
                          active
                            ? 'bg-white/[0.11] text-white font-medium'
                            : 'text-slate-300 hover:bg-white/[0.05] hover:text-white'
                        }`}
                      >
                        <span className="truncate">{m.label}</span>
                        <span className="text-[11px] font-mono text-slate-400 shrink-0 ml-2">
                          {m.providerName}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {activeSession && activeSession.messages.length > 0 && (
            <button
              type="button"
              onClick={handleClearCurrentChat}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </header>

        {/* Scrollable Chat Viewport */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 pt-6 pb-8">
          <div className="max-w-3xl mx-auto">
            {!activeSession || activeSession.messages.length === 0 ? (
              <div className="min-h-[62vh] flex flex-col items-center justify-center text-center px-2">
                <div className="max-w-md space-y-2.5 mb-8">
                  <h1
                    className="text-2xl sm:text-3xl font-semibold tracking-tight text-white"
                    style={{ textWrap: 'balance' }}
                  >
                    What would you like to build or ask?
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                    Zero-config routing across Llama 3.3 70B, GPT-OSS 120B, Qwen 3.5 397B, and Mistral with automatic rate-limit failover.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-2xl text-left">
                  {STARTER_PROMPTS.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => sendMessage(item.prompt)}
                      className="group p-4 rounded-2xl backdrop-blur-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] hover:border-white/[0.15] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] transition-all cursor-pointer flex flex-col justify-between gap-2"
                    >
                      <span className="text-xs font-medium text-white/90 group-hover:text-white">
                        {item.title}
                      </span>
                      <span className="text-xs text-slate-400 leading-relaxed line-clamp-3">
                        {item.prompt}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {activeSession.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.role === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <div className="max-w-[85%] sm:max-w-[75%] px-4 py-3 rounded-2xl rounded-br-xs backdrop-blur-xl bg-white/[0.08] border border-white/[0.12] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] text-sm text-white whitespace-pre-wrap leading-relaxed">
                        {msg.content}
                      </div>
                    ) : (
                      <div className="w-full max-w-[92%] sm:max-w-[86%] rounded-2xl p-4 sm:p-5 backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] space-y-3">
                        {msg.reasoning && (
                          <div className="rounded-xl bg-black/25 border border-white/[0.06] px-3 py-2">
                            <button
                              type="button"
                              onClick={() => toggleReasoning(msg.id)}
                              className="flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-slate-200 cursor-pointer"
                            >
                              {expandedReasoningIds[msg.id] ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                              )}
                              <span>Thought Process</span>
                            </button>
                            {expandedReasoningIds[msg.id] && (
                              <div className="mt-2 pt-2 border-t border-white/[0.06] text-xs font-mono text-slate-400 whitespace-pre-wrap leading-relaxed">
                                {msg.reasoning}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="text-sm text-slate-100 whitespace-pre-wrap leading-relaxed">
                          {msg.content}
                        </div>

                        {/* Clean Unboxed Metadata Footer */}
                        <div className="pt-2.5 border-t border-white/[0.06] flex items-center justify-between gap-4 text-[11px] font-mono text-slate-400">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-slate-300">{msg.modelLabel || 'Assistant'}</span>
                            <span>·</span>
                            <span>{msg.providerName}</span>
                            {msg.latencyMs !== undefined && (
                              <>
                                <span>·</span>
                                <span className="tabular-nums">{msg.latencyMs}ms</span>
                              </>
                            )}
                            {msg.failoverCount && msg.failoverCount > 0 ? (
                              <>
                                <span>·</span>
                                <span className="text-sky-300">
                                  failover +{msg.failoverCount}
                                </span>
                              </>
                            ) : null}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleCopyMessage(msg.id, msg.content)}
                            className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {isSending && (
                  <div className="flex items-start">
                    <div className="px-4 py-3 rounded-2xl backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] text-xs font-mono text-slate-400">
                      Thinking...
                    </div>
                  </div>
                )}

                {errorBanner && (
                  <div className="px-4 py-3 rounded-2xl backdrop-blur-xl bg-rose-500/10 border border-rose-500/25 text-xs font-mono text-rose-200 flex items-center justify-between">
                    <span>{errorBanner}</span>
                    <button
                      type="button"
                      onClick={() => setErrorBanner(null)}
                      className="underline hover:text-white ml-4 cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </main>

        {/* Floating Frosted Glass Composer Dock */}
        <footer className="shrink-0 px-4 sm:px-6 pb-4 pt-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            className="max-w-3xl mx-auto rounded-2xl backdrop-blur-2xl bg-white/[0.045] border border-white/[0.11] focus-within:border-white/[0.22] shadow-[0_12px_40px_rgba(0,0,0,0.45),inset_0_1px_0_0_rgba(255,255,255,0.1)] transition-all p-2 pl-4 flex items-end gap-2"
          >
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message OmniFree..."
              className="flex-1 bg-transparent py-2 text-sm text-white placeholder-slate-400/70 focus:outline-none resize-none max-h-40 leading-relaxed"
            />
            <button
              type="submit"
              disabled={isSending || !input.trim()}
              aria-label="Send message"
              className="w-9 h-9 rounded-xl bg-white text-slate-950 hover:bg-slate-200 disabled:opacity-25 flex items-center justify-center transition-all cursor-pointer shrink-0"
            >
              <ArrowUp className="w-4 h-4 stroke-[2.25]" />
            </button>
          </form>
        </footer>
      </div>
    </div>
  );
}
