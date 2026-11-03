import React, { useEffect, useState } from 'react';
import { api, formatApiErrorDetail } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Cpu, Zap, ShieldAlert, Sparkles, Filter, Search, Sliders,
  RefreshCw, CheckCircle2, AlertTriangle, Settings2, Info, Lock
} from 'lucide-react';

export default function AdminSmartFeatures() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ total_features: 0, master_switch: true, emergency_switches: {}, features: [], config: {} });
  const [activeTier, setActiveTier] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Edit feature modal state
  const [editingFeature, setEditingFeature] = useState(null);
  const [editForm, setEditForm] = useState({
    enabled: true,
    beta: false,
    confidence_threshold: 0.75,
    model_name: 'gemini-1.5-flash',
    rate_limit: 60,
    allowed_roles: ['consumer', 'vendor', 'admin'],
  });
  const [savingFeature, setSavingFeature] = useState(false);

  // Global config modal state
  const [configOpen, setConfigOpen] = useState(false);
  const [configForm, setConfigForm] = useState({
    daily_ai_budget: 50.0,
    monthly_ai_budget: 1000.0,
    per_user_limit: 100,
    default_model: 'gemini-1.5-flash',
    mobile_vendor_max_demand_radius: 5000,
  });
  const [savingConfig, setSavingConfig] = useState(false);

  const fetchFeatures = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/smart-features');
      setData(res.data);
      if (res.data.config) {
        setConfigForm({
          daily_ai_budget: res.data.config.daily_ai_budget || 50.0,
          monthly_ai_budget: res.data.config.monthly_ai_budget || 1000.0,
          per_user_limit: res.data.config.per_user_limit || 100,
          default_model: res.data.config.default_model || 'gemini-1.5-flash',
          mobile_vendor_max_demand_radius: res.data.config.mobile_vendor_max_demand_radius || 5000,
        });
      }
    } catch (err) {
      toast.error('Failed to load smart feature registry: ' + formatApiErrorDetail(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeatures();
  }, []);

  const handleMasterToggle = async (newVal) => {
    try {
      const res = await api.post('/admin/smart-features/master-toggle', {
        master_switch: newVal,
        admin_reason: `Super Admin switched ALL_SMART_FEATURES to ${newVal ? 'ON' : 'OFF'}`
      });
      toast.success(`Master Smart Features switch set to ${newVal ? 'ENABLED' : 'DISABLED'}`);
      setData(prev => ({ ...prev, master_switch: newVal }));
    } catch (err) {
      toast.error('Failed to toggle master switch: ' + formatApiErrorDetail(err));
    }
  };

  const handleEmergencySubsystemToggle = async (subsystem, newVal) => {
    try {
      await api.post('/admin/smart-features/master-toggle', {
        subsystem: subsystem,
        subsystem_value: newVal,
        admin_reason: `Emergency control toggled ${subsystem} to ${newVal}`
      });
      toast.success(`${subsystem} set to ${newVal ? 'ON' : 'OFF'}`);
      setData(prev => ({
        ...prev,
        emergency_switches: {
          ...prev.emergency_switches,
          [subsystem]: newVal
        }
      }));
    } catch (err) {
      toast.error('Failed to toggle subsystem: ' + formatApiErrorDetail(err));
    }
  };

  const handleFeatureToggle = async (featureId, currentVal) => {
    const newVal = !currentVal;
    try {
      await api.patch(`/admin/smart-features/${featureId}`, {
        enabled: newVal
      });
      toast.success(`Feature ${newVal ? 'enabled' : 'disabled'}`);
      setData(prev => ({
        ...prev,
        features: prev.features.map(f => f.feature_id === featureId ? { ...f, enabled: newVal } : f)
      }));
    } catch (err) {
      toast.error('Failed to update feature: ' + formatApiErrorDetail(err));
    }
  };

  const openEditModal = (feature) => {
    setEditingFeature(feature);
    setEditForm({
      enabled: feature.enabled,
      beta: feature.beta || false,
      confidence_threshold: feature.confidence_threshold || 0.70,
      model_name: feature.model_name || 'gemini-1.5-flash',
      rate_limit: feature.rate_limit || 60,
      allowed_roles: feature.allowed_roles || ['consumer', 'vendor', 'admin'],
    });
  };

  const saveFeatureEdit = async () => {
    if (!editingFeature) return;
    setSavingFeature(true);
    try {
      const res = await api.patch(`/admin/smart-features/${editingFeature.feature_id}`, editForm);
      toast.success(`Feature '${editingFeature.feature_name}' updated successfully.`);
      setData(prev => ({
        ...prev,
        features: prev.features.map(f => f.feature_id === editingFeature.feature_id ? res.data.feature : f)
      }));
      setEditingFeature(null);
    } catch (err) {
      toast.error('Failed to save changes: ' + formatApiErrorDetail(err));
    } finally {
      setSavingFeature(false);
    }
  };

  const saveGlobalConfig = async () => {
    setSavingConfig(true);
    try {
      const res = await api.put('/admin/smart-features/config', configForm);
      toast.success('Global smart feature configuration updated.');
      setData(prev => ({ ...prev, config: res.data.config }));
      setConfigOpen(false);
    } catch (err) {
      toast.error('Failed to save config: ' + formatApiErrorDetail(err));
    } finally {
      setSavingConfig(false);
    }
  };

  // Filtering
  const filteredFeatures = (data.features || []).filter(f => {
    if (activeTier !== 'all' && f.tier !== activeTier) return false;
    if (categoryFilter !== 'all' && f.category !== categoryFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = (f.feature_name || '').toLowerCase().includes(q);
      const matchId = (f.feature_id || '').toLowerCase().includes(q);
      const matchDesc = (f.description || '').toLowerCase().includes(q);
      if (!matchName && !matchId && !matchDesc) return false;
    }
    return true;
  });

  const tier1Count = (data.features || []).filter(f => f.tier === 'tier1').length;
  const tier2Count = (data.features || []).filter(f => f.tier === 'tier2').length;
  const tier3Count = (data.features || []).filter(f => f.tier === 'tier3').length;
  const enabledCount = (data.features || []).filter(f => f.enabled).length;

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-stone-900 flex items-center gap-2">
              <Cpu className="text-emerald-600" size={26} />
              Smart AI Ecosystem & Super Admin Control
            </h1>
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
              45 Features Registered
            </Badge>
          </div>
          <p className="text-sm text-stone-500 mt-1">
            Centralized operational management, emergency kill-switches, and granular role permissions across all 3 AI tiers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchFeatures} disabled={loading} className="gap-2">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
          <Button variant="default" size="sm" onClick={() => setConfigOpen(true)} className="gap-2 bg-stone-900 text-white hover:bg-stone-800">
            <Settings2 size={14} />
            Global AI Config
          </Button>
        </div>
      </div>

      {/* MASTER KILL-SWITCH BANNER */}
      <div className={`p-5 rounded-xl border transition-all ${
        data.master_switch 
          ? 'bg-emerald-50/50 border-emerald-200 text-emerald-950' 
          : 'bg-rose-50 border-rose-200 text-rose-950'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`p-2.5 rounded-lg ${data.master_switch ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
              <ShieldAlert size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-base">MASTER SMART FEATURES KILL-SWITCH</span>
                <Badge className={data.master_switch ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}>
                  {data.master_switch ? 'ACTIVE / ONLINE' : 'EMERGENCY SHUTDOWN'}
                </Badge>
              </div>
              <p className="text-xs text-stone-600 mt-1 max-w-2xl">
                When turned OFF, all 45 Smart AI, Attribution, and Forecasting features are immediately suspended platform-wide with graceful 503 fallback. Core marketplace browsing, authentication, and cart checkout remain completely functional.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-stone-600">ALL SMART FEATURES:</span>
            <Switch
              checked={data.master_switch}
              onCheckedChange={handleMasterToggle}
              className="data-[state=checked]:bg-emerald-600"
            />
          </div>
        </div>

        {/* Emergency Subsystem Quick-Toggles */}
        <div className="mt-4 pt-4 border-t border-stone-200/60 flex flex-wrap items-center gap-4 text-xs">
          <span className="font-medium text-stone-500 flex items-center gap-1">
            <Zap size={13} /> Emergency Subsystem Kill-Switches:
          </span>
          {[
            { key: 'ai_enabled', label: 'AI Engine' },
            { key: 'attribution_enabled', label: 'Attribution Pipeline' },
            { key: 'location_enabled', label: 'Geo & Heatmaps' },
            { key: 'notifications_enabled', label: 'Notifications' },
            { key: 'fraud_detection_enabled', label: 'Fraud Detection' },
          ].map(sub => {
            const isSubOn = data.emergency_switches?.[sub.key] ?? true;
            return (
              <div key={sub.key} className="flex items-center gap-1.5 bg-white/80 px-2.5 py-1 rounded-md border border-stone-200">
                <span>{sub.label}</span>
                <Switch
                  checked={isSubOn}
                  disabled={!data.master_switch}
                  onCheckedChange={(val) => handleEmergencySubsystemToggle(sub.key, val)}
                  className="scale-75"
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Metrics Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3 bg-white border border-stone-200 rounded-lg shadow-sm">
          <div className="text-xs text-stone-500 font-medium">Total Features</div>
          <div className="text-xl font-bold text-stone-900 mt-1">{data.total_features}</div>
        </div>
        <div className="p-3 bg-white border border-stone-200 rounded-lg shadow-sm">
          <div className="text-xs text-stone-500 font-medium">Tier 1: Core</div>
          <div className="text-xl font-bold text-emerald-600 mt-1">{tier1Count} / 10</div>
        </div>
        <div className="p-3 bg-white border border-stone-200 rounded-lg shadow-sm">
          <div className="text-xs text-stone-500 font-medium">Tier 2: Advanced</div>
          <div className="text-xl font-bold text-blue-600 mt-1">{tier2Count} / 20</div>
        </div>
        <div className="p-3 bg-white border border-stone-200 rounded-lg shadow-sm">
          <div className="text-xs text-stone-500 font-medium">Tier 3: Scale</div>
          <div className="text-xl font-bold text-purple-600 mt-1">{tier3Count} / 15</div>
        </div>
        <div className="p-3 bg-white border border-stone-200 rounded-lg shadow-sm">
          <div className="text-xs text-stone-500 font-medium">Active / Enabled</div>
          <div className="text-xl font-bold text-emerald-700 mt-1">{enabledCount}</div>
        </div>
        <div className="p-3 bg-white border border-stone-200 rounded-lg shadow-sm">
          <div className="text-xs text-stone-500 font-medium">Default Model</div>
          <div className="text-xs font-semibold text-stone-800 mt-2 truncate">
            {data.config?.default_model || 'gemini-1.5-flash'}
          </div>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white p-3 rounded-lg border border-stone-200 shadow-sm">
        {/* Tier Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {[
            { id: 'all', label: 'All Tiers', count: data.total_features },
            { id: 'tier1', label: 'Tier 1: Core', count: tier1Count },
            { id: 'tier2', label: 'Tier 2: BI', count: tier2Count },
            { id: 'tier3', label: 'Tier 3: Scale', count: tier3Count },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTier(t.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                activeTier === t.id
                  ? 'bg-stone-900 text-white shadow-sm'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>

        {/* Category Filter & Search */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-60">
            <Search className="absolute left-2.5 top-2.5 text-stone-400" size={14} />
            <Input
              placeholder="Search features..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Feature Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredFeatures.map((feat) => {
          const isEnabled = feat.enabled && data.master_switch;
          return (
            <div
              key={feat.feature_id}
              className={`p-4 rounded-xl border bg-white flex flex-col justify-between transition-all hover:shadow-md ${
                !feat.enabled ? 'opacity-70 bg-stone-50 border-stone-200' : 'border-stone-200'
              }`}
            >
              <div>
                {/* Header row: Tier, Beta, Toggle */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className={`text-[10px] font-bold uppercase ${
                      feat.tier === 'tier1' ? 'border-emerald-300 text-emerald-700 bg-emerald-50' :
                      feat.tier === 'tier2' ? 'border-blue-300 text-blue-700 bg-blue-50' :
                      'border-purple-300 text-purple-700 bg-purple-50'
                    }`}>
                      {feat.tier.toUpperCase()}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] text-stone-600 bg-stone-100">
                      {feat.category}
                    </Badge>
                    {feat.beta && (
                      <Badge className="text-[10px] bg-amber-500 text-white font-semibold">
                        BETA
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Switch
                      checked={feat.enabled}
                      disabled={!data.master_switch}
                      onCheckedChange={() => handleFeatureToggle(feat.feature_id, feat.enabled)}
                      className="data-[state=checked]:bg-emerald-600"
                    />
                  </div>
                </div>

                {/* Title & Description */}
                <h3 className="font-semibold text-stone-900 text-sm mt-2.5 flex items-center gap-1.5">
                  {feat.feature_name}
                </h3>
                <p className="text-xs text-stone-500 mt-1 line-clamp-2 leading-relaxed">
                  {feat.description}
                </p>

                {/* Roles Pills */}
                <div className="mt-3 flex flex-wrap items-center gap-1">
                  <span className="text-[10px] text-stone-400 font-medium">Roles:</span>
                  {(feat.allowed_roles || []).map(r => (
                    <span key={r} className="text-[10px] bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded border border-stone-200 capitalize">
                      {r === 'consumer' ? 'Customer' : r === 'vendor' ? 'Seller' : r}
                    </span>
                  ))}
                </div>
              </div>

              {/* Card Footer info & configure */}
              <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs text-stone-400">
                <div className="flex items-center gap-2 text-[11px]">
                  <span>Conf: {Math.round((feat.confidence_threshold || 0.7) * 100)}%</span>
                  <span>•</span>
                  <span>{feat.rate_limit || 60}/min</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openEditModal(feat)}
                  className="h-7 px-2 text-xs text-stone-600 hover:text-stone-900 hover:bg-stone-100 flex items-center gap-1"
                >
                  <Sliders size={12} />
                  Configure
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredFeatures.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-stone-200">
          <Cpu className="mx-auto text-stone-400 mb-2" size={32} />
          <p className="text-stone-600 text-sm font-medium">No smart features match your search criteria.</p>
        </div>
      )}

      {/* FEATURE EDIT MODAL */}
      <Dialog open={!!editingFeature} onOpenChange={(open) => !open && setEditingFeature(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sliders size={18} className="text-emerald-600" />
              Configure {editingFeature?.feature_name}
            </DialogTitle>
          </DialogHeader>

          {editingFeature && (
            <div className="space-y-4 py-2 text-sm">
              <div className="flex items-center justify-between p-3 bg-stone-50 rounded-lg border border-stone-200">
                <div>
                  <div className="font-medium text-stone-900">Feature Status</div>
                  <div className="text-xs text-stone-500">Enable or deactivate this individual smart feature</div>
                </div>
                <Switch
                  checked={editForm.enabled}
                  onCheckedChange={(val) => setEditForm(prev => ({ ...prev, enabled: val }))}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-stone-50 rounded-lg border border-stone-200">
                <div>
                  <div className="font-medium text-stone-900">Beta Mode</div>
                  <div className="text-xs text-stone-500">Mark feature as experimental in user UI</div>
                </div>
                <Switch
                  checked={editForm.beta}
                  onCheckedChange={(val) => setEditForm(prev => ({ ...prev, beta: val }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">AI Model Selection</Label>
                <Select
                  value={editForm.model_name}
                  onValueChange={(val) => setEditForm(prev => ({ ...prev, model_name: val }))}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini-1.5-flash">Gemini 1.5 Flash (Fast & Cost-Effective)</SelectItem>
                    <SelectItem value="gemini-3-flash-preview">Gemini 3 Flash Preview (High Accuracy)</SelectItem>
                    <SelectItem value="local">Local Deterministic Engine</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <Label>Confidence Threshold</Label>
                  <span className="font-semibold">{Math.round(editForm.confidence_threshold * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="0.95"
                  step="0.05"
                  value={editForm.confidence_threshold}
                  onChange={(e) => setEditForm(prev => ({ ...prev, confidence_threshold: parseFloat(e.target.value) }))}
                  className="w-full accent-emerald-600"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Rate Limit (Requests per Minute)</Label>
                <Input
                  type="number"
                  value={editForm.rate_limit}
                  onChange={(e) => setEditForm(prev => ({ ...prev, rate_limit: parseInt(e.target.value) || 60 }))}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Role Permissions</Label>
                <div className="flex gap-2">
                  {['consumer', 'vendor', 'admin'].map(r => {
                    const isChecked = editForm.allowed_roles.includes(r);
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => {
                          setEditForm(prev => ({
                            ...prev,
                            allowed_roles: isChecked
                              ? prev.allowed_roles.filter(x => x !== r)
                              : [...prev.allowed_roles, r]
                          }));
                        }}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium border capitalize ${
                          isChecked ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-stone-50 border-stone-200 text-stone-500'
                        }`}
                      >
                        {r === 'consumer' ? 'Customer' : r === 'vendor' ? 'Seller' : 'Admin'}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditingFeature(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveFeatureEdit} disabled={savingFeature} className="bg-emerald-600 text-white hover:bg-emerald-700">
              {savingFeature ? 'Saving...' : 'Save Configuration'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* GLOBAL CONFIG MODAL */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Settings2 size={18} className="text-stone-700" />
              Global AI Platform Configuration
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Daily AI Budget ($)</Label>
                <Input
                  type="number"
                  step="5"
                  value={configForm.daily_ai_budget}
                  onChange={(e) => setConfigForm(prev => ({ ...prev, daily_ai_budget: parseFloat(e.target.value) || 0 }))}
                  className="h-9 mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Monthly AI Budget ($)</Label>
                <Input
                  type="number"
                  step="50"
                  value={configForm.monthly_ai_budget}
                  onChange={(e) => setConfigForm(prev => ({ ...prev, monthly_ai_budget: parseFloat(e.target.value) || 0 }))}
                  className="h-9 mt-1"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Per-User Daily Query Limit</Label>
              <Input
                type="number"
                value={configForm.per_user_limit}
                onChange={(e) => setConfigForm(prev => ({ ...prev, per_user_limit: parseInt(e.target.value) || 0 }))}
                className="h-9 mt-1"
              />
            </div>

            <div>
              <Label className="text-xs">Mobile Vendor Max Demand Radius (meters)</Label>
              <Input
                type="number"
                step="500"
                value={configForm.mobile_vendor_max_demand_radius}
                onChange={(e) => setConfigForm(prev => ({ ...prev, mobile_vendor_max_demand_radius: parseInt(e.target.value) || 5000 }))}
                className="h-9 mt-1"
              />
            </div>

            <div>
              <Label className="text-xs">Default AI Model</Label>
              <Select
                value={configForm.default_model}
                onValueChange={(val) => setConfigForm(prev => ({ ...prev, default_model: val }))}
              >
                <SelectTrigger className="h-9 mt-1 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini-1.5-flash">Gemini 1.5 Flash</SelectItem>
                  <SelectItem value="gemini-3-flash-preview">Gemini 3 Flash Preview</SelectItem>
                  <SelectItem value="local">Local Grounded Engine</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfigOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveGlobalConfig} disabled={savingConfig} className="bg-stone-900 text-white">
              {savingConfig ? 'Saving...' : 'Apply Global Settings'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

