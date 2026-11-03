import React, { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { api, API_BASE } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  Sparkles, Mic, Volume2, Globe, ShieldCheck, Sliders, Cpu, BookOpen,
  Users, Activity, RefreshCw, Play, CheckCircle2, AlertTriangle, Download,
  Plus, Save, Key, Wrench, MessageSquare, FileText, Search, RotateCcw
} from 'lucide-react';

export default function AdminAIControlCenter({ defaultTab = 'overview' }) {
  const location = useLocation();
  const initialTab = location.pathname.includes('/ai-knowledge') ? 'knowledge' : defaultTab;
  const [activeTab, setActiveTab] = useState(initialTab);
  const [dateRange, setDateRange] = useState('7d');
  const [loading, setLoading] = useState(false);

  // State buckets for each Control Center module
  const [overview, setOverview] = useState(null);
  const [globalControls, setGlobalControls] = useState(null);
  const [roles, setRoles] = useState([]);
  const [userOverridesData, setUserOverridesData] = useState({ overrides: [], recent_users: [] });
  const [providers, setProviders] = useState([]);
  const [voiceSettings, setVoiceSettings] = useState(null);
  const [langSettings, setLangSettings] = useState(null);
  const [knowledgeDocs, setKnowledgeDocs] = useState([]);
  const [knowledgeSearch, setKnowledgeSearch] = useState('');
  const [tools, setTools] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [feedbackList, setFeedbackList] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);

  // Per-user override form
  const [selectedUserOverride, setSelectedUserOverride] = useState({
    user_id: '',
    ai_enabled: true,
    voice_input_enabled: true,
    audio_output_enabled: true,
    custom_daily_quota: 250,
    notes: '',
  });

  // New Knowledge Doc form
  const [newDoc, setNewDoc] = useState({
    id: '',
    title: '',
    category: 'workflow',
    source_module: 'admin_custom',
    roles_allowed: ['consumer', 'vendor', 'mobile_vendor', 'admin'],
    status: 'published',
    approved_for_ai: true,
    content: '',
  });

  // Quality Test Sandbox state
  const [testQuery, setTestQuery] = useState('आज मेरी दुकान की बिक्री कितनी हुई?');
  const [testLang, setTestLang] = useState('auto');
  const [testInputMode, setTestInputMode] = useState('voice');
  const [testResult, setTestResult] = useState(null);
  const [testRunning, setTestRunning] = useState(false);

  // Dictionary new term state
  const [newPronKey, setNewPronKey] = useState('');
  const [newPronVal, setNewPronVal] = useState('');

  useEffect(() => {
    if (location.pathname.includes('/ai-knowledge')) {
      setActiveTab('knowledge');
    }
  }, [location.pathname]);

  const loadDataForTab = useCallback(async (tab, range = dateRange) => {
    setLoading(true);
    try {
      if (tab === 'overview') {
        const res = await api.get('/admin/ai-control-center/overview', { params: { date_range: range } });
        setOverview(res.data);
      } else if (tab === 'global') {
        const res = await api.get('/admin/ai-control-center/global-controls');
        setGlobalControls(res.data);
      } else if (tab === 'roles') {
        const res = await api.get('/admin/ai-control-center/roles');
        setRoles(res.data || []);
      } else if (tab === 'users') {
        const res = await api.get('/admin/ai-control-center/user-overrides');
        setUserOverridesData(res.data || { overrides: [], recent_users: [] });
      } else if (tab === 'providers') {
        const res = await api.get('/admin/ai-control-center/providers');
        setProviders(res.data || []);
      } else if (tab === 'voice_lang') {
        const [vRes, lRes] = await Promise.all([
          api.get('/admin/ai-control-center/voice-audio'),
          api.get('/admin/ai-control-center/languages'),
        ]);
        setVoiceSettings(vRes.data);
        setLangSettings(lRes.data);
      } else if (tab === 'knowledge') {
        const res = await api.get('/admin/ai-control-center/knowledge', {
          params: knowledgeSearch ? { search: knowledgeSearch } : {},
        });
        setKnowledgeDocs(res.data || []);
      } else if (tab === 'tools_test') {
        const [tRes, tplRes] = await Promise.all([
          api.get('/admin/ai-control-center/tools'),
          api.get('/admin/ai-control-center/templates'),
        ]);
        setTools(tRes.data || []);
        setTemplates(tplRes.data || []);
      } else if (tab === 'logs') {
        const [cRes, fRes, aRes] = await Promise.all([
          api.get('/admin/ai-control-center/conversations'),
          api.get('/admin/ai-control-center/feedback'),
          api.get('/admin/ai-control-center/audit-logs'),
        ]);
        setConversations(cRes.data || []);
        setFeedbackList(fRes.data || []);
        setAuditLogs(aRes.data || []);
      }
    } catch (err) {
      toast.error('Failed to load AI Control Center data');
    } finally {
      setLoading(false);
    }
  }, [dateRange, knowledgeSearch]);

  useEffect(() => {
    loadDataForTab(activeTab, dateRange);
  }, [activeTab, dateRange, loadDataForTab]);

  // ---------- Handlers ----------
  const saveGlobalControls = async (updated) => {
    try {
      const res = await api.patch('/admin/ai-control-center/global-controls', updated);
      setGlobalControls(res.data);
      toast.success('Global AI settings saved & applied immediately');
    } catch (e) {
      toast.error('Could not save global AI controls');
    }
  };

  const toggleMasterSwitch = (switchKey, val) => {
    if (!globalControls) return;
    const next = {
      ...globalControls,
      switches: {
        ...(globalControls.switches || {}),
        [switchKey]: val,
      },
    };
    setGlobalControls(next);
    saveGlobalControls({ switches: next.switches });
  };

  const saveRoleConfig = async (roleKey, payload) => {
    try {
      const res = await api.patch(`/admin/ai-control-center/roles/${roleKey}`, payload);
      setRoles((prev) => prev.map((r) => (r.role_key === roleKey ? res.data : r)));
      toast.success(`Saved AI permissions for role: ${roleKey}`);
    } catch (e) {
      toast.error('Failed to update role configuration');
    }
  };

  const saveUserOverride = async (e) => {
    e.preventDefault();
    if (!selectedUserOverride.user_id.trim()) {
      toast.error('Select or enter a User ID first');
      return;
    }
    try {
      await api.post('/admin/ai-control-center/user-overrides', selectedUserOverride);
      toast.success(`Saved per-user AI override for ${selectedUserOverride.user_id}`);
      loadDataForTab('users');
    } catch (err) {
      toast.error('Failed to save user override');
    }
  };

  const resetUserUsage = async (userId) => {
    try {
      await api.post(`/admin/ai-control-center/user-overrides/${userId}/reset-usage`);
      toast.success(`Reset daily AI usage counters for ${userId}`);
      loadDataForTab('users');
    } catch (err) {
      toast.error('Could not reset usage');
    }
  };

  const saveProvider = async (providerId, payload) => {
    try {
      const res = await api.patch(`/admin/ai-control-center/providers/${providerId}`, payload);
      setProviders((prev) => prev.map((p) => (p.id === providerId ? res.data : p)));
      toast.success(`Updated provider ${providerId}`);
    } catch (err) {
      toast.error('Failed to update provider');
    }
  };

  const testProvider = async (providerId) => {
    try {
      const res = await api.post(`/admin/ai-control-center/providers/${providerId}/test`);
      toast.success(`Connection verified (${res.data.latency_ms}ms): ${res.data.message}`);
      loadDataForTab('providers');
    } catch (err) {
      toast.error('Provider health check failed');
    }
  };

  const saveVoiceSettings = async () => {
    try {
      const res = await api.patch('/admin/ai-control-center/voice-audio', voiceSettings);
      setVoiceSettings(res.data);
      toast.success('Voice, STT & TTS settings saved');
    } catch (err) {
      toast.error('Failed to save voice settings');
    }
  };

  const saveLangSettings = async (overridePayload) => {
    try {
      const res = await api.patch('/admin/ai-control-center/languages', overridePayload || langSettings);
      setLangSettings(res.data);
      toast.success('Language & terminology dictionary saved');
    } catch (err) {
      toast.error('Failed to save language settings');
    }
  };

  const saveKnowledgeDoc = async (e) => {
    e.preventDefault();
    if (!newDoc.title.trim() || !newDoc.content.trim()) {
      toast.error('Title and content are required');
      return;
    }
    try {
      await api.post('/admin/ai-control-center/knowledge', newDoc);
      toast.success('Knowledge document saved & indexed with version history');
      setNewDoc({
        id: '',
        title: '',
        category: 'workflow',
        source_module: 'admin_custom',
        roles_allowed: ['consumer', 'vendor', 'mobile_vendor', 'admin'],
        status: 'published',
        approved_for_ai: true,
        content: '',
      });
      loadDataForTab('knowledge');
    } catch (err) {
      toast.error('Could not save knowledge document');
    }
  };

  const reindexAllKnowledge = async () => {
    try {
      const res = await api.post('/admin/ai-control-center/knowledge/reindex');
      toast.success(`Reindexed ${res.data.documents_indexed} published knowledge documents`);
      loadDataForTab('knowledge');
    } catch (err) {
      toast.error('Knowledge reindexing failed');
    }
  };

  const toggleToolSetting = async (tool, patch) => {
    try {
      const res = await api.patch(`/admin/ai-control-center/tools/${tool.id}`, patch);
      setTools((prev) => prev.map((t) => (t.id === tool.id ? res.data : t)));
      toast.success(`Updated tool: ${tool.name}`);
    } catch (err) {
      toast.error('Failed to update tool permission');
    }
  };

  const saveTemplate = async (tpl) => {
    try {
      const res = await api.patch(`/admin/ai-control-center/templates/${tpl.id}`, tpl);
      setTemplates((prev) => prev.map((t) => (t.id === tpl.id ? res.data : t)));
      toast.success(`Saved template: ${tpl.key}`);
    } catch (err) {
      toast.error('Failed to save response template');
    }
  };

  const runSandboxTest = async (e) => {
    e.preventDefault();
    if (!testQuery.trim()) return;
    setTestRunning(true);
    try {
      const res = await api.post('/ai/copilot/query', {
        session_id: `admin_sandbox_${Date.now()}`,
        message: testQuery,
        page: '/admin/ai-control-center',
        input_mode: testInputMode,
        preferred_language: testLang === 'auto' ? null : testLang,
        generate_audio: true,
      });
      setTestResult(res.data);
      toast.success('AI test response + spoken audio generated');
    } catch (err) {
      toast.error('Test query failed');
    } finally {
      setTestRunning(false);
    }
  };

  const playSandboxAudio = () => {
    if (!testResult) return;
    const speechText = testResult.audio?.speech_text || testResult.reply;
    const locale = testResult.audio?.voice_locale || (/[\u0900-\u097F]/.test(speechText) ? 'hi-IN' : 'en-IN');
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(speechText);
      u.lang = locale;
      window.speechSynthesis.speak(u);
      return;
    }
    if (testResult.audio?.audio_data_url) {
      const a = new Audio(testResult.audio.audio_data_url);
      a.play();
    }
  };

  const downloadCsv = async (reportType) => {
    try {
      const res = await api.get('/admin/ai-control-center/export-csv', {
        params: { report_type: reportType },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `hyperlocal_ai_${reportType}_report.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(`Exported ${reportType} CSV report`);
    } catch (err) {
      toast.error('CSV export failed');
    }
  };

  const TABS = [
    { id: 'overview', label: '1. Overview & KPIs', icon: Activity },
    { id: 'global', label: '2. Global Switches & Budget', icon: Sliders },
    { id: 'roles', label: '3. Role Permissions', icon: ShieldCheck },
    { id: 'users', label: '4. User & Seller Quotas', icon: Users },
    { id: 'providers', label: '5. Providers & Models', icon: Cpu },
    { id: 'voice_lang', label: '6. Voice, TTS & Languages', icon: Volume2 },
    { id: 'knowledge', label: '7. Knowledge Base & RAG', icon: BookOpen },
    { id: 'tools_test', label: '8. Tools, Templates & Test', icon: Wrench },
    { id: 'logs', label: '9. Conversations & Audit', icon: FileText },
  ];

  return (
    <div className="space-y-6 pb-16" data-testid="admin-ai-control-center">
      {/* Header Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-emerald-950 via-[#0A6E3B] to-stone-900 p-6 text-white shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-400/20 text-emerald-200 text-xs font-semibold border border-emerald-400/30">
            <Sparkles size={12} /> Super Admin Complete AI Control Center
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-bold mt-2">
            Universal AI Copilot, Multilingual Voice, TTS & RAG Governance
          </h1>
          <p className="text-emerald-100 text-xs md:text-sm mt-1 max-w-3xl">
            Manage every AI capability, role permission, Hindi/English/Hinglish voice profile, TTS engine, knowledge base index, quota, cost budget, and live conversation without code changes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            size="sm"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent('open_ai_copilot', {
                  detail: { prompt: 'Show me the AI usage and performance report.' },
                })
              )
            }
            className="bg-amber-400 hover:bg-amber-300 text-stone-950 font-semibold rounded-full text-xs"
            data-testid="admin-open-copilot-btn"
          >
            <Mic size={13} className="mr-1.5" /> Ask Admin AI Copilot
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => loadDataForTab(activeTab, dateRange)}
            className="border-white/30 bg-white/10 hover:bg-white/20 text-white rounded-full text-xs"
          >
            <RefreshCw size={13} className={`mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-1.5 bg-white p-2 rounded-2xl border border-stone-200 shadow-sm">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              data-testid={`ai-cc-tab-${t.id}`}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                active
                  ? 'bg-[#0A6E3B] text-white shadow-sm'
                  : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
              }`}
            >
              <Icon size={13} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* ==================== TAB 1: OVERVIEW DASHBOARD ==================== */}
      {activeTab === 'overview' && overview && (
        <div className="space-y-6" data-testid="ai-cc-overview-section">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-stone-200">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-stone-500 mr-2">Date Filter:</span>
              {[
                { k: 'today', l: 'Today' },
                { k: 'yesterday', l: 'Yesterday' },
                { k: '7d', l: 'Last 7 Days' },
                { k: '30d', l: 'Last 30 Days' },
                { k: 'all', l: 'All Time' },
              ].map((d) => (
                <button
                  key={d.k}
                  onClick={() => setDateRange(d.k)}
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    dateRange === d.k
                      ? 'bg-[#0A6E3B] text-white'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  {d.l}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => downloadCsv('usage')} className="text-xs h-8">
                <Download size={12} className="mr-1" /> Usage CSV
              </Button>
              <Button size="sm" variant="outline" onClick={() => downloadCsv('audio')} className="text-xs h-8">
                <Download size={12} className="mr-1" /> Audio TTS CSV
              </Button>
              <Button size="sm" variant="outline" onClick={() => downloadCsv('feedback')} className="text-xs h-8">
                <Download size={12} className="mr-1" /> Feedback CSV
              </Button>
            </div>
          </div>

          {/* 16 KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
            {[
              { label: 'Total AI Conversations', value: overview.total_conversations, sub: 'Active threads' },
              { label: 'Active AI Users', value: overview.active_ai_users, sub: 'Unique authenticated users' },
              { label: 'Questions Today', value: overview.total_questions_today, sub: `Period total: ${overview.total_questions_period}` },
              { label: 'Voice vs Text Questions', value: `${overview.voice_questions_count} / ${overview.text_questions_count}`, sub: 'Voice / Text split' },
              { label: 'Written Responses', value: overview.written_responses_count, sub: 'Delivered in chat' },
              { label: 'Spoken Audio Generated', value: overview.audio_responses_generated, sub: `${overview.successful_audio_generations} OK · ${overview.failed_audio_generations} failed` },
              { label: 'Avg Response Time', value: `${overview.average_response_time_ms} ms`, sub: `TTS Avg: ${overview.average_audio_generation_time_ms} ms` },
              { label: 'AI Error Rate', value: `${overview.error_rate_pct}%`, sub: `Unanswered: ${overview.unanswered_questions_count}` },
              { label: 'RAG Knowledge Hit Rate', value: `${overview.rag_hit_rate_pct}%`, sub: 'Grounded in platform docs' },
              { label: 'User Satisfaction Score', value: `${overview.user_satisfaction_score_pct}%`, sub: 'From thumb & detailed ratings' },
              { label: 'Estimated AI Cost', value: `₹${overview.total_estimated_cost_inr}`, sub: `Daily budget: ₹${overview.daily_budget_inr}` },
              { label: 'Monthly AI Budget', value: `₹${overview.monthly_budget_inr}`, sub: 'Configured cap' },
            ].map((kpi, idx) => (
              <div key={idx} className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
                <div className="text-[11px] font-medium text-stone-500">{kpi.label}</div>
                <div className="text-2xl font-display font-bold text-stone-900 mt-1">{kpi.value}</div>
                <div className="text-[11px] text-emerald-700 mt-1">{kpi.sub}</div>
              </div>
            ))}
          </div>

          {/* Language, Role & Provider Breakdowns */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-stone-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3">
                Language Distribution
              </h3>
              <div className="space-y-2 text-xs">
                {Object.entries(overview.language_distribution || {}).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between py-1 border-b border-stone-100">
                    <span className="font-medium uppercase">{k}</span>
                    <Badge variant="outline">{v} turns</Badge>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-stone-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3">
                Role Usage Breakdown
              </h3>
              <div className="space-y-2 text-xs">
                {Object.entries(overview.role_distribution || {}).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between py-1 border-b border-stone-100">
                    <span className="font-medium capitalize">{k.replace('_', ' ')}</span>
                    <Badge variant="outline">{v} turns</Badge>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-stone-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3">
                AI Provider & Model Telemetry
              </h3>
              <div className="space-y-2 text-xs">
                {Object.entries(overview.provider_usage || {}).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between py-1 border-b border-stone-100">
                    <span className="font-medium">{k}</span>
                    <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200">{v} calls</Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 2: GLOBAL SWITCHES & PERSONALIZATION ==================== */}
      {activeTab === 'global' && globalControls && (
        <div className="space-y-6" data-testid="ai-cc-global-section">
          <div className="bg-white p-5 rounded-2xl border border-stone-200 space-y-4">
            <h2 className="text-base font-display font-bold text-stone-900">
              Master AI Enable / Disable Switches (Real-Time Enforcement)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { key: 'entire_ai_system_enabled', label: 'Entire AI System Master Switch' },
                { key: 'consumer_ai_enabled', label: 'Consumer AI Assistant' },
                { key: 'retailer_copilot_enabled', label: 'Retailer AI Copilot' },
                { key: 'mobile_vendor_copilot_enabled', label: 'Mobile Vendor AI Copilot' },
                { key: 'admin_ai_enabled', label: 'Admin AI Assistant' },
                { key: 'voice_input_enabled', label: 'Voice Input (Microphone)' },
                { key: 'speech_to_text_enabled', label: 'Speech-to-Text (STT)' },
                { key: 'written_responses_enabled', label: 'Written Chat Responses' },
                { key: 'spoken_audio_responses_enabled', label: 'Spoken Audio Responses' },
                { key: 'text_to_speech_enabled', label: 'Text-to-Speech (TTS) Engine' },
                { key: 'knowledge_retrieval_enabled', label: 'Application Knowledge Retrieval (RAG)' },
                { key: 'tool_execution_enabled', label: 'Authorized Live Data Tool Execution' },
                { key: 'conversation_memory_enabled', label: 'Conversation Context Retention' },
                { key: 'maintenance_mode', label: 'Emergency AI Maintenance Mode' },
              ].map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between p-3 rounded-xl border border-stone-200 bg-stone-50/60"
                >
                  <span className="text-xs font-semibold text-stone-800">{item.label}</span>
                  <Switch
                    checked={Boolean(globalControls.switches?.[item.key])}
                    onCheckedChange={(val) => toggleMasterSwitch(item.key, val)}
                    data-testid={`switch-${item.key}`}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Personalization & Behavior */}
          <div className="bg-white p-5 rounded-2xl border border-stone-200 space-y-4">
            <h2 className="text-base font-display font-bold text-stone-900">
              Assistant Behavior, Tone & Cost Budget Limits
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-stone-600">Response Tone</label>
                <select
                  value={globalControls.personalization?.response_tone || 'friendly'}
                  onChange={(e) =>
                    setGlobalControls({
                      ...globalControls,
                      personalization: { ...globalControls.personalization, response_tone: e.target.value },
                    })
                  }
                  className="mt-1 w-full rounded-xl border border-stone-200 p-2 text-xs"
                >
                  <option value="friendly">Friendly & Helpful</option>
                  <option value="concise">Concise & Fast</option>
                  <option value="professional">Professional</option>
                  <option value="supportive">Supportive</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-600">Max Written Chars</label>
                <Input
                  type="number"
                  value={globalControls.personalization?.max_written_chars || 1200}
                  onChange={(e) =>
                    setGlobalControls({
                      ...globalControls,
                      personalization: {
                        ...globalControls.personalization,
                        max_written_chars: Number(e.target.value),
                      },
                    })
                  }
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-600">Max Spoken Chars (TTS)</label>
                <Input
                  type="number"
                  value={globalControls.personalization?.max_spoken_chars || 450}
                  onChange={(e) =>
                    setGlobalControls({
                      ...globalControls,
                      personalization: {
                        ...globalControls.personalization,
                        max_spoken_chars: Number(e.target.value),
                      },
                    })
                  }
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-600">Daily Budget Cap (₹ INR)</label>
                <Input
                  type="number"
                  value={globalControls.quotas_and_budgets?.daily_budget_inr || 500}
                  onChange={(e) =>
                    setGlobalControls({
                      ...globalControls,
                      quotas_and_budgets: {
                        ...globalControls.quotas_and_budgets,
                        daily_budget_inr: Number(e.target.value),
                      },
                    })
                  }
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-600">Monthly Budget Cap (₹ INR)</label>
                <Input
                  type="number"
                  value={globalControls.quotas_and_budgets?.monthly_budget_inr || 10000}
                  onChange={(e) =>
                    setGlobalControls({
                      ...globalControls,
                      quotas_and_budgets: {
                        ...globalControls.quotas_and_budgets,
                        monthly_budget_inr: Number(e.target.value),
                      },
                    })
                  }
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-600">Conversation Retention (Days)</label>
                <Input
                  type="number"
                  value={globalControls.security_and_retention?.conversation_retention_days || 90}
                  onChange={(e) =>
                    setGlobalControls({
                      ...globalControls,
                      security_and_retention: {
                        ...globalControls.security_and_retention,
                        conversation_retention_days: Number(e.target.value),
                      },
                    })
                  }
                  className="mt-1 text-xs"
                />
              </div>
            </div>
            <Button
              onClick={() => saveGlobalControls(globalControls)}
              className="bg-[#0A6E3B] hover:bg-[#075030] text-white text-xs"
            >
              <Save size={13} className="mr-1.5" /> Save Behavior, Budget & Retention Settings
            </Button>
          </div>
        </div>
      )}

      {/* ==================== TAB 3: ROLE-BASED CONFIGURATION ==================== */}
      {activeTab === 'roles' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="ai-cc-roles-section">
          {roles.map((r) => (
            <div key={r.role_key} className="bg-white p-5 rounded-2xl border border-stone-200 space-y-3">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                <div>
                  <h3 className="text-sm font-bold text-stone-900">{r.label}</h3>
                  <span className="text-[11px] text-stone-500">Role Key: {r.role_key}</span>
                </div>
                <Badge className={r.ai_enabled ? 'bg-emerald-600 text-white' : 'bg-stone-300 text-stone-800'}>
                  {r.ai_enabled ? 'AI Enabled' : 'Disabled'}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { k: 'ai_enabled', l: 'AI Assistant Enabled' },
                  { k: 'text_chat_enabled', l: 'Written Text Chat' },
                  { k: 'voice_input_enabled', l: 'Voice Input (Mic)' },
                  { k: 'spoken_output_enabled', l: 'Spoken Output (TTS)' },
                ].map((sw) => (
                  <div key={sw.k} className="flex items-center justify-between p-2 rounded-lg bg-stone-50 border">
                    <span>{sw.l}</span>
                    <Switch
                      checked={Boolean(r[sw.k])}
                      onCheckedChange={(v) => saveRoleConfig(r.role_key, { [sw.k]: v })}
                    />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs pt-1">
                <div>
                  <label className="text-[10px] text-stone-500">Daily Questions</label>
                  <Input
                    type="number"
                    value={r.daily_question_limit || 100}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setRoles((prev) =>
                        prev.map((item) =>
                          item.role_key === r.role_key ? { ...item, daily_question_limit: val } : item
                        )
                      );
                    }}
                    className="h-8 text-xs mt-0.5"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-stone-500">Daily Voice Limit</label>
                  <Input
                    type="number"
                    value={r.daily_voice_limit || 50}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setRoles((prev) =>
                        prev.map((item) =>
                          item.role_key === r.role_key ? { ...item, daily_voice_limit: val } : item
                        )
                      );
                    }}
                    className="h-8 text-xs mt-0.5"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-stone-500">Max Voice Sec</label>
                  <Input
                    type="number"
                    value={r.max_voice_recording_seconds || 60}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setRoles((prev) =>
                        prev.map((item) =>
                          item.role_key === r.role_key ? { ...item, max_voice_recording_seconds: val } : item
                        )
                      );
                    }}
                    className="h-8 text-xs mt-0.5"
                  />
                </div>
              </div>

              <Button
                size="sm"
                onClick={() =>
                  saveRoleConfig(r.role_key, {
                    daily_question_limit: r.daily_question_limit,
                    daily_voice_limit: r.daily_voice_limit,
                    max_voice_recording_seconds: r.max_voice_recording_seconds,
                  })
                }
                className="w-full bg-[#0A6E3B] hover:bg-[#075030] text-white text-xs h-8"
              >
                Save {r.label} Quotas
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* ==================== TAB 4: PER-USER & PER-SELLER OVERRIDES ==================== */}
      {activeTab === 'users' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" data-testid="ai-cc-users-section">
          <form
            onSubmit={saveUserOverride}
            className="bg-white p-5 rounded-2xl border border-stone-200 space-y-3 h-fit"
          >
            <h3 className="text-sm font-bold text-stone-900">Configure User / Seller AI Override</h3>
            <div>
              <label className="text-xs font-semibold text-stone-600">Select User / Seller or Enter ID</label>
              <Input
                value={selectedUserOverride.user_id}
                onChange={(e) => setSelectedUserOverride({ ...selectedUserOverride, user_id: e.target.value })}
                placeholder="User ID"
                className="mt-1 text-xs"
              />
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2 bg-stone-50 rounded-lg border">
                <span>AI Access Enabled</span>
                <Switch
                  checked={selectedUserOverride.ai_enabled}
                  onCheckedChange={(v) => setSelectedUserOverride({ ...selectedUserOverride, ai_enabled: v })}
                />
              </div>
              <div className="flex items-center justify-between p-2 bg-stone-50 rounded-lg border">
                <span>Voice Input Enabled</span>
                <Switch
                  checked={selectedUserOverride.voice_input_enabled}
                  onCheckedChange={(v) =>
                    setSelectedUserOverride({ ...selectedUserOverride, voice_input_enabled: v })
                  }
                />
              </div>
              <div className="flex items-center justify-between p-2 bg-stone-50 rounded-lg border">
                <span>Spoken Audio Output Enabled</span>
                <Switch
                  checked={selectedUserOverride.audio_output_enabled}
                  onCheckedChange={(v) =>
                    setSelectedUserOverride({ ...selectedUserOverride, audio_output_enabled: v })
                  }
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-stone-600">Custom Daily Quota</label>
              <Input
                type="number"
                value={selectedUserOverride.custom_daily_quota}
                onChange={(e) =>
                  setSelectedUserOverride({
                    ...selectedUserOverride,
                    custom_daily_quota: Number(e.target.value),
                  })
                }
                className="mt-1 text-xs"
              />
            </div>
            <Button type="submit" className="w-full bg-[#0A6E3B] hover:bg-[#075030] text-white text-xs">
              Save User AI Override
            </Button>
          </form>

          <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-stone-200 space-y-3">
            <h3 className="text-sm font-bold text-stone-900">
              Marketplace Users & Sellers (Click to Configure or Reset Usage)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-stone-500">
                    <th className="py-2">Name / Shop</th>
                    <th>Role</th>
                    <th>Email</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(userOverridesData.recent_users || []).slice(0, 15).map((u) => (
                    <tr key={u.id} className="border-b border-stone-100">
                      <td className="py-2 font-medium">
                        {u.name} {u.shop_name ? `(${u.shop_name})` : ''}
                      </td>
                      <td className="capitalize">{u.role}</td>
                      <td className="text-stone-500">{u.email}</td>
                      <td className="py-1.5 flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setSelectedUserOverride({
                              ...selectedUserOverride,
                              user_id: u.id,
                            })
                          }
                          className="h-7 text-[11px]"
                        >
                          Select
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => resetUserUsage(u.id)}
                          className="h-7 text-[11px] text-emerald-700"
                        >
                          Reset Usage
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 5: AI PROVIDERS & MODELS ==================== */}
      {activeTab === 'providers' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="ai-cc-providers-section">
          {providers.map((p) => (
            <div key={p.id} className="bg-white p-5 rounded-2xl border border-stone-200 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Badge variant="outline" className="uppercase text-[10px]">
                    {p.service_type}
                  </Badge>
                  <h3 className="text-sm font-bold text-stone-900 mt-1">{p.provider_name}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px]">
                    {p.health_status || 'healthy'}
                  </Badge>
                  <Switch
                    checked={Boolean(p.enabled)}
                    onCheckedChange={(v) => saveProvider(p.id, { enabled: v })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[10px] text-stone-500">Default Model</label>
                  <Input
                    value={p.default_model || ''}
                    onChange={(e) =>
                      setProviders((prev) =>
                        prev.map((item) =>
                          item.id === p.id ? { ...item, default_model: e.target.value } : item
                        )
                      )
                    }
                    className="h-8 text-xs mt-0.5"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-stone-500">Fallback Model</label>
                  <Input
                    value={p.fallback_model || ''}
                    onChange={(e) =>
                      setProviders((prev) =>
                        prev.map((item) =>
                          item.id === p.id ? { ...item, fallback_model: e.target.value } : item
                        )
                      )
                    }
                    className="h-8 text-xs mt-0.5"
                  />
                </div>
              </div>

              <div className="text-[11px] text-stone-500 flex items-center justify-between bg-stone-50 p-2 rounded-lg">
                <span>
                  <Key size={11} className="inline mr-1" /> Key: {p.api_key_masked || '••••••••'}
                </span>
                <span>Timeout: {p.timeout_ms}ms</span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    saveProvider(p.id, {
                      default_model: p.default_model,
                      fallback_model: p.fallback_model,
                    })
                  }
                  className="bg-[#0A6E3B] hover:bg-[#075030] text-white text-xs h-8"
                >
                  Save Model Config
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => testProvider(p.id)}
                  className="text-xs h-8"
                  data-testid={`test-provider-${p.id}`}
                >
                  <CheckCircle2 size={12} className="mr-1 text-emerald-600" /> Test Connection
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ==================== TAB 6: VOICE, TTS & LANGUAGES ==================== */}
      {activeTab === 'voice_lang' && voiceSettings && langSettings && (
        <div className="space-y-6" data-testid="ai-cc-voice-lang-section">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* STT & TTS Config */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200 space-y-3">
              <h3 className="text-sm font-bold text-stone-900">
                Speech-to-Text (STT) & Text-to-Speech (TTS) Profiles
              </h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[10px] text-stone-500">Default Speaking Speed</label>
                  <Input
                    type="number"
                    step="0.05"
                    value={voiceSettings.tts_settings?.speaking_speed || 1.0}
                    onChange={(e) =>
                      setVoiceSettings({
                        ...voiceSettings,
                        tts_settings: {
                          ...voiceSettings.tts_settings,
                          speaking_speed: Number(e.target.value),
                        },
                      })
                    }
                    className="h-8 text-xs mt-0.5"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-stone-500">Max Recording Seconds</label>
                  <Input
                    type="number"
                    value={voiceSettings.stt_settings?.max_recording_seconds || 60}
                    onChange={(e) =>
                      setVoiceSettings({
                        ...voiceSettings,
                        stt_settings: {
                          ...voiceSettings.stt_settings,
                          max_recording_seconds: Number(e.target.value),
                        },
                      })
                    }
                    className="h-8 text-xs mt-0.5"
                  />
                </div>
              </div>

              <div className="space-y-2 text-xs pt-2">
                <div className="flex items-center justify-between p-2 bg-stone-50 rounded-lg border">
                  <span>Auto-play Spoken Audio for Voice Questions</span>
                  <Switch
                    checked={Boolean(voiceSettings.playback_defaults?.auto_play_voice_queries)}
                    onCheckedChange={(v) =>
                      setVoiceSettings({
                        ...voiceSettings,
                        playback_defaults: {
                          ...voiceSettings.playback_defaults,
                          auto_play_voice_queries: v,
                        },
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between p-2 bg-stone-50 rounded-lg border">
                  <span>Auto-play Spoken Audio for Typed Questions</span>
                  <Switch
                    checked={Boolean(voiceSettings.playback_defaults?.auto_play_text_queries)}
                    onCheckedChange={(v) =>
                      setVoiceSettings({
                        ...voiceSettings,
                        playback_defaults: {
                          ...voiceSettings.playback_defaults,
                          auto_play_text_queries: v,
                        },
                      })
                    }
                  />
                </div>
              </div>

              <Button
                size="sm"
                onClick={saveVoiceSettings}
                className="bg-[#0A6E3B] hover:bg-[#075030] text-white text-xs"
              >
                Save Voice & TTS Settings
              </Button>
            </div>

            {/* Language & Terminology Dictionary */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200 space-y-3">
              <h3 className="text-sm font-bold text-stone-900">
                Supported Languages & Pronunciation Dictionary
              </h3>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {[
                  { k: 'english_enabled', l: 'English' },
                  { k: 'hindi_enabled', l: 'हिन्दी (Hindi)' },
                  { k: 'hinglish_enabled', l: 'Hinglish' },
                ].map((lg) => (
                  <div key={lg.k} className="flex items-center justify-between p-2 bg-stone-50 rounded-lg border">
                    <span>{lg.l}</span>
                    <Switch
                      checked={Boolean(langSettings[lg.k])}
                      onCheckedChange={(v) => {
                        const updated = { ...langSettings, [lg.k]: v };
                        setLangSettings(updated);
                        saveLangSettings(updated);
                      }}
                    />
                  </div>
                ))}
              </div>

              <div className="pt-2">
                <div className="text-xs font-semibold text-stone-700 mb-1">
                  Pronunciation & Terminology Corrections
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1 text-xs bg-stone-50 p-2 rounded-lg border">
                  {Object.entries(langSettings.pronunciation_corrections || {}).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between">
                      <span className="font-mono text-stone-700">{k}</span>
                      <span className="text-emerald-700 font-medium">→ {v}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <Input
                    placeholder="Term (e.g. ₹)"
                    value={newPronKey}
                    onChange={(e) => setNewPronKey(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Input
                    placeholder="Spoken (e.g. rupees)"
                    value={newPronVal}
                    onChange={(e) => setNewPronVal(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!newPronKey.trim()) return;
                      const updated = {
                        ...langSettings,
                        pronunciation_corrections: {
                          ...(langSettings.pronunciation_corrections || {}),
                          [newPronKey.trim()]: newPronVal.trim(),
                        },
                      };
                      setNewPronKey('');
                      setNewPronVal('');
                      saveLangSettings(updated);
                    }}
                    className="h-8 bg-[#0A6E3B] text-white text-xs"
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 7: KNOWLEDGE BASE & RAG ==================== */}
      {activeTab === 'knowledge' && (
        <div className="space-y-6" data-testid="ai-cc-knowledge-section">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-stone-200">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <Search size={15} className="text-stone-400" />
              <Input
                placeholder="Search knowledge base titles, modules, content…"
                value={knowledgeSearch}
                onChange={(e) => setKnowledgeSearch(e.target.value)}
                className="h-8 text-xs"
              />
              <Button size="sm" variant="outline" onClick={() => loadDataForTab('knowledge')} className="h-8 text-xs">
                Search
              </Button>
            </div>
            <Button
              size="sm"
              onClick={reindexAllKnowledge}
              className="bg-[#0A6E3B] hover:bg-[#075030] text-white text-xs h-8"
              data-testid="ai-knowledge-reindex-btn"
            >
              <RefreshCw size={12} className="mr-1.5" /> Reindex All Knowledge ({knowledgeDocs.length} docs)
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Add / Edit Knowledge Doc */}
            <form
              onSubmit={saveKnowledgeDoc}
              className="bg-white p-5 rounded-2xl border border-stone-200 space-y-3 h-fit"
            >
              <h3 className="text-sm font-bold text-stone-900">
                {newDoc.id ? 'Edit Knowledge Document' : 'Add Knowledge Document'}
              </h3>
              <Input
                placeholder="Document Title"
                value={newDoc.title}
                onChange={(e) => setNewDoc({ ...newDoc, title: e.target.value })}
                className="text-xs"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Category (workflow, faq...)"
                  value={newDoc.category}
                  onChange={(e) => setNewDoc({ ...newDoc, category: e.target.value })}
                  className="text-xs"
                />
                <Input
                  placeholder="Source Module"
                  value={newDoc.source_module}
                  onChange={(e) => setNewDoc({ ...newDoc, source_module: e.target.value })}
                  className="text-xs"
                />
              </div>
              <textarea
                rows={5}
                placeholder="Grounded knowledge content for Universal AI Assistant…"
                value={newDoc.content}
                onChange={(e) => setNewDoc({ ...newDoc, content: e.target.value })}
                className="w-full rounded-xl border border-stone-200 p-2.5 text-xs"
              />
              <div className="flex gap-2">
                <Button type="submit" className="flex-1 bg-[#0A6E3B] hover:bg-[#075030] text-white text-xs">
                  <Save size={12} className="mr-1" /> Save & Index Document
                </Button>
                {newDoc.id && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setNewDoc({
                        id: '',
                        title: '',
                        category: 'workflow',
                        source_module: 'admin_custom',
                        roles_allowed: ['consumer', 'vendor', 'mobile_vendor', 'admin'],
                        status: 'published',
                        approved_for_ai: true,
                        content: '',
                      })
                    }
                    className="text-xs"
                  >
                    Clear
                  </Button>
                )}
              </div>
            </form>

            {/* Knowledge Document List */}
            <div className="lg:col-span-2 space-y-3">
              {knowledgeDocs.map((doc) => (
                <div key={doc.id} className="bg-white p-4 rounded-2xl border border-stone-200 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-sm font-bold text-stone-900">{doc.title}</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge variant="outline" className="text-[10px]">
                          v{doc.version || 1}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {doc.category}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          Module: {doc.source_module || 'core'}
                        </Badge>
                        <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px]">
                          {doc.indexing_status || 'indexed'}
                        </Badge>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setNewDoc({
                          id: doc.id,
                          title: doc.title,
                          category: doc.category || 'workflow',
                          source_module: doc.source_module || 'core',
                          roles_allowed: doc.roles_allowed || ['consumer', 'vendor', 'admin'],
                          status: doc.status || 'published',
                          approved_for_ai: doc.approved_for_ai !== false,
                          content: doc.content || '',
                        })
                      }
                      className="text-xs h-7"
                    >
                      Edit / Version
                    </Button>
                  </div>
                  <p className="text-xs text-stone-600 leading-relaxed">{doc.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 8: TOOLS, TEMPLATES & QUALITY TESTING ==================== */}
      {activeTab === 'tools_test' && (
        <div className="space-y-6" data-testid="ai-cc-tools-test-section">
          {/* Quality Testing Sandbox */}
          <div className="bg-white p-5 rounded-2xl border-2 border-emerald-500/40 space-y-4">
            <h3 className="text-base font-display font-bold text-stone-900 flex items-center gap-2">
              <Sparkles size={16} className="text-[#0A6E3B]" /> Live AI Quality, Voice & TTS Testing Console
            </h3>
            <form onSubmit={runSandboxTest} className="flex flex-col md:flex-row gap-2">
              <Input
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                placeholder="Enter test question in Hindi, English, or Hinglish…"
                className="flex-1 text-xs"
                data-testid="sandbox-query-input"
              />
              <select
                value={testLang}
                onChange={(e) => setTestLang(e.target.value)}
                className="rounded-xl border border-stone-200 px-3 py-1.5 text-xs"
              >
                <option value="auto">Auto Detect Language</option>
                <option value="en">English</option>
                <option value="hi">Hindi (हिन्दी)</option>
                <option value="hinglish">Hinglish</option>
              </select>
              <Button
                type="submit"
                disabled={testRunning}
                className="bg-[#0A6E3B] hover:bg-[#075030] text-white text-xs"
                data-testid="sandbox-run-btn"
              >
                {testRunning ? 'Running…' : 'Run Quality Test'}
              </Button>
            </form>

            {testResult && (
              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-emerald-600 text-white">Intent: {testResult.intent}</Badge>
                    <Badge variant="outline">Lang: {testResult.language}</Badge>
                    <Badge variant="outline">Latency: {testResult.latency_ms}ms</Badge>
                    <Badge variant="outline">TTS Status: {testResult.audio?.status}</Badge>
                  </div>
                  <Button size="sm" onClick={playSandboxAudio} className="h-7 text-xs bg-[#0A6E3B] text-white">
                    <Play size={11} className="mr-1" /> Play Spoken Output
                  </Button>
                </div>
                <div className="p-3 bg-white rounded-lg border text-stone-900 whitespace-pre-wrap">
                  {testResult.reply}
                </div>
              </div>
            )}
          </div>

          {/* AI Tools Permissions */}
          <div className="bg-white p-5 rounded-2xl border border-stone-200 space-y-3">
            <h3 className="text-sm font-bold text-stone-900">Authorized AI Tools & Action Permissions</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {tools.map((tool) => (
                <div key={tool.id} className="p-3 rounded-xl border border-stone-200 bg-stone-50/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-stone-900">{tool.name}</div>
                      <div className="text-[11px] text-stone-500">{tool.description}</div>
                    </div>
                    <Switch
                      checked={Boolean(tool.enabled)}
                      onCheckedChange={(v) => toggleToolSetting(tool, { enabled: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-stone-600 pt-1 border-t">
                    <span>Roles: {(tool.allowed_roles || []).join(', ')}</span>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={Boolean(tool.confirmation_required)}
                        onChange={(e) =>
                          toggleToolSetting(tool, { confirmation_required: e.target.checked })
                        }
                      />
                      Require Confirmation
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Response Templates */}
          <div className="bg-white p-5 rounded-2xl border border-stone-200 space-y-3">
            <h3 className="text-sm font-bold text-stone-900">Multilingual Response Templates (EN / HI / Hinglish)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {templates.map((tpl) => (
                <div key={tpl.id} className="p-3 rounded-xl border border-stone-200 space-y-2 text-xs">
                  <div className="font-bold text-stone-800 uppercase">{tpl.key.replace(/_/g, ' ')}</div>
                  <Input
                    value={tpl.en || ''}
                    onChange={(e) =>
                      setTemplates((prev) =>
                        prev.map((item) => (item.id === tpl.id ? { ...item, en: e.target.value } : item))
                      )
                    }
                    placeholder="English template"
                    className="text-xs h-8"
                  />
                  <Input
                    value={tpl.hi || ''}
                    onChange={(e) =>
                      setTemplates((prev) =>
                        prev.map((item) => (item.id === tpl.id ? { ...item, hi: e.target.value } : item))
                      )
                    }
                    placeholder="Hindi template"
                    className="text-xs h-8"
                  />
                  <Button
                    size="sm"
                    onClick={() => saveTemplate(tpl)}
                    className="bg-[#0A6E3B] text-white text-xs h-7"
                  >
                    Save Template
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 9: CONVERSATIONS, FEEDBACK & AUDIT LOGS ==================== */}
      {activeTab === 'logs' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" data-testid="ai-cc-logs-section">
          <div className="bg-white p-4 rounded-2xl border border-stone-200 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Recent AI Conversations ({conversations.length})
            </h3>
            <div className="max-h-[460px] overflow-y-auto space-y-2 text-xs">
              {conversations.slice(0, 30).map((c) => (
                <div key={c.id} className="p-2.5 rounded-xl bg-stone-50 border border-stone-200">
                  <div className="flex items-center justify-between text-[10px] text-stone-500">
                    <span className="font-semibold uppercase text-emerald-800">
                      {c.sender_type} ({c.user_role || 'user'})
                    </span>
                    <span>{c.input_mode === 'voice' ? '🎙 Voice' : '⌨️ Text'} · {c.language || 'en'}</span>
                  </div>
                  <div className="mt-1 text-stone-800 line-clamp-3">{c.message}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-stone-200 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">
              User Feedback & Quality Reports ({feedbackList.length})
            </h3>
            <div className="max-h-[460px] overflow-y-auto space-y-2 text-xs">
              {feedbackList.map((f) => (
                <div key={f.id} className="p-2.5 rounded-xl bg-stone-50 border border-stone-200">
                  <div className="flex items-center justify-between">
                    <Badge
                      className={
                        f.rating > 0 ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-900'
                      }
                    >
                      {f.feedback_type || (f.rating > 0 ? 'helpful' : 'issue')}
                    </Badge>
                    <span className="text-[10px] text-stone-400">{f.user_role}</span>
                  </div>
                  {f.comment && <div className="mt-1 text-stone-700">{f.comment}</div>}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-stone-200 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Immutable Admin AI Audit Logs ({auditLogs.length})
            </h3>
            <div className="max-h-[460px] overflow-y-auto space-y-2 text-xs">
              {auditLogs.map((a) => (
                <div key={a.id} className="p-2.5 rounded-xl bg-stone-50 border border-stone-200">
                  <div className="font-semibold text-stone-900">{a.action}</div>
                  <div className="text-[10px] text-stone-500">
                    Module: {a.target_module} · Admin: {a.admin_email}
                  </div>
                  <div className="text-[10px] text-stone-400 mt-0.5">{a.timestamp}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

