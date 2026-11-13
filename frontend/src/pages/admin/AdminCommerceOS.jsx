import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  TrendingUp, DollarSign, ShieldAlert, Layers, MapPin, Megaphone,
  Cpu, RefreshCw, CheckCircle2, AlertTriangle, Sparkles, Lock, Users
} from 'lucide-react';

export default function AdminCommerceOS({ defaultTab = 'executive' }) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [loading, setLoading] = useState(false);

  // Domain 1: Executive & KPIs & Roadmap
  const [execDash, setExecDash] = useState(null);
  const [kpiTargets, setKpiTargets] = useState([]);
  const [roadmap, setRoadmap] = useState([]);

  // Domain 2: Revenue Control Center & Subscription Plans
  const [revCenter, setRevCenter] = useState(null);
  const [subPlans, setSubPlans] = useState([]);
  const [consumerFreeGuarantee, setConsumerFreeGuarantee] = useState(null);
  const [adjForm, setAdjForm] = useState({ vendor_id: '', engine: 'SUBSCRIPTIONS', entry_type: 'CREDIT', amount_inr: 100, reason: '' });

  // Domain 3: Inventory Trust
  const [invTrust, setInvTrust] = useState(null);

  // Domain 4: Growth, Localities, Merchant CRM, Referrals, Buyer Leads
  const [localities, setLocalities] = useState([]);
  const [crmLeads, setCrmLeads] = useState(null);
  const [referrals, setReferrals] = useState(null);
  const [leadAnalytics, setLeadAnalytics] = useState(null);
  const [newLocality, setNewLocality] = useState({ name: '', city: 'New Delhi', pincode: '110001', status: 'SEEDING' });
  const [newLead, setNewLead] = useState({ shop_name: '', owner_name: '', phone: '', category: 'Groceries', locality: 'Connaught Place', stage: 'DISCOVERED' });

  // Domain 5: Promotions & Ad Campaigns
  const [campaigns, setCampaigns] = useState([]);

  // Domain 6: Risk, Fraud, Feature Control, AI Maturity, WhatsApp, RBAC, Experiments, Events
  const [fraudQueue, setFraudQueue] = useState([]);
  const [platformFeatures, setPlatformFeatures] = useState([]);
  const [aiMaturity, setAiMaturity] = useState(null);
  const [whatsappStatus, setWhatsappStatus] = useState(null);
  const [rbacRoles, setRbacRoles] = useState(null);
  const [experiments, setExperiments] = useState([]);
  const [domainEvents, setDomainEvents] = useState(null);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [
        execRes,
        kpiRes,
        roadRes,
        revRes,
        plansRes,
        consPremRes,
        trustRes,
        locRes,
        crmRes,
        refRes,
        leadRes,
        campRes,
        fraudRes,
        featRes,
        matRes,
        waRes,
        rbacRes,
        expRes,
        evRes,
      ] = await Promise.allSettled([
        api.get('/admin/executive/dashboard'),
        api.get('/admin/kpi-targets'),
        api.get('/admin/roadmap'),
        api.get('/admin/revenue/control-center'),
        api.get('/admin/subscription-plans'),
        api.get('/admin/consumer-premium-config'),
        api.get('/admin/inventory-trust'),
        api.get('/admin/localities/density'),
        api.get('/admin/merchant-crm'),
        api.get('/admin/referrals'),
        api.get('/admin/leads/analytics'),
        api.get('/admin/campaigns'),
        api.get('/admin/fraud/queue'),
        api.get('/admin/platform-features'),
        api.get('/admin/ai-maturity-registry'),
        api.get('/admin/whatsapp/status'),
        api.get('/admin/rbac/roles'),
        api.get('/admin/experiments'),
        api.get('/admin/events?limit=25'),
      ]);

      if (execRes.status === 'fulfilled') setExecDash(execRes.value.data);
      if (kpiRes.status === 'fulfilled') setKpiTargets(kpiRes.value.data.targets || []);
      if (roadRes.status === 'fulfilled') setRoadmap(roadRes.value.data.phases || []);
      if (revRes.status === 'fulfilled') setRevCenter(revRes.value.data);
      if (plansRes.status === 'fulfilled') setSubPlans(plansRes.value.data.plans || []);
      if (consPremRes.status === 'fulfilled') setConsumerFreeGuarantee(consPremRes.value.data);
      if (trustRes.status === 'fulfilled') setInvTrust(trustRes.value.data);
      if (locRes.status === 'fulfilled') setLocalities(locRes.value.data.localities || []);
      if (crmRes.status === 'fulfilled') setCrmLeads(crmRes.value.data);
      if (refRes.status === 'fulfilled') setReferrals(refRes.value.data);
      if (leadRes.status === 'fulfilled') setLeadAnalytics(leadRes.value.data);
      if (campRes.status === 'fulfilled') setCampaigns(campRes.value.data.campaigns || []);
      if (fraudRes.status === 'fulfilled') setFraudQueue(fraudRes.value.data.flags || []);
      if (featRes.status === 'fulfilled') setPlatformFeatures(featRes.value.data.features || []);
      if (matRes.status === 'fulfilled') setAiMaturity(matRes.value.data);
      if (waRes.status === 'fulfilled') setWhatsappStatus(waRes.value.data);
      if (rbacRes.status === 'fulfilled') setRbacRoles(rbacRes.value.data);
      if (expRes.status === 'fulfilled') setExperiments(expRes.value.data.experiments || []);
      if (evRes.status === 'fulfilled') setDomainEvents(evRes.value.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleToggleFeature = async (feat) => {
    try {
      await api.patch(`/admin/platform-features/${feat.feature_key}`, {
        enabled: !feat.enabled,
        reason: 'Toggled via Super Admin Feature Control',
      });
      toast.success(`Updated feature ${feat.name}`);
      loadAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Cannot modify essential security feature');
    }
  };

  const handleModerateCampaign = async (id, action) => {
    try {
      await api.post(`/admin/campaigns/${id}/moderate`, { action, reason: `Admin ${action}` });
      toast.success(`Campaign ${action} applied`);
      loadAll();
    } catch {
      toast.error('Campaign moderation failed');
    }
  };

  const handleRunFraudScan = async () => {
    try {
      const { data } = await api.post('/admin/fraud/scan');
      toast.success(`Fraud scan complete: ${data.new_flags_created} new flags detected`);
      loadAll();
    } catch {
      toast.error('Fraud scan failed');
    }
  };

  const handleResolveFraud = async (flagId, resolution) => {
    try {
      await api.post(`/admin/fraud/${flagId}/resolve`, { resolution, reason: `Admin ${resolution}` });
      toast.success(`Flag ${resolution}`);
      loadAll();
    } catch {
      toast.error('Failed to resolve flag');
    }
  };

  const handleAddLocality = async (e) => {
    e.preventDefault();
    if (!newLocality.name.trim()) return;
    try {
      await api.post('/admin/localities', newLocality);
      toast.success('Locality saved & density readiness calculated');
      setNewLocality({ name: '', city: 'New Delhi', pincode: '110001', status: 'SEEDING' });
      loadAll();
    } catch {
      toast.error('Failed to save locality');
    }
  };

  const handleAddCrmLead = async (e) => {
    e.preventDefault();
    if (!newLead.shop_name.trim()) return;
    try {
      await api.post('/admin/merchant-crm', newLead);
      toast.success('Merchant acquisition lead added');
      setNewLead({ shop_name: '', owner_name: '', phone: '', category: 'Groceries', locality: 'Connaught Place', stage: 'DISCOVERED' });
      loadAll();
    } catch {
      toast.error('Failed to add merchant lead');
    }
  };

  const handleCreateLedgerAdjustment = async (e) => {
    e.preventDefault();
    if (!adjForm.reason.trim()) return;
    try {
      await api.post('/admin/revenue/ledger-adjustment', {
        ...adjForm,
        amount_inr: parseFloat(adjForm.amount_inr) || 0,
      });
      toast.success('Immutable ledger entry recorded');
      setAdjForm({ vendor_id: '', engine: 'SUBSCRIPTIONS', entry_type: 'CREDIT', amount_inr: 100, reason: '' });
      loadAll();
    } catch {
      toast.error('Failed to record ledger entry');
    }
  };

  const tabs = [
    { id: 'executive', label: '1. Executive & CEO KPIs', icon: TrendingUp },
    { id: 'revenue', label: '2. Revenue & Subscriptions', icon: DollarSign },
    { id: 'inventory', label: '3. Inventory Trust', icon: Layers },
    { id: 'growth', label: '4. Localities & Growth CRM', icon: MapPin },
    { id: 'campaigns', label: '5. Ad Moderation', icon: Megaphone },
    { id: 'governance', label: '6. Fraud, Flags & RBAC', icon: ShieldAlert },
  ];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-xs font-semibold">
            <Sparkles size={12} /> Unified Commerce Operating System
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-stone-900 mt-2">
            Super Admin Commerce OS Control Center
          </h1>
          <p className="text-xs text-stone-500 mt-1">
            North-Star Objective: &ldquo;How much measurable incremental commercial value does HyperLocal generate for merchants?&rdquo;
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadAll} disabled={loading} className="rounded-full text-xs">
          <RefreshCw size={13} className={`mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh Telemetry
        </Button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-stone-200 pb-3">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              data-testid={`commerce-os-tab-${t.id}`}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold transition-all ${
                activeTab === t.id
                  ? 'bg-[#0A6E3B] text-white shadow-sm'
                  : 'bg-white text-stone-600 border border-stone-200 hover:border-stone-300'
              }`}
            >
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: CEO EXECUTIVE DASHBOARD, KPI TARGETS & ROADMAP */}
      {activeTab === 'executive' && (
        <div className="space-y-6">
          {execDash?.kpis && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <MetricBox label="Active Merchants" value={execDash.kpis.active_merchants} sub={`${execDash.kpis.paid_merchants} Paid · ${execDash.kpis.trial_merchants} Trial`} />
              <MetricBox label="Active Consumers" value={execDash.kpis.active_consumers} sub={`${execDash.kpis.mobile_vendors} Mobile Carts`} />
              <MetricBox label="Fresh Inventory %" value={`${execDash.kpis.fresh_inventory_pct}%`} sub={`${execDash.kpis.total_products} total items`} />
              <MetricBox label="Marketplace GMV" value={`₹${execDash.kpis.gmv_inr?.toLocaleString('en-IN')}`} sub={`${execDash.kpis.completed_orders} completed orders`} />
              <MetricBox label="Attributable Revenue" value={`₹${execDash.kpis.attributable_merchant_revenue_inr?.toLocaleString('en-IN')}`} sub={`Avg ROI: ${execDash.kpis.average_merchant_roi_multiple ?? '—'}x`} />
            </div>
          )}

          {/* KPI Targets & Health System (Point 37) */}
          <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-stone-900">KPI Target & Health System (Point 37)</h2>
              <Badge variant="outline" className="text-[11px]">Live Threshold Evaluation</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {kpiTargets.map((k) => (
                <div key={k.kpi_key} className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-stone-800">{k.label}</div>
                    <div className="text-lg font-bold text-stone-900 mt-0.5">
                      {k.actual_value !== null && k.actual_value !== undefined ? `${k.actual_value} ${k.unit || ''}` : 'Insufficient Data'}
                    </div>
                    <div className="text-[11px] text-stone-500">Target: {k.target_value} {k.unit}</div>
                  </div>
                  <Badge
                    className={
                      k.status === 'ON_TRACK'
                        ? 'bg-emerald-100 text-emerald-900 border-0'
                        : k.status === 'AT_RISK'
                        ? 'bg-amber-100 text-amber-900 border-0'
                        : k.status === 'INSUFFICIENT_DATA'
                        ? 'bg-stone-200 text-stone-700 border-0'
                        : 'bg-rose-100 text-rose-900 border-0'
                    }
                  >
                    {k.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          {/* 90-Day Execution Roadmap (Point 38) */}
          <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-3">
            <h2 className="font-display text-base font-semibold text-stone-900">90-Day Execution Roadmap Tracker (Point 38)</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {roadmap.map((ph) => (
                <div key={ph.phase_id} className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-stone-900">{ph.title}</span>
                    <Badge className="bg-emerald-100 text-emerald-900 border-0 text-[10px]">{ph.status}</Badge>
                  </div>
                  <div className="space-y-1 text-xs">
                    {(ph.milestones || []).map((m, i) => (
                      <div key={i} className="flex items-center justify-between text-stone-600">
                        <span>✓ {m.name}</span>
                        <span className="text-[10px] font-mono text-emerald-800">{m.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MULTI-ENGINE REVENUE CONTROL CENTER & SUBSCRIPTION PLANS */}
      {activeTab === 'revenue' && (
        <div className="space-y-6">
          {revCenter && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricBox label="MRR (Subscriptions)" value={`₹${revCenter.mrr_inr?.toLocaleString('en-IN')}`} sub={`ARR: ₹${revCenter.arr_inr?.toLocaleString('en-IN')}`} />
              <MetricBox label="Active Paid Vendors" value={revCenter.active_paid_vendors} sub={`ARPU: ₹${revCenter.arpu_inr}`} />
              <MetricBox label="Sponsored Ad Spend" value={`₹${revCenter.engines?.PROMOTIONS_ADS?.recognized_revenue_inr || 0}`} sub={`${revCenter.engines?.PROMOTIONS_ADS?.active_campaigns || 0} active campaigns`} />
              <MetricBox label="Platform Net Revenue" value={`₹${revCenter.total_platform_revenue_inr?.toLocaleString('en-IN')}`} sub={`GMV: ₹${revCenter.engines?.TRANSACTION_FEES?.gross_gmv_inr || 0}`} />
            </div>
          )}

          {/* Subscription Plans Registry (Points 8 & 9) */}
          <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-semibold text-stone-900">Database-Driven Retailer & Mobile Cart Plans (Points 8 & 9)</h2>
                <p className="text-xs text-stone-500">Preserves 30-day Free Trial, ₹199/month Pro, ₹1,499/year Annual, plus Growth, Business & Mobile Cart Pro tiers.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {subPlans.map((pl) => (
                <div key={pl.plan_code} className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-stone-900">{pl.name}</span>
                    <Badge variant="outline" className="text-[10px]">{pl.plan_code}</Badge>
                  </div>
                  <div className="text-base font-bold text-[#0A6E3B]">
                    ₹{pl.monthly_price_inr}/mo <span className="text-[11px] font-normal text-stone-500">or ₹{pl.annual_price_inr}/yr</span>
                  </div>
                  <div className="text-[11px] text-stone-600">
                    Trial: {pl.trial_days}d · Leads: {pl.lead_limit_monthly ?? 'Unlimited'} · Branches: {pl.branch_limit}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Immutable Financial Ledger Adjustment & Consumer Free Core Guarantee */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <form onSubmit={handleCreateLedgerAdjustment} className="rounded-2xl border border-stone-200 bg-white p-5 space-y-3 text-xs">
              <h3 className="font-display text-sm font-semibold text-stone-900">Record Audited Financial Ledger Adjustment (Point 22)</h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Revenue Engine</Label>
                  <select
                    value={adjForm.engine}
                    onChange={(e) => setAdjForm({ ...adjForm, engine: e.target.value })}
                    className="w-full h-8 rounded border border-stone-200 px-2 text-xs mt-1"
                  >
                    <option value="SUBSCRIPTIONS">Subscriptions</option>
                    <option value="PROMOTIONS_ADS">Promotions & Ads</option>
                    <option value="LEAD_MONETIZATION">Lead Monetization</option>
                    <option value="TRANSACTION_FEES">Transaction Fees</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Entry Type</Label>
                  <select
                    value={adjForm.entry_type}
                    onChange={(e) => setAdjForm({ ...adjForm, entry_type: e.target.value })}
                    className="w-full h-8 rounded border border-stone-200 px-2 text-xs mt-1"
                  >
                    <option value="CREDIT">Promo Credit</option>
                    <option value="REFUND">Refund</option>
                    <option value="WAIVER">Fee Waiver</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Amount (₹)</Label>
                  <Input
                    type="number"
                    value={adjForm.amount_inr}
                    onChange={(e) => setAdjForm({ ...adjForm, amount_inr: e.target.value })}
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Audit Reason (Mandatory)</Label>
                  <Input
                    required
                    value={adjForm.reason}
                    onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })}
                    placeholder="e.g. Onboarding promotional credit"
                    className="h-8 text-xs mt-1"
                  />
                </div>
              </div>
              <Button type="submit" size="sm" className="rounded-full bg-[#0A6E3B] text-white text-xs">
                Commit Immutable Ledger Entry
              </Button>
            </form>

            <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold text-stone-900">Consumer Free Core Guarantee (Point 23)</h3>
                <Badge className="bg-emerald-100 text-emerald-900 border-0">Enforced</Badge>
              </div>
              <p className="text-stone-600">
                Core consumer features remain permanently free to maximize buyer liquidity and merchant ROI:
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {(consumerFreeGuarantee?.permanently_free_features || [
                  'product_search', 'price_comparison', 'distance_discovery', 'seller_profiles',
                  'shopping_lists', 'cheapest_basket', 'i_need_requests', 'price_alerts', 'chat_and_orders'
                ]).map((f) => (
                  <span key={f} className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-900 border border-emerald-200 text-[11px]">
                    ✓ {f.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: INVENTORY TRUST & CONFIDENCE SYSTEM */}
      {activeTab === 'inventory' && invTrust && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricBox label="🟢 Fresh Inventory %" value={`${invTrust.analytics?.fresh_inventory_pct || 0}%`} sub={`${invTrust.analytics?.confirmed_recently_count || 0} items confirmed`} />
            <MetricBox label="🟡 Probably Available %" value={`${invTrust.analytics?.probably_available_pct || 0}%`} sub={`${invTrust.analytics?.probably_available_count || 0} items`} />
            <MetricBox label="🟠 Possibly Stale %" value={`${invTrust.analytics?.stale_inventory_pct || 0}%`} sub={`${invTrust.analytics?.possibly_stale_count || 0} items`} />
            <MetricBox label="Avg Confidence Score" value={`${invTrust.analytics?.average_confidence_score || 0}/100`} sub={`Avg age: ${invTrust.analytics?.average_inventory_age_hours || 0}h`} />
          </div>
        </div>
      )}

      {/* TAB 4: LOCALITIES, DENSITY READINESS, MERCHANT CRM & REFERRALS */}
      {activeTab === 'growth' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Locality Density Readiness (Points 25 & 26) */}
            <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-3">
              <h3 className="font-display text-sm font-semibold text-stone-900">Locality Density Readiness Engine (Points 25 & 26)</h3>
              <form onSubmit={handleAddLocality} className="grid grid-cols-4 gap-2 text-xs">
                <Input placeholder="Locality name" value={newLocality.name} onChange={(e) => setNewLocality({ ...newLocality, name: e.target.value })} className="h-8 text-xs col-span-2" />
                <Input placeholder="Pincode" value={newLocality.pincode} onChange={(e) => setNewLocality({ ...newLocality, pincode: e.target.value })} className="h-8 text-xs" />
                <Button type="submit" size="sm" className="h-8 bg-[#0A6E3B] text-white text-xs">+ Add</Button>
              </form>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {localities.map((loc) => (
                  <div key={loc.id} className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-stone-900">{loc.name} ({loc.pincode})</div>
                      <div className="text-[11px] text-stone-500">
                        Merchants: {loc.active_merchants} · Products: {loc.fresh_products} · Coverage: {loc.essential_category_coverage_pct}%
                      </div>
                    </div>
                    <Badge className="bg-emerald-100 text-emerald-900 border-0 text-[10px]">
                      Score: {loc.density_readiness_score}/100 · {loc.readiness_classification}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Merchant Acquisition CRM (Point 27) */}
            <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-3">
              <h3 className="font-display text-sm font-semibold text-stone-900">Merchant Acquisition CRM Pipeline (Point 27)</h3>
              <form onSubmit={handleAddCrmLead} className="grid grid-cols-4 gap-2 text-xs">
                <Input placeholder="Shop name" value={newLead.shop_name} onChange={(e) => setNewLead({ ...newLead, shop_name: e.target.value })} className="h-8 text-xs col-span-2" />
                <Input placeholder="Locality" value={newLead.locality} onChange={(e) => setNewLead({ ...newLead, locality: e.target.value })} className="h-8 text-xs" />
                <Button type="submit" size="sm" className="h-8 bg-[#0A6E3B] text-white text-xs">+ Lead</Button>
              </form>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {crmLeads?.stage_counts && Object.entries(crmLeads.stage_counts).map(([st, cnt]) => (
                  <span key={st} className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-700">
                    {st}: <strong>{cnt}</strong>
                  </span>
                ))}
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto text-xs">
                {(crmLeads?.leads || []).slice(0, 8).map((l) => (
                  <div key={l.id} className="p-2 rounded-lg bg-stone-50 border border-stone-200 flex items-center justify-between">
                    <span><strong>{l.shop_name}</strong> · {l.locality}</span>
                    <Badge variant="outline" className="text-[10px]">{l.stage}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Buyer Leads & Referral Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-stone-200 bg-white p-5 text-xs space-y-2">
              <h3 className="font-display text-sm font-semibold text-stone-900">Structured Buyer Lead Marketplace (Points 6 & 7)</h3>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 bg-stone-50 rounded-xl">
                  <div className="text-lg font-bold">{leadAnalytics?.total_requests ?? 0}</div>
                  <div className="text-[10px] text-stone-500">Total Requests</div>
                </div>
                <div className="p-2.5 bg-emerald-50 rounded-xl">
                  <div className="text-lg font-bold text-emerald-900">{leadAnalytics?.response_rate_pct ?? 0}%</div>
                  <div className="text-[10px] text-emerald-700">Response Rate</div>
                </div>
                <div className="p-2.5 bg-amber-50 rounded-xl">
                  <div className="text-lg font-bold text-amber-900">{leadAnalytics?.conversion_rate_pct ?? 0}%</div>
                  <div className="text-[10px] text-amber-800">Conversion Rate</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-5 text-xs space-y-2">
              <h3 className="font-display text-sm font-semibold text-stone-900">Anti-Abuse Referral Engine (Point 24)</h3>
              <div className="text-stone-600">
                Total Redemptions: <strong>{referrals?.total_redemptions ?? 0}</strong> (Self-referral & duplicate phone/device blocked)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: AD CAMPAIGNS & MODERATION */}
      {activeTab === 'campaigns' && (
        <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-3">
          <h2 className="font-display text-base font-semibold text-stone-900">Self-Service Sponsored Campaigns & Moderation (Points 20 & 21)</h2>
          <div className="space-y-2">
            {campaigns.map((c) => (
              <div key={c.id} className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <div className="font-semibold text-stone-900">
                    {c.campaign_name} <Badge variant="outline" className="ml-1 text-[10px]">{c.campaign_type}</Badge>
                  </div>
                  <div className="text-[11px] text-stone-500 mt-0.5">
                    Shop: {c.shop_name} · Budget: ₹{c.spent_inr || 0}/₹{c.total_budget_inr} · {c.impressions || 0} views · {c.clicks || 0} clicks
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge className={c.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-900 border-0' : 'bg-stone-200 text-stone-700 border-0'}>
                    {c.status}
                  </Badge>
                  <Button size="sm" variant="outline" onClick={() => handleModerateCampaign(c.id, 'APPROVE')} className="h-7 text-[11px]">Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => handleModerateCampaign(c.id, 'PAUSE')} className="h-7 text-[11px]">Pause</Button>
                  <Button size="sm" variant="outline" onClick={() => handleModerateCampaign(c.id, 'CREDIT')} className="h-7 text-[11px]">+₹100 Credit</Button>
                </div>
              </div>
            ))}
            {campaigns.length === 0 && (
              <div className="text-center py-8 text-xs text-stone-400">No sponsored campaigns created yet.</div>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: RISK, FRAUD QUEUE, PLATFORM FEATURE CONTROL, AI MATURITY & RBAC */}
      {activeTab === 'governance' && (
        <div className="space-y-6">
          {/* Fraud & Abuse Detection Queue (Point 30) */}
          <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-semibold text-stone-900">Multi-Signal Fraud & Abuse Intelligence Queue (Point 30)</h2>
                <p className="text-xs text-stone-500">Detects abnormal QR bursts, self-dealing orders, price anomalies, and referral loops.</p>
              </div>
              <Button size="sm" onClick={handleRunFraudScan} className="rounded-full bg-[#0A6E3B] text-white text-xs">
                Run Automated Fraud Scan
              </Button>
            </div>
            <div className="space-y-2">
              {fraudQueue.map((fl) => (
                <div key={fl.id} className="p-3 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-semibold text-stone-900">{fl.signal_type} · Severity: {fl.severity}</div>
                    <div className="text-[11px] text-stone-600">{fl.evidence}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px]">{fl.status}</Badge>
                    {fl.status === 'OPEN' && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => handleResolveFraud(fl.id, 'DISMISSED')} className="h-7 text-[11px]">Dismiss</Button>
                        <Button size="sm" variant="outline" onClick={() => handleResolveFraud(fl.id, 'CONFIRMED_FRAUD')} className="h-7 text-[11px] text-rose-700">Confirm Fraud</Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {fraudQueue.length === 0 && (
                <div className="text-xs text-stone-400 py-4 text-center">No active fraud flags in queue.</div>
              )}
            </div>
          </div>

          {/* Platform Feature Classifications (Point 1) */}
          <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-3">
            <h2 className="font-display text-base font-semibold text-stone-900">Platform Feature Control (`CORE`, `GROWTH`, `MONETIZATION`, `EXPERIMENTAL`) — Point 1</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {platformFeatures.map((ft) => (
                <div key={ft.feature_key} className="p-3 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between text-xs">
                  <div className="pr-2">
                    <div className="font-semibold text-stone-900 flex items-center gap-1.5">
                      <span>{ft.name}</span>
                      <Badge variant="outline" className="text-[9px]">{ft.classification}</Badge>
                      {ft.is_essential_security && <Lock size={11} className="text-amber-700" title="Essential security control" />}
                    </div>
                    <div className="text-[11px] text-stone-500 mt-0.5">{ft.description}</div>
                  </div>
                  <Switch
                    checked={!!ft.enabled}
                    disabled={!!ft.is_essential_security}
                    onCheckedChange={() => handleToggleFeature(ft)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* AI Maturity Registry (Point 17), WhatsApp Adapter (Point 18) & 9-Role RBAC */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-2 text-xs">
              <h3 className="font-display text-sm font-semibold text-stone-900">AI Maturity Registry (Point 17)</h3>
              <p className="text-[11px] text-stone-500">{aiMaturity?.honesty_policy}</p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pt-1">
                {(aiMaturity?.capabilities || []).map((c) => (
                  <div key={c.feature_key} className="p-2 rounded bg-stone-50 border border-stone-200 flex items-center justify-between">
                    <span className="font-medium text-stone-800">{c.name}</span>
                    <Badge variant="outline" className="text-[9px]">{c.maturity_label}</Badge>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-2 text-xs">
              <h3 className="font-display text-sm font-semibold text-stone-900">WhatsApp & Domain Events (Points 18 & 33)</h3>
              <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200">
                <div className="font-semibold">WhatsApp Provider: {whatsappStatus?.provider || 'META_CLOUD_API'}</div>
                <div className="text-[11px] text-stone-500 mt-0.5">
                  Templates: {(whatsappStatus?.supported_templates || []).length} configured · Dispatched: {whatsappStatus?.total_dispatched || 0}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200">
                <div className="font-semibold">Canonical Event Bus: {domainEvents?.total || 0} events</div>
                <div className="text-[11px] text-stone-500 mt-0.5">
                  A/B Experiments Active: {experiments.length}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-2 text-xs">
              <h3 className="font-display text-sm font-semibold text-stone-900">Granular 9-Role Admin RBAC</h3>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {rbacRoles?.roles && Object.entries(rbacRoles.roles).map(([roleKey, info]) => (
                  <div key={roleKey} className="p-2 rounded bg-stone-50 border border-stone-200">
                    <div className="font-semibold text-stone-900">{roleKey}</div>
                    <div className="text-[10px] text-stone-500">{info.description}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricBox({ label, value, sub }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">{label}</div>
      <div className="font-display text-2xl font-bold text-stone-900 mt-1">{value}</div>
      {sub && <div className="text-[11px] text-stone-500 mt-0.5">{sub}</div>}
    </div>
  );
}

