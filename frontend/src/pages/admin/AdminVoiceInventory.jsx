import React, { useEffect, useState } from 'react';
import { api, formatApiErrorDetail } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Mic, Settings2, ShieldAlert, Languages, FileSpreadsheet, RefreshCw,
  CheckCircle2, XCircle, AlertTriangle, Plus, Trash2, Pencil, Users, Activity
} from 'lucide-react';

export default function AdminVoiceInventory() {
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'settings' | 'moderation' | 'translations' | 'audit'
  const [loading, setLoading] = useState(true);
  const [dashData, setDashData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // Moderation state
  const [voiceProducts, setVoiceProducts] = useState([]);
  const [modStatusFilter, setModStatusFilter] = useState('all');
  const [modSellerType, setModSellerType] = useState('all');
  const [modSearch, setModSearch] = useState('');
  const [editModProduct, setEditModProduct] = useState(null);

  // Translations dictionary state
  const [translations, setTranslations] = useState([]);
  const [dictSearch, setDictSearch] = useState('');
  const [dictModalOpen, setDictModalOpen] = useState(false);
  const [dictForm, setDictForm] = useState({
    canonical_id: '',
    canonical_name: '',
    name_en: '',
    name_hi: '',
    name_hinglish: '',
    category: 'vegetables',
    default_unit: 'KG',
    synonyms_str: '',
    approved: true,
  });

  // Seller Overrides & Audit Logs state
  const [vendors, setVendors] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [dRes, pRes, tRes, aRes, vRes] = await Promise.all([
        api.get('/admin/voice-inventory/dashboard'),
        api.get('/admin/voice-inventory/products'),
        api.get('/admin/voice-inventory/translations'),
        api.get('/admin/voice-inventory/audit-logs?limit=100'),
        api.get('/admin/vendors').catch(() => ({ data: [] })),
      ]);
      setDashData(dRes.data);
      setSettings(dRes.data.settings);
      setVoiceProducts(pRes.data || []);
      setTranslations(tRes.data || []);
      setAuditLogs(aRes.data || []);
      setVendors(vRes.data || []);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || 'Failed to load Admin Voice Inventory data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleSaveSettings = async () => {
    if (!settings) return;
    setSavingSettings(true);
    try {
      const { data } = await api.patch('/admin/voice-inventory/settings', {
        voice_enabled_globally: settings.voice_enabled_globally,
        enabled_for_retailers: settings.enabled_for_retailers,
        enabled_for_mobile_vendors: settings.enabled_for_mobile_vendors,
        languages_enabled: settings.languages_enabled,
        bulk_entry_enabled: settings.bulk_entry_enabled,
        voice_editing_enabled: settings.voice_editing_enabled,
        voice_search_enabled: settings.voice_search_enabled,
        image_recognition_enabled: settings.image_recognition_enabled,
        max_recording_seconds: Number(settings.max_recording_seconds || 60),
        max_batch_size: Number(settings.max_batch_size || 15),
        max_daily_requests_per_seller: Number(settings.max_daily_requests_per_seller || 200),
        ai_provider: settings.ai_provider,
        ai_model: settings.ai_model,
        translation_model: settings.translation_model,
        confidence_threshold: Number(settings.confidence_threshold || 0.75),
        require_manual_moderation: Boolean(settings.require_manual_moderation),
        retain_transcriptions: Boolean(settings.retain_transcriptions),
      });
      setSettings(data);
      toast.success('Voice inventory settings updated!');
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || 'Could not save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleModerateProduct = async (productId, action, extra = {}) => {
    try {
      await api.post(`/admin/voice-inventory/products/${productId}/moderate`, {
        action,
        reason: extra.reason || `Admin ${action}`,
        ...extra,
      });
      toast.success(`Product ${action} applied`);
      setEditModProduct(null);
      const { data } = await api.get('/admin/voice-inventory/products');
      setVoiceProducts(data || []);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || 'Moderation failed');
    }
  };

  const handleSaveTranslation = async (e) => {
    e.preventDefault();
    try {
      const syns = dictForm.synonyms_str
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const { data } = await api.post('/admin/voice-inventory/translations', {
        canonical_id: dictForm.canonical_id || undefined,
        canonical_name: dictForm.canonical_name,
        name_en: dictForm.name_en,
        name_hi: dictForm.name_hi,
        name_hinglish: dictForm.name_hinglish,
        category: dictForm.category,
        default_unit: dictForm.default_unit,
        synonyms: syns,
        approved: dictForm.approved,
      });
      setTranslations(data || []);
      setDictModalOpen(false);
      toast.success('Canonical product translation saved!');
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || 'Failed to save translation');
    }
  };

  const handleDeleteTranslation = async (canonicalId) => {
    if (!window.confirm(`Delete canonical dictionary entry ${canonicalId}?`)) return;
    try {
      await api.delete(`/admin/voice-inventory/translations/${canonicalId}`);
      setTranslations(translations.filter((t) => t.canonical_id !== canonicalId));
      toast.success('Translation entry removed');
    } catch {
      toast.error('Could not delete entry');
    }
  };

  const handleSellerOverride = async (sellerId, enabled) => {
    try {
      const { data } = await api.post('/admin/voice-inventory/seller-override', {
        seller_id: sellerId,
        enabled,
        reason: enabled ? 'Enabled by Super Admin' : 'Disabled by Super Admin',
      });
      setSettings({ ...settings, seller_overrides: data.seller_overrides });
      toast.success(`Voice access ${enabled ? 'enabled' : 'disabled'} for seller`);
    } catch {
      toast.error('Failed to update seller voice override');
    }
  };

  if (loading && !dashData) {
    return <div className="p-8 text-stone-500">Loading AI Voice Inventory Control Center…</div>;
  }

  const kpis = dashData?.kpis || {};
  const filteredModProducts = voiceProducts.filter((p) => {
    if (modStatusFilter !== 'all' && p.moderation_status !== modStatusFilter) return false;
    if (modSellerType !== 'all' && p.vendor_type !== modSellerType) return false;
    if (modSearch.trim()) {
      const q = modSearch.trim().toLowerCase();
      return (
        (p.name || '').toLowerCase().includes(q) ||
        (p.name_hi || '').toLowerCase().includes(q) ||
        (p.name_hinglish || '').toLowerCase().includes(q) ||
        (p.vendor_shop || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredTranslations = translations.filter((t) => {
    if (!dictSearch.trim()) return true;
    const q = dictSearch.trim().toLowerCase();
    return (
      (t.canonical_name || '').toLowerCase().includes(q) ||
      (t.name_en || '').toLowerCase().includes(q) ||
      (t.name_hi || '').toLowerCase().includes(q) ||
      (t.name_hinglish || '').toLowerCase().includes(q) ||
      (t.synonyms || []).some((s) => String(s).toLowerCase().includes(q))
    );
  });

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 text-xs font-semibold">
            <Mic size={13} /> Super Admin Control Center
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-stone-900 mt-2">
            AI Voice-Based Inventory & Multilingual Product Listing
          </h1>
          <p className="text-stone-500 text-sm mt-1">
            Monitor voice transcriptions, configure multilingual NLU models, moderate voice-listed products, and manage canonical Hindi/English/Hinglish synonyms.
          </p>
        </div>
        <Button variant="outline" onClick={loadAll} className="rounded-full">
          <RefreshCw size={14} className="mr-1.5" /> Refresh Data
        </Button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-stone-200 pb-3">
        {[
          { id: 'dashboard', label: 'Voice Activity Dashboard', icon: Activity },
          { id: 'settings', label: 'Feature & AI Model Controls', icon: Settings2 },
          { id: 'moderation', label: `Product Moderation (${voiceProducts.length})`, icon: ShieldAlert },
          { id: 'translations', label: `Multilingual Dictionary (${translations.length})`, icon: Languages },
          { id: 'audit', label: 'Seller Overrides & Audit Logs', icon: FileSpreadsheet },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-colors ${
              activeTab === id ? 'bg-[#0A6E3B] text-white shadow-sm' : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* TAB 1: VOICE ACTIVITY DASHBOARD (Section 25) */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <KpiCard label="Total Voice Attempts" value={kpis.total_voice_attempts || 0} sub="All spoken sessions" />
            <KpiCard label="Successful Transcriptions" value={kpis.successful_transcriptions || 0} sub={`Failed: ${kpis.failed_transcriptions || 0}`} />
            <KpiCard label="Products Extracted" value={kpis.products_extracted || 0} sub="Single + bulk items" />
            <KpiCard label="Verified & Published" value={kpis.products_published || 0} sub={`Awaiting: ${kpis.products_awaiting_verification || 0}`} />
            <KpiCard label="Avg Processing Time" value={`${kpis.avg_processing_ms || 0} ms`} sub={`Duplicates caught: ${kpis.duplicate_detections || 0}`} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Language Usage Breakdown */}
            <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-3">
              <h3 className="font-display text-base font-semibold text-stone-900">Language-Wise Voice Usage</h3>
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-100 text-center">
                  <div className="text-xs text-stone-500">English</div>
                  <div className="text-2xl font-display font-bold text-emerald-900 mt-1">{dashData?.language_usage?.en || 0}</div>
                </div>
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-100 text-center">
                  <div className="text-xs text-stone-500">हिन्दी (Hindi)</div>
                  <div className="text-2xl font-display font-bold text-amber-900 mt-1">{dashData?.language_usage?.hi || 0}</div>
                </div>
                <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-100 text-center">
                  <div className="text-xs text-stone-500">Hinglish</div>
                  <div className="text-2xl font-display font-bold text-blue-900 mt-1">{dashData?.language_usage?.hinglish || 0}</div>
                </div>
              </div>
            </div>

            {/* Retailer vs Mobile Vendor Usage */}
            <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-3">
              <h3 className="font-display text-base font-semibold text-stone-900">Retail Shop vs Mobile / Cart Vendor Usage</h3>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 text-center">
                  <div className="text-xs text-stone-500">Fixed-Shop Retailers</div>
                  <div className="text-2xl font-display font-bold text-stone-900 mt-1">{dashData?.seller_type_usage?.retailer || 0}</div>
                </div>
                <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 text-center">
                  <div className="text-xs text-stone-500">Mobile / Street Cart Vendors</div>
                  <div className="text-2xl font-display font-bold text-stone-900 mt-1">{dashData?.seller_type_usage?.cart_vendor || 0}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Voice Sessions Table */}
          <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
            <div className="p-4 border-b border-stone-100 font-display font-semibold text-stone-900">
              Recent Voice Inventory Sessions
            </div>
            <Table>
              <TableHeader>
                <TableRow className="bg-stone-50">
                  <TableHead>Session ID</TableHead>
                  <TableHead>Seller</TableHead>
                  <TableHead>Spoken Transcript</TableHead>
                  <TableHead>Lang</TableHead>
                  <TableHead>Intent</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(dashData?.recent_sessions || []).map((s) => (
                  <TableRow key={s.session_id}>
                    <TableCell className="font-mono text-xs">{s.session_id}</TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium text-stone-900">{s.seller_name || s.seller_id}</div>
                      <div className="text-stone-400">{s.seller_type}</div>
                    </TableCell>
                    <TableCell className="text-xs font-medium text-stone-800 max-w-xs truncate" title={s.transcript_raw}>
                      {s.transcript_raw}
                    </TableCell>
                    <TableCell><Badge variant="outline" className="uppercase text-[10px]">{s.detected_language}</Badge></TableCell>
                    <TableCell className="text-xs">{s.intent_type}</TableCell>
                    <TableCell className="text-xs font-semibold">{s.extracted_count ?? 1}</TableCell>
                    <TableCell>
                      <Badge className={s.status === 'verified_published' ? 'bg-emerald-100 text-emerald-900 border-0 text-[10px]' : 'bg-amber-100 text-amber-900 border-0 text-[10px]'}>
                        {s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-stone-400">{new Date(s.created_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {(dashData?.recent_sessions || []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-stone-400 text-sm">No voice sessions recorded yet.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* TAB 2: FEATURE & AI MODEL CONTROLS (Sections 24 & 28) */}
      {activeTab === 'settings' && settings && (
        <div className="rounded-2xl border border-stone-200 bg-white p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="font-display text-base font-semibold text-stone-900 border-b pb-2">Global & Role Feature Toggles</h3>
              <ToggleRow
                label="Enable Voice Inventory Globally"
                desc="Master switch for AI voice product listing across the entire marketplace"
                checked={Boolean(settings.voice_enabled_globally)}
                onChange={(v) => setSettings({ ...settings, voice_enabled_globally: v })}
              />
              <ToggleRow
                label="Enable for Fixed-Shop Retailers"
                desc="Allow retail shop owners to add/edit inventory by voice"
                checked={Boolean(settings.enabled_for_retailers)}
                onChange={(v) => setSettings({ ...settings, enabled_for_retailers: v })}
              />
              <ToggleRow
                label="Enable for Mobile / Street Cart Vendors"
                desc="Allow cart & street vendors to update products hands-free"
                checked={Boolean(settings.enabled_for_mobile_vendors)}
                onChange={(v) => setSettings({ ...settings, enabled_for_mobile_vendors: v })}
              />
              <ToggleRow
                label="Enable Bulk Multi-Product Voice Entry"
                desc="Allow speaking multiple products in a single recording"
                checked={Boolean(settings.bulk_entry_enabled)}
                onChange={(v) => setSettings({ ...settings, bulk_entry_enabled: v })}
              />
              <ToggleRow
                label="Enable Voice-Based Inventory Editing"
                desc="Allow commands like 'Increase potato stock by 10 kilo'"
                checked={Boolean(settings.voice_editing_enabled)}
                onChange={(v) => setSettings({ ...settings, voice_editing_enabled: v })}
              />
              <ToggleRow
                label="Enable Voice-Based Inventory Search"
                desc="Allow commands like 'Show products priced below 50 rupees'"
                checked={Boolean(settings.voice_search_enabled)}
                onChange={(v) => setSettings({ ...settings, voice_search_enabled: v })}
              />
              <ToggleRow
                label="Require Manual Admin Moderation Before Live Visibility"
                desc="Hold new voice-created products in Pending Review until approved by Admin"
                checked={Boolean(settings.require_manual_moderation)}
                onChange={(v) => setSettings({ ...settings, require_manual_moderation: v })}
              />
            </div>

            <div className="space-y-4">
              <h3 className="font-display text-base font-semibold text-stone-900 border-b pb-2">Language, Limits & AI Model Configuration</h3>
              <div className="grid grid-cols-3 gap-2">
                {['en', 'hi', 'hinglish'].map((lg) => (
                  <div key={lg} className="p-3 rounded-xl border border-stone-200 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase">{lg}</span>
                    <Switch
                      checked={Boolean(settings.languages_enabled?.[lg] ?? true)}
                      onCheckedChange={(v) =>
                        setSettings({
                          ...settings,
                          languages_enabled: { ...(settings.languages_enabled || {}), [lg]: v },
                        })
                      }
                    />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-stone-500">Max Recording Duration (Seconds)</Label>
                  <Input
                    type="number"
                    value={settings.max_recording_seconds || 60}
                    onChange={(e) => setSettings({ ...settings, max_recording_seconds: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs text-stone-500">Max Bulk Products Per Recording</Label>
                  <Input
                    type="number"
                    value={settings.max_batch_size || 15}
                    onChange={(e) => setSettings({ ...settings, max_batch_size: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-stone-500">AI Extraction Provider</Label>
                  <Input
                    value={settings.ai_provider || 'hybrid_llm_deterministic'}
                    onChange={(e) => setSettings({ ...settings, ai_provider: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs text-stone-500">AI Extraction Model</Label>
                  <Input
                    value={settings.ai_model || 'gpt-4o-mini'}
                    onChange={(e) => setSettings({ ...settings, ai_model: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-stone-500">Translation Model</Label>
                  <Input
                    value={settings.translation_model || 'indic_multilingual_v2'}
                    onChange={(e) => setSettings({ ...settings, translation_model: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs text-stone-500">AI Confidence Threshold (0.0 – 1.0)</Label>
                  <Input
                    type="number"
                    step="0.05"
                    min="0.1"
                    max="1.0"
                    value={settings.confidence_threshold ?? 0.75}
                    onChange={(e) => setSettings({ ...settings, confidence_threshold: e.target.value })}
                  />
                </div>
              </div>

              <ToggleRow
                label="Retain Spoken Transcriptions in Logs"
                desc="Store raw voice transcripts for audit and accuracy tuning"
                checked={Boolean(settings.retain_transcriptions)}
                onChange={(v) => setSettings({ ...settings, retain_transcriptions: v })}
              />
            </div>
          </div>

          <div className="pt-4 border-t border-stone-200 flex justify-end">
            <Button onClick={handleSaveSettings} disabled={savingSettings} className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white px-6">
              {savingSettings ? 'Saving…' : 'Save Voice & AI Configuration'}
            </Button>
          </div>
        </div>
      )}

      {/* TAB 3: VOICE PRODUCT MODERATION (Section 26) */}
      {activeTab === 'moderation' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-2xl border border-stone-200">
            <Input
              placeholder="Search voice products by English, Hindi, Hinglish or seller..."
              value={modSearch}
              onChange={(e) => setModSearch(e.target.value)}
              className="max-w-xs text-xs"
            />
            <select
              value={modStatusFilter}
              onChange={(e) => setModStatusFilter(e.target.value)}
              className="h-9 rounded-lg border border-stone-200 px-3 text-xs bg-white"
            >
              <option value="all">All Moderation Statuses</option>
              <option value="approved">Approved</option>
              <option value="pending_review">Pending Review</option>
              <option value="flagged">Flagged</option>
              <option value="correction_requested">Correction Requested</option>
              <option value="suspended">Suspended</option>
              <option value="rejected">Rejected</option>
            </select>
            <select
              value={modSellerType}
              onChange={(e) => setModSellerType(e.target.value)}
              className="h-9 rounded-lg border border-stone-200 px-3 text-xs bg-white"
            >
              <option value="all">All Seller Types</option>
              <option value="retailer">Retail Shops</option>
              <option value="cart_vendor">Mobile / Cart Vendors</option>
            </select>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-stone-50">
                  <TableHead>Product (EN / HI / Hinglish)</TableHead>
                  <TableHead>Seller</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Stock & Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Moderation Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredModProducts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-semibold text-stone-900 text-sm">{p.name_en || p.name}</div>
                      <div className="text-xs text-stone-500">
                        हिन्दी: <strong>{p.name_hi || '—'}</strong> · Hinglish: <strong>{p.name_hinglish || '—'}</strong>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium text-stone-800">{p.vendor_shop || p.vendor_name}</div>
                      <div className="text-stone-400">{p.vendor_type}</div>
                    </TableCell>
                    <TableCell className="text-xs capitalize">{p.category}</TableCell>
                    <TableCell className="text-xs">
                      <div className="font-semibold text-[#0A6E3B]">₹{p.price} / {p.unit}</div>
                      <div className="text-stone-500">Stock: {p.stock_quantity ?? '—'} {p.stock_unit || ''}</div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`border-0 text-[10px] ${
                          p.moderation_status === 'approved'
                            ? 'bg-emerald-100 text-emerald-900'
                            : p.moderation_status === 'rejected' || p.moderation_status === 'suspended'
                            ? 'bg-red-100 text-red-900'
                            : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        {p.moderation_status || 'approved'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="outline" onClick={() => handleModerateProduct(p.id, 'approve')} className="h-7 text-[11px] text-emerald-700">
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditModProduct(p)} className="h-7 text-[11px]">
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleModerateProduct(p.id, 'flag')} className="h-7 text-[11px] text-amber-700">
                        Flag
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleModerateProduct(p.id, 'suspend')} className="h-7 text-[11px] text-red-600">
                        Suspend
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleModerateProduct(p.id, 'reject')} className="h-7 text-[11px] text-red-700">
                        Reject
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredModProducts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-stone-400 text-sm">No voice-created products match the current filter.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {editModProduct && (
            <Dialog open={Boolean(editModProduct)} onOpenChange={() => setEditModProduct(null)}>
              <DialogContent className="bg-white max-w-lg">
                <DialogHeader>
                  <DialogTitle>Edit Voice Product Metadata & Translations</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">English Name</Label>
                    <Input value={editModProduct.name_en || editModProduct.name || ''} onChange={(e) => setEditModProduct({ ...editModProduct, name_en: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Hindi Name (हिन्दी)</Label>
                    <Input value={editModProduct.name_hi || ''} onChange={(e) => setEditModProduct({ ...editModProduct, name_hi: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Hinglish Name</Label>
                    <Input value={editModProduct.name_hinglish || ''} onChange={(e) => setEditModProduct({ ...editModProduct, name_hinglish: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Price (₹)</Label>
                      <Input type="number" value={editModProduct.price || 0} onChange={(e) => setEditModProduct({ ...editModProduct, price: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Category</Label>
                      <Input value={editModProduct.category || ''} onChange={(e) => setEditModProduct({ ...editModProduct, category: e.target.value })} />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setEditModProduct(null)}>Cancel</Button>
                  <Button
                    className="bg-[#0A6E3B] text-white rounded-full"
                    onClick={() =>
                      handleModerateProduct(editModProduct.id, 'edit', {
                        name_en: editModProduct.name_en,
                        name_hi: editModProduct.name_hi,
                        name_hinglish: editModProduct.name_hinglish,
                        price: parseFloat(editModProduct.price),
                        category: editModProduct.category,
                      })
                    }
                  >
                    Save Corrections
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}

      {/* TAB 4: MULTILINGUAL TRANSLATION & SYNONYM DICTIONARY (Section 27) */}
      {activeTab === 'translations' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-stone-200">
            <Input
              placeholder="Search canonical product, Hindi name, Hinglish or synonym..."
              value={dictSearch}
              onChange={(e) => setDictSearch(e.target.value)}
              className="max-w-sm text-xs"
            />
            <Button
              size="sm"
              onClick={() => {
                setDictForm({
                  canonical_id: '',
                  canonical_name: '',
                  name_en: '',
                  name_hi: '',
                  name_hinglish: '',
                  category: 'vegetables',
                  default_unit: 'KG',
                  synonyms_str: '',
                  approved: true,
                });
                setDictModalOpen(true);
              }}
              className="rounded-full bg-[#0A6E3B] text-white text-xs"
            >
              <Plus size={14} className="mr-1.5" /> Add Canonical Product Translation
            </Button>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-stone-50">
                  <TableHead>Canonical ID</TableHead>
                  <TableHead>English</TableHead>
                  <TableHead>हिन्दी (Hindi)</TableHead>
                  <TableHead>Hinglish</TableHead>
                  <TableHead>Category & Unit</TableHead>
                  <TableHead>Search Synonyms</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTranslations.map((t) => (
                  <TableRow key={t.canonical_id}>
                    <TableCell className="font-mono text-xs text-stone-500">{t.canonical_id}</TableCell>
                    <TableCell className="font-semibold text-stone-900 text-sm">{t.name_en}</TableCell>
                    <TableCell className="font-semibold text-emerald-800 text-sm">{t.name_hi}</TableCell>
                    <TableCell className="text-stone-700 text-sm">{t.name_hinglish}</TableCell>
                    <TableCell className="text-xs">
                      <span className="capitalize">{t.category}</span> · <Badge variant="outline" className="text-[10px]">{t.default_unit}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-stone-500 max-w-xs truncate" title={(t.synonyms || []).join(', ')}>
                      {(t.synonyms || []).slice(0, 6).join(', ')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setDictForm({
                            canonical_id: t.canonical_id,
                            canonical_name: t.canonical_name,
                            name_en: t.name_en,
                            name_hi: t.name_hi,
                            name_hinglish: t.name_hinglish,
                            category: t.category,
                            default_unit: t.default_unit,
                            synonyms_str: (t.synonyms || []).join(', '),
                            approved: t.approved ?? true,
                          });
                          setDictModalOpen(true);
                        }}
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDeleteTranslation(t.canonical_id)} className="text-red-600">
                        <Trash2 size={14} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Dialog open={dictModalOpen} onOpenChange={setDictModalOpen}>
            <DialogContent className="bg-white max-w-lg">
              <DialogHeader>
                <DialogTitle>{dictForm.canonical_id ? 'Edit Canonical Product Translation' : 'Add Canonical Product Translation'}</DialogTitle>
                <DialogDescription>
                  Define canonical English, Hindi, and Hinglish names and search synonyms.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSaveTranslation} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Canonical Name *</Label>
                    <Input required value={dictForm.canonical_name} onChange={(e) => setDictForm({ ...dictForm, canonical_name: e.target.value })} placeholder="Potato" />
                  </div>
                  <div>
                    <Label className="text-xs">English Display Name *</Label>
                    <Input required value={dictForm.name_en} onChange={(e) => setDictForm({ ...dictForm, name_en: e.target.value })} placeholder="Potato" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Hindi Display Name (हिन्दी) *</Label>
                    <Input required value={dictForm.name_hi} onChange={(e) => setDictForm({ ...dictForm, name_hi: e.target.value })} placeholder="आलू" />
                  </div>
                  <div>
                    <Label className="text-xs">Hinglish Display Name *</Label>
                    <Input required value={dictForm.name_hinglish} onChange={(e) => setDictForm({ ...dictForm, name_hinglish: e.target.value })} placeholder="Aloo" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Category</Label>
                    <Input value={dictForm.category} onChange={(e) => setDictForm({ ...dictForm, category: e.target.value })} placeholder="vegetables" />
                  </div>
                  <div>
                    <Label className="text-xs">Default Normalized Unit</Label>
                    <Input value={dictForm.default_unit} onChange={(e) => setDictForm({ ...dictForm, default_unit: e.target.value })} placeholder="KG, L, PACKET" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Regional Synonyms & Transliterations (comma-separated)</Label>
                  <Input
                    value={dictForm.synonyms_str}
                    onChange={(e) => setDictForm({ ...dictForm, synonyms_str: e.target.value })}
                    placeholder="potato, potatoes, aloo, aalu, आलू, बटाटा"
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setDictModalOpen(false)}>Cancel</Button>
                  <Button type="submit" className="rounded-full bg-[#0A6E3B] text-white">Save Entry</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* TAB 5: SELLER OVERRIDES & IMMUTABLE AUDIT LOGS (Sections 24 & 30) */}
      {activeTab === 'audit' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
            <div className="p-4 border-b border-stone-100 font-display font-semibold text-stone-900">
              Per-Seller Voice Access Controls
            </div>
            <Table>
              <TableHeader>
                <TableRow className="bg-stone-50">
                  <TableHead>Seller / Shop Name</TableHead>
                  <TableHead>Role Type</TableHead>
                  <TableHead>Voice Access Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendors.slice(0, 20).map((v) => {
                  const ov = settings?.seller_overrides?.[v.id];
                  const isAllowed = ov ? ov.enabled : true;
                  return (
                    <TableRow key={v.id}>
                      <TableCell className="text-sm font-medium text-stone-900">{v.shop_name || v.name}</TableCell>
                      <TableCell className="text-xs text-stone-500">{v.vendor_type}</TableCell>
                      <TableCell>
                        <Badge className={isAllowed ? 'bg-emerald-100 text-emerald-900 border-0 text-[10px]' : 'bg-red-100 text-red-900 border-0 text-[10px]'}>
                          {isAllowed ? 'Voice Enabled' : 'Disabled by Admin'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSellerOverride(v.id, !isAllowed)}
                          className="h-7 text-xs rounded-full"
                        >
                          {isAllowed ? 'Disable Voice for Seller' : 'Enable Voice for Seller'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
            <div className="p-4 border-b border-stone-100 font-display font-semibold text-stone-900">
              Immutable Voice Inventory Audit Logs
            </div>
            <Table>
              <TableHeader>
                <TableRow className="bg-stone-50">
                  <TableHead>Log ID</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditLogs.map((l) => (
                  <TableRow key={l.log_id}>
                    <TableCell className="font-mono text-xs">{l.log_id}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline" className="text-[10px] mr-1">{l.actor_role}</Badge>
                      <span className="text-stone-600">{l.actor_id}</span>
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-stone-800">{l.action}</TableCell>
                    <TableCell className="text-xs text-stone-500 max-w-md truncate">
                      {JSON.stringify(l.new_value || l.reason || '')}
                    </TableCell>
                    <TableCell className="text-xs text-stone-400">{new Date(l.timestamp).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {auditLogs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-stone-400 text-sm">No audit logs yet.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, sub }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="text-2xl font-display font-bold text-stone-900 mt-1">{value}</div>
      {sub && <div className="text-[11px] text-stone-400 mt-1">{sub}</div>}
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-stone-50 border border-stone-100">
      <div>
        <div className="text-xs font-semibold text-stone-900">{label}</div>
        <div className="text-[11px] text-stone-500">{desc}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

