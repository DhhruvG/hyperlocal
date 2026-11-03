import React, { useEffect, useState } from 'react';
import { api, formatApiErrorDetail } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  TrendingUp, Users, ShoppingBag, Eye, Store, ShieldAlert, Settings,
  CheckCircle2, AlertTriangle, ArrowRight, Pencil, Trash2, Search,
  Navigation, MapPin, QrCode, Scale
} from 'lucide-react';

export default function AdminAttribution() {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'sessions' | 'purchases' | 'anomalies' | 'settings'
  const [platformStats, setPlatformStats] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [config, setConfig] = useState(null);

  // Inspector modal
  const [inspectSessionId, setInspectSessionId] = useState(null);
  const [journeyData, setJourneyData] = useState(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  // Edit Purchase modal
  const [editingPurchase, setEditingPurchase] = useState(null);

  // Dispute Resolution Modal
  const [disputeModal, setDisputeModal] = useState(false);
  const [disputeTargetSession, setDisputeTargetSession] = useState(null);
  const [disputeForm, setDisputeForm] = useState({
    action: 'force_verify',
    justification: '',
    adjusted_amount: '',
  });

  // Filter state
  const [sessionFilterStatus, setSessionFilterStatus] = useState('all');

  useEffect(() => {
    loadOverview();
  }, []);

  const loadOverview = async () => {
    try {
      const [pRes, sRes, puRes, aRes, cRes] = await Promise.all([
        api.get('/admin/business-impact'),
        api.get('/admin/attribution/sessions'),
        api.get('/admin/attribution/purchases'),
        api.get('/admin/attribution/anomalies'),
        api.get('/admin/attribution/config'),
      ]);
      setPlatformStats(pRes.data);
      setSessions(sRes.data);
      setPurchases(puRes.data);
      setAnomalies(aRes.data);
      setConfig(cRes.data);
    } catch {
      toast.error('Failed to load attribution data');
    }
  };

  const handleInspect = async (sessionId) => {
    setInspectSessionId(sessionId);
    setInspectLoading(true);
    try {
      const res = await api.get(`/admin/attribution/sessions/${sessionId}`);
      setJourneyData(res.data);
    } catch {
      toast.error('Failed to load customer journey chain');
    } finally {
      setInspectLoading(false);
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    try {
      const res = await api.patch('/admin/attribution/config', config);
      setConfig(res.data);
      toast.success('Attribution configuration updated');
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const handleSavePurchase = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/admin/attribution/purchases/${editingPurchase.id}`, {
        amount: parseFloat(editingPurchase.amount),
        trust_level: editingPurchase.trust_level,
        confidence_level: editingPurchase.confidence_level,
      });
      toast.success('Purchase updated');
      setEditingPurchase(null);
      loadOverview();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const handleDeletePurchase = async (id) => {
    if (!window.confirm('Delete this purchase record?')) return;
    try {
      await api.delete(`/admin/attribution/purchases/${id}`);
      toast.success('Purchase removed');
      loadOverview();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const handleOpenDispute = (session) => {
    setDisputeTargetSession(session);
    setDisputeForm({
      action: 'force_verify',
      justification: '',
      adjusted_amount: session.amount ? String(session.amount) : '',
    });
    setDisputeModal(true);
  };

  const handleResolveDispute = async (e) => {
    e.preventDefault();
    if (!disputeForm.justification || disputeForm.justification.trim().length < 5) {
      toast.error('Audit justification must be at least 5 characters');
      return;
    }
    try {
      await api.post(`/admin/attribution/sessions/${disputeTargetSession.session_id}/resolve-dispute`, {
        action: disputeForm.action,
        justification: disputeForm.justification.trim(),
        adjusted_amount: disputeForm.adjusted_amount ? parseFloat(disputeForm.adjusted_amount) : null,
      });
      toast.success(`Dispute resolved for session ${disputeTargetSession.session_id}`);
      setDisputeModal(false);
      loadOverview();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-stone-900">
            Business Impact & Attribution Engine
          </h1>
          <p className="text-stone-600 text-xs md:text-sm mt-1">
            Platform offline impact analysis, multi-signal customer journeys, and anomaly verification.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1.5 p-1 bg-stone-200/70 rounded-xl text-xs">
          {[
            { id: 'overview', label: 'Platform Impact' },
            { id: 'sessions', label: 'Attribution Sessions' },
            { id: 'purchases', label: 'Purchases' },
            { id: 'anomalies', label: `Anomalies (${anomalies.length})` },
            { id: 'settings', label: 'Engine Config' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === t.id ? 'bg-white text-stone-900 shadow-xs font-semibold' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: PLATFORM IMPACT */}
      {activeTab === 'overview' && platformStats && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-stone-200 bg-white p-5">
              <div className="eyebrow text-stone-500">Marketplace Discovery</div>
              <div className="font-display text-3xl font-bold text-stone-900 mt-2">
                {platformStats.total_searches}
              </div>
              <div className="text-xs text-stone-500 mt-1">Total product searches</div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-5">
              <div className="eyebrow text-stone-500">Seller Engagement</div>
              <div className="font-display text-3xl font-bold text-stone-900 mt-2">
                {platformStats.total_profile_views}
              </div>
              <div className="text-xs text-stone-500 mt-1">Profile interactions</div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-5">
              <div className="eyebrow text-stone-500">Verified Physical Visits</div>
              <div className="font-display text-3xl font-bold text-emerald-800 mt-2">
                {platformStats.verified_visits}
              </div>
              <div className="text-xs text-stone-500 mt-1">Dual/customer verified</div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-5">
              <div className="eyebrow text-stone-500">Attributed Offline Revenue</div>
              <div className="font-display text-3xl font-bold text-[#0A6E3B] mt-2">
                ₹{platformStats.total_attributed_revenue?.toLocaleString()}
              </div>
              <div className="text-xs text-stone-500 mt-1">{platformStats.attributed_purchases} purchases confirmed</div>
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-6">
            <h2 className="font-display text-lg font-semibold text-stone-900 mb-2">Platform Attribution Methodology</h2>
            <p className="text-xs text-stone-600 leading-relaxed">
              HyperLocal multi-signal attribution calculates physical store footfall and purchases by evaluating
              customer intent (search, profile view, directions, contact), physical signals (proximity geofence and dwell duration),
              and post-visit customer/vendor confirmations. We strictly differentiate verified offline transactions
              from organic baseline traffic.
            </p>
            <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
              <span>Total Vendor Reported Offline Volume: ₹{platformStats.total_vendor_reported_sales?.toLocaleString()}</span>
              <span>Active Sellers: {platformStats.active_sellers} / {platformStats.total_sellers}</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ATTRIBUTION SESSIONS */}
      {activeTab === 'sessions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-500">Status filter:</span>
              <Select value={sessionFilterStatus} onValueChange={setSessionFilterStatus}>
                <SelectTrigger className="w-36 h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="likely_visit">Likely Visit</SelectItem>
                  <SelectItem value="verified_visit">Verified Visit</SelectItem>
                  <SelectItem value="purchase_attributed">Purchase Attributed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-stone-50">
                  <TableHead>Session ID</TableHead>
                  <TableHead>Seller</TableHead>
                  <TableHead>Intent Level</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Activity</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions
                  .filter((s) => sessionFilterStatus === 'all' || s.attribution_status === sessionFilterStatus)
                  .map((s) => (
                    <TableRow key={s.id || s.session_id}>
                      <TableCell className="font-mono text-xs font-semibold text-stone-900">{s.session_id}</TableCell>
                      <TableCell className="text-sm font-medium">{s.seller_name || s.seller_id}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {s.intent_level}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] border-0 ${
                          s.attribution_status === 'purchase_attributed' ? 'bg-emerald-600 text-white' :
                          s.attribution_status === 'verified_visit' ? 'bg-emerald-100 text-emerald-900' :
                          s.attribution_status === 'likely_visit' ? 'bg-amber-100 text-amber-900' : 'bg-stone-100 text-stone-700'
                        }`}>
                          {(s.attribution_status || 'active').replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-stone-500">
                        {s.last_activity_at ? new Date(s.last_activity_at).toLocaleString() : '—'}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenDispute(s)}
                          className="text-xs text-amber-700 hover:text-amber-800 hover:bg-amber-50"
                          title="Resolve dispute or override attribution status"
                        >
                          <Scale size={12} className="mr-1" /> Dispute
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleInspect(s.session_id)}
                          className="text-xs text-[#0A6E3B] hover:text-[#075030]"
                        >
                          Inspect Chain <ArrowRight size={12} className="ml-1" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                {sessions.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-stone-400 text-xs">No sessions recorded.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* TAB 3: PURCHASES MANAGEMENT */}
      {activeTab === 'purchases' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-stone-200 bg-white overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-stone-50">
                  <TableHead>Session</TableHead>
                  <TableHead>Shop</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Trust Level</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.attribution_session_id}</TableCell>
                    <TableCell className="text-sm font-medium text-stone-900">{p.shop_name}</TableCell>
                    <TableCell className="font-bold text-[#0A6E3B]">₹{p.amount?.toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-stone-600">{p.purchase_source?.replace('_', ' ')}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{p.trust_level}</Badge></TableCell>
                    <TableCell><Badge className="bg-emerald-50 text-emerald-800 border-0 text-[10px]">{p.confidence_level}</Badge></TableCell>
                    <TableCell className="text-xs text-stone-500">{p.purchased_at ? new Date(p.purchased_at).toLocaleDateString() : '—'}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditingPurchase({ ...p })}><Pencil size={13} /></Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDeletePurchase(p.id)} className="text-red-600"><Trash2 size={13} /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {purchases.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-stone-400 text-xs">No purchases attributed yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* TAB 4: ANOMALIES REVIEW */}
      {activeTab === 'anomalies' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-stone-200 bg-white p-6">
            <h2 className="font-display text-lg font-semibold text-stone-900 flex items-center gap-2">
              <ShieldAlert size={18} className="text-amber-600" /> Potential Anomalies & Anti-Gaming Monitor
            </h2>
            <p className="text-xs text-stone-500 mt-1">
              Events flagged for unusual velocity, sudden volume spikes, or rapid repetitive confirmations.
            </p>

            <div className="mt-4 divide-y divide-stone-100">
              {anomalies.map((a, idx) => (
                <div key={a.id || idx} className="py-3 flex items-start justify-between gap-4 text-xs">
                  <div>
                    <div className="font-semibold text-stone-900 flex items-center gap-1.5">
                      <AlertTriangle size={13} className="text-amber-600" />
                      {a.shop_name || 'Seller'} · ₹{a.amount?.toLocaleString()}
                    </div>
                    <div className="text-stone-600 mt-0.5">{a.reason}</div>
                    <div className="text-[10px] text-stone-400 mt-1">{a.created_at ? new Date(a.created_at).toLocaleString() : '—'}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px] uppercase text-amber-800 border-amber-300">
                    {a.status}
                  </Badge>
                </div>
              ))}
              {anomalies.length === 0 && (
                <div className="py-8 text-center text-xs text-stone-400">
                  No anomalies detected. All recorded vendor daily sales and customer confirmations are within normal statistical bounds.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: ENGINE CONFIGURATION */}
      {activeTab === 'settings' && config && (
        <form onSubmit={handleSaveConfig} className="max-w-xl rounded-2xl border border-stone-200 bg-white p-6 space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-stone-900 flex items-center gap-2">
              <Settings size={18} className="text-stone-700" /> Attribution Engine Configuration
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">Parameters governing multi-signal windows, geofences, and incentives.</p>
          </div>

          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs font-semibold">Attribution Window (Days)</Label>
              <Input
                type="number"
                min="1"
                max="180"
                value={config.attribution_window_days}
                onChange={(e) => setConfig({ ...config, attribution_window_days: parseInt(e.target.value) })}
                className="mt-1"
                required
              />
              <span className="text-[11px] text-stone-500">Period in which returning customer visits are attributed to the initial discovery.</span>
            </div>

            <div>
              <Label className="text-xs font-semibold">Shop Geofence Radius (Meters)</Label>
              <Input
                type="number"
                min="20"
                max="500"
                value={config.geofence_radius_meters}
                onChange={(e) => setConfig({ ...config, geofence_radius_meters: parseInt(e.target.value) })}
                className="mt-1"
                required
              />
              <span className="text-[11px] text-stone-500">Proximity threshold for physical visit signals based on browser/mobile location.</span>
            </div>

            <div>
              <Label className="text-xs font-semibold">Minimum Dwell Time (Seconds)</Label>
              <Input
                type="number"
                min="10"
                max="600"
                value={config.min_dwell_seconds}
                onChange={(e) => setConfig({ ...config, min_dwell_seconds: parseInt(e.target.value) })}
                className="mt-1"
                required
              />
              <span className="text-[11px] text-stone-500">Required presence near shop before qualifying as a Likely Visit.</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Points for Visit Confirmation</Label>
                <Input
                  type="number"
                  min="0"
                  value={config.points_per_visit_confirmation}
                  onChange={(e) => setConfig({ ...config, points_per_visit_confirmation: parseInt(e.target.value) })}
                  className="mt-1"
                  required
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Points for Purchase Confirmation</Label>
                <Input
                  type="number"
                  min="0"
                  value={config.points_per_purchase_confirmation}
                  onChange={(e) => setConfig({ ...config, points_per_purchase_confirmation: parseInt(e.target.value) })}
                  className="mt-1"
                  required
                />
              </div>
            </div>
          </div>

          <Button type="submit" className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white text-xs px-6 mt-4">
            Save Engine Configuration
          </Button>
        </form>
      )}

      {/* INSPECT JOURNEY MODAL */}
      <Dialog open={!!inspectSessionId} onOpenChange={(v) => !v && setInspectSessionId(null)}>
        <DialogContent className="bg-white max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              Attribution Journey: {inspectSessionId}
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Audit trail of every digital intent signal, physical location event, and confirmation for this journey.
            </DialogDescription>
          </DialogHeader>

          {inspectLoading ? (
            <div className="p-8 text-center text-xs text-stone-400">Loading audit trail…</div>
          ) : journeyData ? (
            <div className="space-y-4 py-2 text-xs">
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 flex justify-between items-center">
                <div>
                  <div className="font-semibold text-stone-900">{journeyData.seller.name}</div>
                  <div className="text-stone-500">Customer: {journeyData.customer.name}</div>
                </div>
                <Badge className="bg-emerald-100 text-emerald-900 border-0">
                  {journeyData.session.attribution_status}
                </Badge>
              </div>

              {/* Event Chain */}
              <div>
                <div className="eyebrow text-stone-500 mb-2">Step-by-step Signal Trail</div>
                <div className="border-l-2 border-emerald-500 ml-3 pl-4 space-y-3">
                  {journeyData.events.map((ev, i) => (
                    <div key={ev.id || i} className="relative">
                      <span className="absolute -left-[23px] top-1 w-2.5 h-2.5 rounded-full bg-emerald-600 ring-2 ring-white" />
                      <div className="font-semibold text-stone-800">{ev.event_type.replace(/_/g, ' ').toUpperCase()}</div>
                      <div className="text-[10px] text-stone-400">{new Date(ev.timestamp).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Verified Visits */}
              {journeyData.visits.length > 0 && (
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 text-emerald-950">
                  <div className="font-semibold flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-emerald-600" /> Physical Visit Confirmation
                  </div>
                  <div className="text-[11px] mt-1">Source: {journeyData.visits[0].confirmation_source} ({journeyData.visits[0].confidence_level})</div>
                </div>
              )}

              {/* Purchases */}
              {journeyData.purchases.length > 0 && (
                <div className="p-3 bg-emerald-100/60 rounded-xl border border-emerald-200 text-[#0A6E3B]">
                  <div className="font-bold text-sm">₹{journeyData.purchases[0].amount} Confirmed Purchase</div>
                  <div className="text-[11px] mt-0.5">Trust Level: {journeyData.purchases[0].trust_level}</div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* EDIT PURCHASE MODAL */}
      <Dialog open={!!editingPurchase} onOpenChange={(v) => !v && setEditingPurchase(null)}>
        <DialogContent className="bg-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">Edit Attributed Purchase</DialogTitle>
          </DialogHeader>
          {editingPurchase && (
            <form onSubmit={handleSavePurchase} className="space-y-3 text-xs">
              <div>
                <Label className="text-xs">Amount (₹)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editingPurchase.amount}
                  onChange={(e) => setEditingPurchase({ ...editingPurchase, amount: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label className="text-xs">Trust Level</Label>
                <Select
                  value={editingPurchase.trust_level}
                  onValueChange={(v) => setEditingPurchase({ ...editingPurchase, trust_level: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Vendor Reported">Vendor Reported</SelectItem>
                    <SelectItem value="Customer Confirmed">Customer Confirmed</SelectItem>
                    <SelectItem value="System Attributed">System Attributed</SelectItem>
                    <SelectItem value="Verified Transaction">Verified Transaction</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Confidence Level</Label>
                <Select
                  value={editingPurchase.confidence_level}
                  onValueChange={(v) => setEditingPurchase({ ...editingPurchase, confidence_level: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">LOW</SelectItem>
                    <SelectItem value="MEDIUM">MEDIUM</SelectItem>
                    <SelectItem value="HIGH">HIGH</SelectItem>
                    <SelectItem value="VERIFIED">VERIFIED</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter className="pt-2">
                <Button type="submit" className="w-full rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white">
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* DISPUTE RESOLUTION DIALOG */}
      <Dialog open={disputeModal} onOpenChange={setDisputeModal}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg flex items-center gap-2">
              <Scale size={18} className="text-amber-700" />
              Resolve Attribution Dispute
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Admin decision will be recorded in the immutable audit log with full justification.
            </DialogDescription>
          </DialogHeader>
          {disputeTargetSession && (
            <form onSubmit={handleResolveDispute} className="space-y-3.5 text-xs py-1">
              <div className="bg-stone-50 p-2.5 rounded-lg border border-stone-200">
                <div className="font-mono font-medium text-stone-800">{disputeTargetSession.session_id}</div>
                <div className="text-stone-500 text-[11px] mt-0.5">
                  Current Status: <span className="font-semibold uppercase text-stone-700">{disputeTargetSession.attribution_status}</span>
                </div>
              </div>

              <div>
                <Label className="text-xs">Resolution Action</Label>
                <Select
                  value={disputeForm.action}
                  onValueChange={(v) => setDisputeForm({ ...disputeForm, action: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="force_verify">Force Verify Visit</SelectItem>
                    <SelectItem value="reject_attribution">Reject / Cancel Attribution</SelectItem>
                    <SelectItem value="adjust_amount">Adjust Purchase Amount</SelectItem>
                    <SelectItem value="reinstate">Reinstate Session</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {disputeForm.action === 'adjust_amount' && (
                <div>
                  <Label className="text-xs">Adjusted Amount (₹)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 450"
                    value={disputeForm.adjusted_amount}
                    onChange={(e) => setDisputeForm({ ...disputeForm, adjusted_amount: e.target.value })}
                    required
                  />
                </div>
              )}

              <div>
                <Label className="text-xs">Administrative Justification (Required)</Label>
                <Input
                  placeholder="e.g. Vendor provided physical counter slip proof #108"
                  value={disputeForm.justification}
                  onChange={(e) => setDisputeForm({ ...disputeForm, justification: e.target.value })}
                  required
                  minLength={5}
                />
                <p className="text-[11px] text-stone-500 mt-1">
                  This explanation is logged into the Super Admin immutable audit trail.
                </p>
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setDisputeModal(false)} className="rounded-full text-xs">
                  Cancel
                </Button>
                <Button type="submit" className="rounded-full bg-amber-700 hover:bg-amber-800 text-white text-xs">
                  Apply Resolution
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

