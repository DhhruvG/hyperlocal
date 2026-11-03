import React, { useState } from 'react';
import { api, formatApiErrorDetail } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Bot, Play, Sparkles, Clock, Database, CheckCircle2,
  AlertTriangle, Wrench, Shield, ArrowRight, RefreshCw, Terminal, Info
} from 'lucide-react';

const PROMPT_TEMPLATES = {
  consumer: [
    { label: 'Hindi Grocery Search', prompt: 'Kya fresh tamatar aur pyaaz available hai 2km ke andar?' },
    { label: 'Cheapest Basket', prompt: 'Calculate cheapest grocery basket for 2kg tomatoes, 1L milk, and bread.' },
    { label: 'Nearby Street Carts', prompt: 'Show active fruit and vegetable street carts near Connaught Place.' },
  ],
  vendor: [
    { label: 'Stockout Risk Assessment', prompt: 'Which of my inventory items have high sales velocity and will run out within 48 hours?' },
    { label: 'Price Recommendation', prompt: 'What is the recommended price for 1kg fresh tomatoes based on local competitor medians?' },
    { label: 'Cart Route Optimization', prompt: 'Suggest an optimal 3-stop route intersecting morning customer demand clusters.' },
  ],
  admin: [
    { label: 'Executive Daily Briefing', prompt: 'Generate comprehensive operational briefing covering GMV, active users, grievances, and low stock.' },
    { label: 'Fraud & Review Ring Detection', prompt: 'Analyze recent review velocity and coordinate anomalies for possible manipulation.' },
    { label: 'Marketplace Balancing', prompt: 'Identify undersupplied categories where customer search demand exceeds merchant stock.' },
  ],
};

export default function AdminAIPlayground() {
  const [role, setRole] = useState('admin');
  const [modelName, setModelName] = useState('gemini-1.5-flash');
  const [prompt, setPrompt] = useState(PROMPT_TEMPLATES.admin[0].prompt);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleRoleChange = (newRole) => {
    setRole(newRole);
    if (PROMPT_TEMPLATES[newRole] && PROMPT_TEMPLATES[newRole][0]) {
      setPrompt(PROMPT_TEMPLATES[newRole][0].prompt);
    }
  };

  const handleRunTest = async () => {
    if (!prompt.trim()) {
      toast.error('Please enter a prompt to test.');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await api.post('/admin/ai-playground/test', {
        role: role,
        prompt: prompt,
        model_name: modelName,
        provider: modelName.includes('gemini') ? 'gemini' : 'local',
      });
      setResult(res.data);
      toast.success(`AI Playground test executed in ${res.data.latency_ms}ms`);
    } catch (err) {
      toast.error('AI Playground execution failed: ' + formatApiErrorDetail(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
      {/* Top Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 flex items-center gap-2">
            <Bot className="text-emerald-600" size={26} />
            Super Admin AI Test Playground
          </h1>
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
            Live Sandbox
          </Badge>
        </div>
        <p className="text-sm text-stone-500 mt-1">
          Simulate, evaluate, and verify role-based AI responses against authorized live platform data with latency and tool-call introspection.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Controls & Prompt Input (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm space-y-4">
            {/* Role Tabs */}
            <div>
              <Label className="text-xs text-stone-500 uppercase font-semibold">Simulated User Role</Label>
              <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                {[
                  { id: 'consumer', label: 'Customer' },
                  { id: 'vendor', label: 'Merchant / Cart' },
                  { id: 'admin', label: 'Super Admin' },
                ].map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => handleRoleChange(r.id)}
                    className={`py-2 px-2 text-xs font-medium rounded-lg border transition-all ${
                      role === r.id
                        ? 'bg-stone-900 text-white border-stone-900 shadow-sm'
                        : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Model Selector */}
            <div>
              <Label className="text-xs text-stone-500 uppercase font-semibold">Model Provider</Label>
              <Select value={modelName} onValueChange={setModelName}>
                <SelectTrigger className="h-9 mt-1 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini-1.5-flash">Gemini 1.5 Flash (Fast & Cost-Effective)</SelectItem>
                  <SelectItem value="gemini-3-flash-preview">Gemini 3 Flash Preview (Deep Reasoning)</SelectItem>
                  <SelectItem value="local">Local Grounded Deterministic Engine</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Quick Templates */}
            <div>
              <Label className="text-xs text-stone-500 uppercase font-semibold flex items-center gap-1">
                <Sparkles size={12} className="text-amber-500" />
                Quick Scenario Templates
              </Label>
              <div className="flex flex-col gap-1.5 mt-1.5">
                {(PROMPT_TEMPLATES[role] || []).map((t, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setPrompt(t.prompt)}
                    className="text-left text-xs p-2 rounded-md bg-stone-50 hover:bg-emerald-50 hover:text-emerald-900 border border-stone-200 transition-colors flex items-center justify-between"
                  >
                    <span>{t.label}</span>
                    <ArrowRight size={12} className="opacity-50" />
                  </button>
                ))}
              </div>
            </div>

            {/* Prompt Textarea */}
            <div>
              <Label className="text-xs text-stone-500 uppercase font-semibold">Prompt Payload</Label>
              <Textarea
                rows={5}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Enter natural language test prompt..."
                className="mt-1 text-xs resize-none"
              />
            </div>

            <Button
              onClick={handleRunTest}
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-medium"
            >
              {loading ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Executing AI Simulation...
                </>
              ) : (
                <>
                  <Play size={14} />
                  Execute Test Prompt
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Right Column: Execution Output & Inspector (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {loading && (
            <div className="bg-white p-12 rounded-xl border border-stone-200 text-center shadow-sm space-y-3">
              <RefreshCw className="mx-auto text-emerald-600 animate-spin" size={32} />
              <div className="font-semibold text-stone-800 text-sm">Querying Model & Retrieving Live Platform Context...</div>
              <div className="text-xs text-stone-500">Injecting verified database records, applying privacy masking, and formatting grounding signals.</div>
            </div>
          )}

          {!loading && !result && (
            <div className="bg-stone-50 p-12 rounded-xl border border-dashed border-stone-300 text-center text-stone-500">
              <Terminal className="mx-auto text-stone-400 mb-2" size={32} />
              <div className="font-medium text-sm">AI Output Inspector Ready</div>
              <div className="text-xs text-stone-400 mt-1 max-w-sm mx-auto">
                Select a scenario template or write a custom test prompt, then click "Execute Test Prompt" to inspect results.
              </div>
            </div>
          )}

          {!loading && result && (
            <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden space-y-4">
              {/* Execution Summary Header */}
              <div className="p-4 bg-stone-900 text-stone-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <Bot size={16} className="text-emerald-400" />
                  <span className="font-semibold">{result.model}</span>
                  <Badge variant="outline" className="text-stone-300 border-stone-700 uppercase">
                    Role: {result.role}
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-emerald-400 font-mono">
                    <Clock size={13} /> {result.latency_ms} ms
                  </span>
                  <span className="flex items-center gap-1 text-stone-400">
                    <CheckCircle2 size={13} className="text-emerald-500" /> Grounded
                  </span>
                </div>
              </div>

              <div className="p-5 space-y-5">
                {/* Context Injected */}
                <div>
                  <div className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide flex items-center gap-1">
                    <Database size={12} /> Injected Role & System Context
                  </div>
                  <div className="mt-1 p-2.5 bg-stone-50 rounded-lg text-xs text-stone-700 font-mono border border-stone-200">
                    {result.context}
                  </div>
                </div>

                {/* Simulated Tool Calls */}
                {result.tool_calls && result.tool_calls.length > 0 && (
                  <div>
                    <div className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide flex items-center gap-1">
                      <Wrench size={12} /> Executed Tool Calls & Data Retrieval
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {result.tool_calls.map((t, idx) => (
                        <div key={idx} className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 px-2.5 py-1 rounded-md flex items-center gap-1.5 font-mono">
                          <CheckCircle2 size={11} className="text-emerald-600" />
                          <span>{t.tool}</span>
                          {t.params && <span className="text-stone-400">({JSON.stringify(t.params)})</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Grounded AI Response */}
                <div>
                  <div className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide flex items-center gap-1">
                    <Sparkles size={12} className="text-emerald-600" /> Grounded Assistant Output
                  </div>
                  <div className="mt-1 p-4 bg-stone-50/70 border border-stone-200 rounded-lg text-xs leading-relaxed text-stone-800 whitespace-pre-wrap font-sans">
                    {result.response}
                  </div>
                </div>

                {/* Mandatory Disclaimer */}
                {result.disclaimer && (
                  <div className="p-3 bg-amber-50/60 border border-amber-200/70 rounded-lg text-[11px] text-amber-900 flex items-start gap-2">
                    <Info size={14} className="text-amber-600 shrink-0 mt-0.5" />
                    <span>{result.disclaimer}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

