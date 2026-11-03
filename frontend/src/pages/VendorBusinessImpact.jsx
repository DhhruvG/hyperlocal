import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api, formatApiErrorDetail } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  TrendingUp, Users, ShoppingBag, Eye, Store, Sparkles, Navigation, ArrowUpRight,
  Download, QrCode, PlusCircle, Calendar, ShieldAlert, CheckCircle2,
  FileSpreadsheet, HelpCircle, ArrowRight, Clock, RefreshCw, Send, Loader2,
  ShieldCheck, Award, Layers, Check, X, Info
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar
} from 'recharts';

export default function VendorBusinessImpact() {
  const { user } = useAuth();
  const [range, setRange] = useState('last_30d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [salesModal, setSalesModal] = useState(false);
  const [salesForm, setSalesForm] = useState({
    date: new Date().toISOString().split('T')[0],
    total_sales: '',
    customer_count: '',
    hyperlocal_customer_count: '',
    notes: '',
  });

  const [recordVisitModal, setRecordVisitModal] = useState(false);
  const [visitForm, setVisitForm] = useState({
    visit_status: 'purchased',
    amount: '',
    customer_count: 1,
    notes: '',
  });

  const [baselineModal, setBaselineModal] = useState(false);
  const [baselineForm, setBaselineForm] = useState({
    average_daily_sales: '',
    average_daily_customers: '',
    average_monthly_sales: '',
    baseline_type: 'estimate',
    source: 'Vendor-Provided Estimate',
  });

  const [qrModal, setQrModal] = useState(false);
  const [reportModal, setReportModal] = useState(false);

  // Possible visits state
  const [possibleVisits, setPossibleVisits] = useState([]);
  const [purchaseAmtInput, setPurchaseAmtInput] = useState({});

  // CSV Import state
  const [csvModal, setCsvModal] = useState(false);
  const [csvContent, setCsvContent] = useState('');
  const [csvImporting, setCsvImporting] = useState(false);

  // AI Advisor state
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  const loadPossibleVisits = useCallback(async () => {
    try {
      const res = await api.get('/vendor/possible-visits');
      setPossibleVisits(res.data || []);
    } catch {
      // silent
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/vendor/business-impact', { params: { time_range: range } });
      setData(res.data);
    } catch (err) {
      toast.error('Could not load business impact data');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    loadData();
    loadPossibleVisits();
  }, [loadData, loadPossibleVisits]);

  const handleConfirmPossibleVisit = async (sessionId, action, amount) => {
    try {
      const res = await api.post('/vendor/confirm-visit', {
        session_id: sessionId,
        action,
        amount: amount ? parseFloat(amount) : null,
      });
      toast.success(action === 'purchased' ? 'Purchase verified!' : (action === 'ignore' ? 'Visit dismissed' : 'Visit confirmed!'));
      loadPossibleVisits();
      loadData();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const handleImportCSV = async (e) => {
    e.preventDefault();
    if (!csvContent.trim()) {
      toast.error('Please paste CSV data');
      return;
    }
    setCsvImporting(true);
    try {
      const res = await api.post('/vendor/sales-import', { csv_text: csvContent });
      toast.success(`Imported ${res.data.imported_count} sales records! ${res.data.anomalies_count > 0 ? `(${res.data.anomalies_count} anomalies flagged)` : ''}`);
      setCsvModal(false);
      setCsvContent('');
      loadData();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setCsvImporting(false);
    }
  };

  // Handle Quick Today's Sales submission
  const handleSaveDailySales = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/vendor/daily-sales', {
        date: salesForm.date,
        total_sales: parseFloat(salesForm.total_sales || 0),
        customer_count: parseInt(salesForm.customer_count || 0),
        hyperlocal_customer_count: salesForm.hyperlocal_customer_count ? parseInt(salesForm.hyperlocal_customer_count) : null,
        notes: salesForm.notes,
      });
      if (res.data?.is_anomaly) {
        toast.warning('Daily sales recorded. Note: A potential anomaly was noted due to high volume.');
      } else {
        toast.success('Today\'s sales saved in under 15 seconds!');
      }
      setSalesModal(false);
      loadData();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  // Handle Record Customer Visit
  const handleSaveVisit = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/vendor/record-visit', {
        visit_status: visitForm.visit_status,
        amount: visitForm.amount ? parseFloat(visitForm.amount) : null,
        customer_count: parseInt(visitForm.customer_count || 1),
        notes: visitForm.notes,
      });
      if (res.data?.matched) {
        toast.success(`Visit recorded and linked to customer journey (${res.data.session_id})`);
      } else {
        toast.success('Visit recorded as unmatched vendor visit.');
      }
      setRecordVisitModal(false);
      setVisitForm({ visit_status: 'purchased', amount: '', customer_count: 1, notes: '' });
      loadData();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  // Handle Baseline Save
  const handleSaveBaseline = async (e) => {
    e.preventDefault();
    try {
      await api.post('/vendor/baseline', {
        average_daily_sales: parseFloat(baselineForm.average_daily_sales || 0),
        average_daily_customers: parseFloat(baselineForm.average_daily_customers || 0),
        average_monthly_sales: parseFloat(baselineForm.average_monthly_sales || 0),
        baseline_type: baselineForm.baseline_type,
        source: baselineForm.source,
      });
      toast.success('Pre-HyperLocal baseline updated.');
      setBaselineModal(false);
      loadData();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  // Handle Export CSV
  const handleExportCSV = async () => {
    try {
      const res = await api.get('/vendor/export-analytics', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `business_impact_${user?.shop_name || 'seller'}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Analytics exported successfully');
    } catch {
      toast.error('Failed to export CSV');
    }
  };

  // Ask AI Advisor
  const askAdvisor = async (customPrompt) => {
    const q = customPrompt || aiQuestion;
    if (!q) return;
    setAiLoading(true);
    setAiAnswer(null);
    try {
      const res = await api.post('/ai/chat-simple', {
        message: q,
        session_id: `biz_advisor_${user?.id}`,
        page: '/vendor/analytics',
      });
      setAiAnswer(res.data.reply);
    } catch {
      setAiAnswer('AI advisor is momentarily unavailable. Please check the charts below.');
    } finally {
      setAiLoading(false);
    }
  };

  if (!user) return null;

  const quick = data?.today_quick;
  const growth = data?.growth;
  const isCart = user?.vendor_type === 'cart_vendor';
  const qrUrl = `${window.location.origin}/v/${user?.id}/checkin`;

  return (
    <div className="max-w-7xl mx-auto px-5 md:px-8 py-8 pb-28 md:pb-12">
      {/* Header & Quick Action Buttons */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-stone-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="chip chip-amber"><Store size={12} /> {user.shop_name}</span>
            <Badge variant="outline" className="text-xs uppercase">{isCart ? 'Mobile Cart' : 'Retail Store'}</Badge>
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-stone-900 mt-2">
            HyperLocal Business Impact
          </h1>
          <p className="text-stone-600 text-xs md:text-sm mt-0.5">
            Multi-signal measurement of customer discovery, verified physical visits, and attributed sales.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Today's Sales 10-15s Entry */}
          <Dialog open={salesModal} onOpenChange={setSalesModal}>
            <DialogTrigger asChild>
              <Button className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white text-xs h-9 shadow-sm">
                <PlusCircle size={14} className="mr-1.5" /> Today's Sales
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white max-w-md">
              <DialogHeader>
                <DialogTitle className="font-display text-lg">Record Today's Sales</DialogTitle>
                <DialogDescription className="text-xs text-stone-500">
                  Quick 10-second entry to track overall store performance and calculate observed growth.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSaveDailySales} className="space-y-3.5 py-2">
                <div>
                  <Label className="text-xs">Date</Label>
                  <Input type="date" value={salesForm.date} onChange={(e) => setSalesForm({ ...salesForm, date: e.target.value })} required />
                </div>
                <div>
                  <Label className="text-xs">Total Sales Today (₹)</Label>
                  <Input type="number" min="0" step="1" placeholder="e.g. 12500" value={salesForm.total_sales} onChange={(e) => setSalesForm({ ...salesForm, total_sales: e.target.value })} required />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Approx Customers</Label>
                    <Input type="number" min="0" placeholder="e.g. 65" value={salesForm.customer_count} onChange={(e) => setSalesForm({ ...salesForm, customer_count: e.target.value })} required />
                  </div>
                  <div>
                    <Label className="text-xs">HyperLocal Customers (Optional)</Label>
                    <Input type="number" min="0" placeholder="e.g. 12" value={salesForm.hyperlocal_customer_count} onChange={(e) => setSalesForm({ ...salesForm, hyperlocal_customer_count: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Notes (Optional)</Label>
                  <Input placeholder="e.g. Rainy evening, festival rush" value={salesForm.notes} onChange={(e) => setSalesForm({ ...salesForm, notes: e.target.value })} />
                </div>
                <DialogFooter className="pt-2">
                  <Button type="submit" className="w-full rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white">Save Sales in 10s</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Record Customer Visit */}
          <Dialog open={recordVisitModal} onOpenChange={setRecordVisitModal}>
            <DialogTrigger asChild>
              <Button variant="outline" className="rounded-full border-stone-300 text-xs h-9">
                <Users size={14} className="mr-1.5 text-stone-600" /> Record Visit
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white max-w-md">
              <DialogHeader>
                <DialogTitle className="font-display text-lg">Record Customer Visit / Sale</DialogTitle>
                <DialogDescription className="text-xs text-stone-500">
                  Manually confirm a walk-in shopper. System will connect with active customer discovery sessions.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSaveVisit} className="space-y-3.5 py-2">
                <div>
                  <Label className="text-xs">Visit Status</Label>
                  <Select value={visitForm.visit_status} onValueChange={(v) => setVisitForm({ ...visitForm, visit_status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="purchased">Purchased</SelectItem>
                      <SelectItem value="visited">Visited (Did not buy)</SelectItem>
                      <SelectItem value="unknown">Unknown</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {visitForm.visit_status === 'purchased' && (
                  <div>
                    <Label className="text-xs">Sale Amount (₹)</Label>
                    <Input type="number" min="1" placeholder="e.g. 350" value={visitForm.amount} onChange={(e) => setVisitForm({ ...visitForm, amount: e.target.value })} required />
                  </div>
                )}
                <div>
                  <Label className="text-xs">Note</Label>
                  <Input placeholder="e.g. Bought 2kg tomatoes" value={visitForm.notes} onChange={(e) => setVisitForm({ ...visitForm, notes: e.target.value })} />
                </div>
                <DialogFooter className="pt-2">
                  <Button type="submit" className="w-full rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white">Save Record</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* QR Code Modal */}
          <Dialog open={qrModal} onOpenChange={setQrModal}>
            <DialogTrigger asChild>
              <Button variant="outline" className="rounded-full border-stone-300 text-xs h-9">
                <QrCode size={14} className="mr-1.5 text-stone-600" /> My QR Code
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white max-w-sm text-center">
              <DialogHeader>
                <DialogTitle className="font-display text-lg">Your Store QR Code</DialogTitle>
                <DialogDescription className="text-xs text-stone-500">
                  Place this QR at your counter or cart. QR scan is an optional verification signal.
                </DialogDescription>
              </DialogHeader>
              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 my-2">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrUrl)}`}
                  alt="Shop QR"
                  className="mx-auto rounded-lg shadow-sm w-44 h-44"
                />
                <div className="font-semibold text-stone-900 mt-3 text-sm">{user.shop_name}</div>
                <div className="text-[11px] text-stone-500 font-mono mt-1 break-all">{qrUrl}</div>
              </div>
              <div className="text-xs text-stone-600">
                Customers can scan this to view your store, check in, or confirm a purchase.
              </div>
            </DialogContent>
          </Dialog>

          {/* Baseline Setup Modal */}
          <Dialog open={baselineModal} onOpenChange={setBaselineModal}>
            <DialogTrigger asChild>
              <Button variant="outline" className="rounded-full border-stone-300 text-xs h-9">
                <Calendar size={14} className="mr-1.5 text-stone-600" /> Baseline Setup
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white max-w-md">
              <DialogHeader>
                <DialogTitle className="font-display text-lg">Before-HyperLocal Baseline</DialogTitle>
                <DialogDescription className="text-xs text-stone-500">
                  Provide your average numbers before joining HyperLocal to evaluate observed business changes.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSaveBaseline} className="space-y-3.5 py-2">
                <div>
                  <Label className="text-xs">Average Daily Sales (₹)</Label>
                  <Input type="number" min="0" placeholder="e.g. 10500" value={baselineForm.average_daily_sales} onChange={(e) => setBaselineForm({ ...baselineForm, average_daily_sales: e.target.value })} required />
                </div>
                <div>
                  <Label className="text-xs">Average Daily Customers</Label>
                  <Input type="number" min="0" placeholder="e.g. 75" value={baselineForm.average_daily_customers} onChange={(e) => setBaselineForm({ ...baselineForm, average_daily_customers: e.target.value })} required />
                </div>
                <div>
                  <Label className="text-xs">Average Monthly Sales (₹)</Label>
                  <Input type="number" min="0" placeholder="e.g. 315000" value={baselineForm.average_monthly_sales} onChange={(e) => setBaselineForm({ ...baselineForm, average_monthly_sales: e.target.value })} required />
                </div>
                <div>
                  <Label className="text-xs">Data Source</Label>
                  <Select value={baselineForm.baseline_type} onValueChange={(v) => setBaselineForm({ ...baselineForm, baseline_type: v, source: v === 'historical_30d' ? '30-Day Historical Data' : 'Vendor-Provided Estimate' })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="estimate">Vendor-Provided Estimate</SelectItem>
                      <SelectItem value="historical_30d">30-Day Historical Records</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter className="pt-2">
                  <Button type="submit" className="w-full rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white">Save Baseline</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Import CSV Modal */}
          <Dialog open={csvModal} onOpenChange={setCsvModal}>
            <DialogTrigger asChild>
              <Button variant="outline" className="rounded-full border-stone-300 text-xs h-9">
                <FileSpreadsheet size={14} className="mr-1.5 text-stone-600" /> Import Sales CSV
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white max-w-md">
              <DialogHeader>
                <DialogTitle className="font-display text-lg">Batch Import Daily Sales (CSV)</DialogTitle>
                <DialogDescription className="text-xs text-stone-500">
                  Upload or paste your store sales history to calibrate growth and incremental sales.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleImportCSV} className="space-y-3.5 py-2">
                <div>
                  <Label className="text-xs">Paste CSV Data (Date, Total Sales, Customer Count)</Label>
                  <Textarea
                    rows={6}
                    value={csvContent}
                    onChange={(e) => setCsvContent(e.target.value)}
                    placeholder={`date,total_sales,customer_count\n2026-09-10,4200,28\n2026-09-11,5100,34\n2026-09-12,4800,31`}
                    className="font-mono text-xs mt-1"
                    required
                  />
                  <p className="text-[11px] text-stone-500 mt-1">Columns: date (YYYY-MM-DD), total_sales, customer_count</p>
                </div>
                <DialogFooter className="pt-2">
                  <Button type="submit" disabled={csvImporting} className="w-full rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white">
                    {csvImporting ? 'Importing Records...' : 'Import Sales Records'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Export & Report */}
          <Button variant="ghost" size="sm" onClick={handleExportCSV} className="rounded-full text-xs h-9 text-stone-700">
            <Download size={13} className="mr-1" /> Export CSV
          </Button>

          <Button variant="outline" size="sm" onClick={() => setReportModal(true)} className="rounded-full text-xs h-9 border-stone-300">
            <FileSpreadsheet size={13} className="mr-1 text-emerald-700" /> Monthly Report
          </Button>
        </div>
      </div>

      {/* Detected HyperLocal Visits Awaiting Verification (One-Tap Confirmation) */}
      {possibleVisits && possibleVisits.length > 0 && (
        <div className="mt-5 rounded-2xl border border-emerald-300 bg-emerald-50/60 p-4 md:p-5 shadow-xs">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-emerald-600 text-white grid place-items-center text-xs font-bold">
                {possibleVisits.length}
              </span>
              <h2 className="font-display text-sm md:text-base font-semibold text-emerald-950">
                Possible HyperLocal Visitors Awaiting Your Verification
              </h2>
            </div>
            <span className="text-[11px] text-emerald-800">Review in 1-tap to verify walk-in attribution</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {possibleVisits.map((v) => (
              <div key={v.session_id} className="bg-white rounded-xl p-3.5 border border-emerald-200 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-semibold text-stone-900 text-xs">{v.customer_label}</span>
                    <Badge className="text-[10px] bg-emerald-100 text-emerald-800 border-0">{v.intent_level} Intent</Badge>
                  </div>
                  <div className="text-[11px] text-stone-500 space-y-0.5">
                    <div>Time: {new Date(v.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    {v.dwell_seconds > 0 && <div>Store dwell: ~{Math.round(v.dwell_seconds / 60)} mins</div>}
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-stone-100 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      placeholder="₹ Amount (if bought)"
                      value={purchaseAmtInput[v.session_id] || ''}
                      onChange={(e) => setPurchaseAmtInput({ ...purchaseAmtInput, [v.session_id]: e.target.value })}
                      className="h-7 text-xs rounded-lg px-2"
                    />
                    <Button
                      size="sm"
                      onClick={() => handleConfirmPossibleVisit(v.session_id, 'purchased', purchaseAmtInput[v.session_id])}
                      className="h-7 text-[11px] rounded-lg bg-[#0A6E3B] hover:bg-[#075030] text-white px-2.5 shrink-0"
                    >
                      Purchased
                    </Button>
                  </div>

                  <div className="flex items-center justify-between gap-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => handleConfirmPossibleVisit(v.session_id, 'confirm_visit')}
                      className="text-[#0A6E3B] hover:underline font-medium"
                    >
                      Visited (no buy)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleConfirmPossibleVisit(v.session_id, 'ignore')}
                      className="text-stone-400 hover:text-stone-600"
                    >
                      Ignore
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mobile-First 10-Second Quick Banner */}
      {quick && (
        <div className="mt-5 rounded-2xl bg-stone-900 text-white p-4 md:p-5 shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
              <Sparkles size={13} /> Today's Quick Snapshot
            </div>
            <span className="text-[11px] text-stone-400">Updated in real-time</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center sm:text-left">
            <div className="border-r border-stone-800 pr-2">
              <div className="text-[10px] text-stone-400 uppercase">HyperLocal Shoppers</div>
              <div className="text-xl md:text-2xl font-bold font-display mt-0.5 text-white">{quick.hyperlocal_customers}</div>
            </div>
            <div className="border-r border-stone-800 pr-2">
              <div className="text-[10px] text-stone-400 uppercase">Verified Visits</div>
              <div className="text-xl md:text-2xl font-bold font-display mt-0.5 text-emerald-400">{quick.verified_visits}</div>
            </div>
            <div className="border-r border-stone-800 pr-2">
              <div className="text-[10px] text-stone-400 uppercase">Attributed Purchases</div>
              <div className="text-xl md:text-2xl font-bold font-display mt-0.5 text-white">{quick.attributed_purchases}</div>
            </div>
            <div className="border-r border-stone-800 pr-2">
              <div className="text-[10px] text-stone-400 uppercase">Attributed Sales</div>
              <div className="text-xl md:text-2xl font-bold font-display mt-0.5 text-emerald-400">₹{quick.attributed_sales.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[10px] text-stone-400 uppercase">Observed Lift</div>
              <div className="text-xl md:text-2xl font-bold font-display mt-0.5 text-amber-400">
                {quick.observed_sales_vs_baseline != null ? `${quick.observed_sales_vs_baseline > 0 ? '+' : ''}${quick.observed_sales_vs_baseline}%` : '—'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Date Filter Bar */}
      <div className="mt-6 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1.5 p-1 bg-stone-100 rounded-xl">
          {[
            { id: 'today', label: 'Today' },
            { id: 'last_7d', label: '7 Days' },
            { id: 'last_30d', label: '30 Days' },
            { id: 'this_month', label: 'This Month' },
            { id: 'last_month', label: 'Last Month' },
            { id: 'all', label: 'All Time' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setRange(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                range === t.id ? 'bg-white text-stone-900 shadow-xs font-semibold' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={loadData} className="text-stone-500 text-xs">
          <RefreshCw size={12} className={`mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Small Sample Warning */}
      {data?.small_sample?.is_small && (
        <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2.5 text-amber-900 text-xs">
          <HelpCircle size={16} className="text-amber-700 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Sample Size Note: </span>
            {data.small_sample.warning} Conversion rates are indicative and will calibrate as more offline visits accumulate.
          </div>
        </div>
      )}

      {/* 4 Core Metric Sections */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Customer Acquisition */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="eyebrow text-stone-500">Customer Acquisition</span>
            <Users size={16} className="text-emerald-700" />
          </div>
          <div className="font-display text-3xl font-bold text-stone-900 mt-2">
            {data?.customer_acquisition?.total_hyperlocal_customers ?? '0'}
          </div>
          <div className="text-xs text-stone-500 mt-1 flex items-center gap-1.5">
            <span className="text-emerald-700 font-medium">{data?.customer_acquisition?.new_customers ?? 0} new</span> ·
            <span>{data?.customer_acquisition?.returning_customers ?? 0} returning</span>
          </div>
          <div className="mt-3 pt-3 border-t border-stone-100 flex items-center justify-between text-xs text-stone-600">
            <span>Repeat Customers</span>
            <Badge variant="outline" className="text-[10px]">{data?.customer_acquisition?.repeat_customers ?? 0}</Badge>
          </div>
        </div>

        {/* Physical Visits */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="eyebrow text-stone-500">Physical Visits</span>
            <Navigation size={16} className="text-blue-600" />
          </div>
          <div className="font-display text-3xl font-bold text-stone-900 mt-2">
            {data?.visits?.total_likely_and_verified ?? '0'}
          </div>
          <div className="text-xs text-stone-500 mt-1 flex items-center gap-1.5">
            <Badge className="bg-emerald-100 text-emerald-900 border-0 text-[10px]"><CheckCircle2 size={9} className="mr-0.5" /> {data?.visits?.verified_visits ?? 0} Verified</Badge>
            <Badge variant="outline" className="text-[10px]">{data?.visits?.likely_visits ?? 0} Likely</Badge>
          </div>
          <div className="mt-3 pt-3 border-t border-stone-100 flex items-center justify-between text-xs text-stone-600">
            <span>Possible Signals</span>
            <span className="text-stone-500">{data?.visits?.possible_visits ?? 0}</span>
          </div>
        </div>

        {/* Attributed Purchases */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="eyebrow text-stone-500">Purchases & Conversion</span>
            <ShoppingBag size={16} className="text-amber-600" />
          </div>
          <div className="font-display text-3xl font-bold text-stone-900 mt-2">
            {data?.purchases?.attributed_purchases ?? '0'}
          </div>
          <div className="text-xs text-stone-500 mt-1 flex items-center gap-1.5">
            <span>Conv. Rate: <strong>{data?.purchases?.purchase_conversion_rate ?? 0}%</strong></span>
          </div>
          <div className="mt-3 pt-3 border-t border-stone-100 flex items-center justify-between text-xs text-stone-600">
            <span>Avg. Basket</span>
            <span className="font-semibold text-stone-800">₹{data?.purchases?.average_basket_value ?? 0}</span>
          </div>
        </div>

        {/* Attributed Revenue */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="eyebrow text-stone-500">Attributed Revenue</span>
            <TrendingUp size={16} className="text-[#0A6E3B]" />
          </div>
          <div className="font-display text-3xl font-bold text-[#0A6E3B] mt-2">
            ₹{data?.revenue?.hyperlocal_attributed_revenue?.toLocaleString() ?? '0'}
          </div>
          <div className="text-xs text-stone-500 mt-1">
            Total reported: ₹{data?.revenue?.total_reported_sales?.toLocaleString() ?? '0'}
          </div>
          <div className="mt-3 pt-3 border-t border-stone-100 flex items-center justify-between text-xs text-stone-600">
            <span>Est. Incremental</span>
            <span className="font-semibold text-emerald-800">₹{data?.revenue?.estimated_incremental_sales?.toLocaleString() ?? '0'}</span>
          </div>
        </div>
      </div>

      {/* Confidence-Weighted Revenue Breakdown */}
      {data?.confidence_revenue && (
        <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-[#0A6E3B]" />
                <h2 className="font-display text-lg font-semibold text-stone-900">
                  Confidence-Weighted Revenue Breakdown
                </h2>
              </div>
              <p className="text-xs text-stone-500 mt-0.5">
                Multi-signal attribution tiering across verification levels.
              </p>
            </div>
            <Badge variant="outline" className="text-xs border-stone-300">
              Total Reported: ₹{data.confidence_revenue.total_reported?.toLocaleString() ?? 0}
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Verified Tier */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-900 flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-[#0A6E3B]" /> Verified Tier
                </span>
                <Badge className="bg-[#0A6E3B] text-white text-[10px]">
                  {data.confidence_revenue.tiers?.verified?.pct_of_total ?? 0}%
                </Badge>
              </div>
              <div className="font-display text-2xl font-bold text-[#0A6E3B] mt-2">
                ₹{data.confidence_revenue.tiers?.verified?.amount?.toLocaleString() ?? 0}
              </div>
              <p className="text-[11px] text-stone-600 mt-1">
                {data.confidence_revenue.tiers?.verified?.count ?? 0} direct QR or OCR bill confirmations
              </p>
            </div>

            {/* High Confidence Tier */}
            <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-900 flex items-center gap-1.5">
                  <Navigation size={14} className="text-blue-600" /> High Confidence
                </span>
                <Badge className="bg-blue-600 text-white text-[10px]">
                  {data.confidence_revenue.tiers?.high_confidence?.pct_of_total ?? 0}%
                </Badge>
              </div>
              <div className="font-display text-2xl font-bold text-blue-900 mt-2">
                ₹{data.confidence_revenue.tiers?.high_confidence?.amount?.toLocaleString() ?? 0}
              </div>
              <p className="text-[11px] text-stone-600 mt-1">
                {data.confidence_revenue.tiers?.high_confidence?.count ?? 0} directions + dwell arrivals
              </p>
            </div>

            {/* Medium Confidence Tier */}
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
                  <ShoppingBag size={14} className="text-amber-600" /> Medium Confidence
                </span>
                <Badge className="bg-amber-600 text-white text-[10px]">
                  {data.confidence_revenue.tiers?.medium_confidence?.pct_of_total ?? 0}%
                </Badge>
              </div>
              <div className="font-display text-2xl font-bold text-amber-900 mt-2">
                ₹{data.confidence_revenue.tiers?.medium_confidence?.amount?.toLocaleString() ?? 0}
              </div>
              <p className="text-[11px] text-stone-600 mt-1">
                {data.confidence_revenue.tiers?.medium_confidence?.count ?? 0} active search/discovery window
              </p>
            </div>

            {/* Vendor Reported Tier */}
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-800 flex items-center gap-1.5">
                  <FileSpreadsheet size={14} className="text-stone-500" /> Vendor Reported
                </span>
                <Badge variant="outline" className="text-[10px] text-stone-600">
                  {data.confidence_revenue.tiers?.vendor_reported?.pct_of_total ?? 0}%
                </Badge>
              </div>
              <div className="font-display text-2xl font-bold text-stone-800 mt-2">
                ₹{data.confidence_revenue.tiers?.vendor_reported?.amount?.toLocaleString() ?? 0}
              </div>
              <p className="text-[11px] text-stone-500 mt-1">
                {data.confidence_revenue.tiers?.vendor_reported?.count ?? 0} daily entries or CSV batch logs
              </p>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-stone-100 flex items-center gap-2 text-stone-500 text-[11px]">
            <Info size={14} className="shrink-0 text-stone-400" />
            <span>
              {data.confidence_revenue.disclaimer || "Estimate based on available baseline and attribution data. This is not a guaranteed causal measurement."}
            </span>
          </div>
        </div>
      )}

      {/* Before vs After Growth Comparison Box */}
      <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-xs">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-stone-900 flex items-center gap-2">
              Before HyperLocal vs After HyperLocal
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Comparing your pre-joining baseline against post-launch observed sales and customer volume.
            </p>
          </div>
          <Badge variant="outline" className="text-xs border-stone-300">
            Source: {growth?.baseline_source || 'Vendor Estimate'}
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-stone-50 rounded-xl p-4 border border-stone-100">
          {/* Before */}
          <div className="space-y-1">
            <span className="eyebrow text-stone-500">Before HyperLocal</span>
            <div className="text-2xl font-bold font-display text-stone-800">
              ₹{growth?.before_daily_sales?.toLocaleString() ?? 0}
              <span className="text-xs text-stone-500 font-normal"> / day</span>
            </div>
            <div className="text-xs text-stone-500">
              Avg daily customers: <strong>{growth?.before_daily_customers ?? 0}</strong>
            </div>
          </div>

          {/* After */}
          <div className="space-y-1">
            <span className="eyebrow text-stone-500">After Joining (Current Period)</span>
            <div className="text-2xl font-bold font-display text-emerald-800">
              ₹{growth?.after_daily_sales?.toLocaleString() ?? 0}
              <span className="text-xs text-stone-500 font-normal"> / day</span>
            </div>
            <div className="text-xs text-stone-500">
              Avg daily customers: <strong>{growth?.after_daily_customers ?? 0}</strong>
            </div>
          </div>

          {/* Observed Change */}
          <div className="space-y-1 md:border-l md:border-stone-200 md:pl-4">
            <span className="eyebrow text-amber-800 font-semibold">{growth?.label || 'Observed Change'}</span>
            <div className="text-2xl font-bold font-display text-stone-900 flex items-center gap-1.5">
              {growth?.observed_sales_change_pct != null ? (
                <>
                  <span className={growth.observed_sales_change_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                    {growth.observed_sales_change_pct >= 0 ? '+' : ''}{growth.observed_sales_change_pct}%
                  </span>
                  <ArrowUpRight size={18} className="text-emerald-600" />
                </>
              ) : (
                <span className="text-stone-400 text-base">Setup baseline to see %</span>
              )}
            </div>
            <div className="text-[11px] text-stone-500 leading-tight">
              {growth?.label_disclaimer}
            </div>
          </div>
        </div>
      </div>

      {/* Sales Graph & Funnel */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Timeline Chart */}
        <div className="lg:col-span-2 rounded-2xl border border-stone-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-stone-900">Reported Sales vs Attributed Sales</h2>
              <p className="text-xs text-stone-500 mt-0.5">Timeline of total store daily sales vs HyperLocal-attributed customer revenue</p>
            </div>
          </div>
          <div className="h-64 w-full">
            {data?.chart_data && data.chart_data.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.chart_data}>
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#78716c" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#78716c" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorAttr" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0A6E3B" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#0A6E3B" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#a8a29e" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#a8a29e" />
                  <Tooltip
                    formatter={(value) => [`₹${Number(value).toLocaleString()}`, '']}
                    contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e7e5e4', fontSize: '12px' }}
                  />
                  <Area type="monotone" dataKey="total_sales" name="Total Reported" stroke="#78716c" strokeWidth={1.5} fillOpacity={1} fill="url(#colorTotal)" />
                  <Area type="monotone" dataKey="attributed_sales" name="HyperLocal Attributed" stroke="#0A6E3B" strokeWidth={2} fillOpacity={1} fill="url(#colorAttr)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full grid place-items-center text-stone-400 text-xs">
                Log daily sales using the "Today's Sales" button above to view timeline charts.
              </div>
            )}
          </div>
        </div>

        {/* Customer Journey Funnel */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs flex flex-col justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-stone-900">Customer Funnel</h2>
            <p className="text-xs text-stone-500 mt-0.5">Where shoppers discover, engage and convert</p>

            <div className="mt-5 space-y-3 text-xs">
              <div className="flex items-center justify-between p-2 rounded-lg bg-stone-50">
                <span className="text-stone-600">1. Impressions (Search/Feed)</span>
                <span className="font-bold text-stone-900">{data?.funnel?.impressions ?? 0}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-stone-50">
                <span className="text-stone-600">2. Profile Views</span>
                <span className="font-bold text-stone-900">{data?.funnel?.profile_views ?? 0}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-stone-50">
                <span className="text-stone-600">3. High Intent (Directions/Chat)</span>
                <span className="font-bold text-stone-900">{data?.funnel?.high_intent ?? 0}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-50 text-emerald-950">
                <span className="font-medium">4. Likely & Verified Visits</span>
                <span className="font-bold">{data?.funnel?.likely_and_verified_visits ?? 0}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-100 text-[#0A6E3B]">
                <span className="font-medium">5. Attributed Purchases</span>
                <span className="font-bold text-sm">{data?.funnel?.attributed_purchases ?? 0}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-stone-100 text-[11px] text-stone-500">
            Conversion (Profile → Visit): <strong>{data?.conversion_rates?.profile_to_visit ?? 0}%</strong>
          </div>
        </div>
      </div>

      {/* Product Performance Section */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Products Driving Visits */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs">
          <h2 className="font-display text-base font-semibold text-stone-900">Products Driving Visits</h2>
          <p className="text-xs text-stone-500 mt-0.5">Top items customers searched and viewed before visiting</p>
          <div className="mt-4 divide-y divide-stone-100">
            {data?.products_performance?.driving_visits && data.products_performance.driving_visits.length > 0 ? (
              data.products_performance.driving_visits.map((p, idx) => (
                <div key={p.id || idx} className="py-2.5 flex items-center justify-between text-xs">
                  <span className="font-medium text-stone-800">{p.name}</span>
                  <span className="text-stone-500 font-semibold">{p.visits} visits ({p.views} views)</span>
                </div>
              ))
            ) : (
              <div className="py-6 text-center text-xs text-stone-400">No product visit attribution recorded yet.</div>
            )}
          </div>
        </div>

        {/* Products Driving Sales */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs">
          <h2 className="font-display text-base font-semibold text-stone-900">Products Driving Sales</h2>
          <p className="text-xs text-stone-500 mt-0.5">Top items with confirmed attributed revenue</p>
          <div className="mt-4 divide-y divide-stone-100">
            {data?.products_performance?.driving_sales && data.products_performance.driving_sales.length > 0 ? (
              data.products_performance.driving_sales.map((p, idx) => (
                <div key={p.id || idx} className="py-2.5 flex items-center justify-between text-xs">
                  <span className="font-medium text-stone-800">{p.name}</span>
                  <span className="font-semibold text-[#0A6E3B]">₹{p.revenue.toLocaleString()} ({p.purchases} sales)</span>
                </div>
              ))
            ) : (
              <div className="py-6 text-center text-xs text-stone-400">No product sales attribution recorded yet.</div>
            )}
          </div>
        </div>
      </div>

      {/* Attribution Quality & Customer Retention Cohorts */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Attribution Quality & Completeness Checklist */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Award size={18} className="text-[#0A6E3B]" />
                <h2 className="font-display text-base font-semibold text-stone-900">
                  Attribution Quality & Completeness
                </h2>
              </div>
              <Badge className={
                (data?.attribution_quality?.quality_score ?? 0) >= 75
                  ? 'bg-emerald-100 text-emerald-900 border-0'
                  : (data?.attribution_quality?.quality_score ?? 0) >= 50
                  ? 'bg-amber-100 text-amber-900 border-0'
                  : 'bg-rose-100 text-rose-900 border-0'
              }>
                {data?.attribution_quality?.level || 'Calibrating'} ({data?.attribution_quality?.quality_score ?? 0}/100)
              </Badge>
            </div>
            <p className="text-xs text-stone-500 mb-4">
              Completeness of baseline parameters and multi-signal touchpoints.
            </p>

            {/* Completeness Bar */}
            <div className="w-full bg-stone-100 rounded-full h-2.5 mb-4 overflow-hidden">
              <div
                className="bg-[#0A6E3B] h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(10, data?.attribution_quality?.quality_score ?? 25))}%` }}
              />
            </div>

            {/* Checklist */}
            <div className="space-y-2.5">
              {data?.attribution_quality?.checklist ? (
                data.attribution_quality.checklist.map((c, i) => (
                  <div key={i} className="flex items-start justify-between gap-2 p-2.5 rounded-xl bg-stone-50 text-xs">
                    <div className="flex items-start gap-2">
                      {c.completed ? (
                        <CheckCircle2 size={16} className="text-[#0A6E3B] shrink-0 mt-0.5" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-stone-300 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className={`font-medium ${c.completed ? 'text-stone-900' : 'text-stone-700'}`}>
                          {c.item}
                        </div>
                        <div className="text-[11px] text-stone-500">{c.impact}</div>
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${c.completed ? 'border-emerald-300 text-emerald-800' : 'border-stone-200 text-stone-500'}`}>
                      {c.completed ? 'Active' : `+${c.weight || 25} pts`}
                    </Badge>
                  </div>
                ))
              ) : (
                <div className="text-xs text-stone-400 py-4 text-center">Checklist calculating...</div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between gap-2">
            <span className="text-[11px] text-stone-500">Boost measurement accuracy:</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setBaselineModal(true)} className="text-[11px] h-7 rounded-lg">
                Baseline
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCsvModal(true)} className="text-[11px] h-7 rounded-lg">
                Import CSV
              </Button>
            </div>
          </div>
        </div>

        {/* Customer Cohorts & Retention */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Users size={18} className="text-blue-600" />
                <h2 className="font-display text-base font-semibold text-stone-900">
                  Monthly Customer Cohorts & Retention
                </h2>
              </div>
              <Badge variant="outline" className="text-[10px] border-stone-200">
                Offline Loyalty
              </Badge>
            </div>
            <p className="text-xs text-stone-500 mb-4">
              Monthly repeat visit & repurchase rates of newly acquired HyperLocal shoppers.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500 text-[11px]">
                    <th className="pb-2 font-medium">Cohort Month</th>
                    <th className="pb-2 font-medium text-center">Acquired</th>
                    <th className="pb-2 font-medium text-center">M0</th>
                    <th className="pb-2 font-medium text-center">M1 Retention</th>
                    <th className="pb-2 font-medium text-center">M2 Retention</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {data?.cohorts && data.cohorts.length > 0 ? (
                    data.cohorts.map((c, idx) => (
                      <tr key={c.cohort_month || idx} className="hover:bg-stone-50">
                        <td className="py-2.5 font-medium text-stone-800">{c.cohort_month}</td>
                        <td className="py-2.5 text-center font-semibold text-stone-900">{c.cohort_size}</td>
                        <td className="py-2.5 text-center text-stone-500">100%</td>
                        <td className="py-2.5 text-center">
                          {c.retention_rate_m1 != null ? (
                            <Badge className={`text-[10px] border-0 ${
                              c.retention_rate_m1 >= 50
                                ? 'bg-emerald-100 text-emerald-900'
                                : c.retention_rate_m1 >= 25
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-stone-100 text-stone-700'
                            }`}>
                              {c.retention_rate_m1}% ({c.m1_retained ?? 0})
                            </Badge>
                          ) : (
                            <span className="text-stone-300">—</span>
                          )}
                        </td>
                        <td className="py-2.5 text-center">
                          {c.retention_rate_m2 != null ? (
                            <Badge className={`text-[10px] border-0 ${
                              c.retention_rate_m2 >= 50
                                ? 'bg-emerald-100 text-emerald-900'
                                : c.retention_rate_m2 >= 25
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-stone-100 text-stone-700'
                            }`}>
                              {c.retention_rate_m2}% ({c.m2_retained ?? 0})
                            </Badge>
                          ) : (
                            <span className="text-stone-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-xs text-stone-400">
                        Cohort trends will appear here as multi-month customer visits accumulate.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-stone-100 text-[11px] text-stone-500 flex items-center gap-1.5">
            <Info size={13} className="text-stone-400 shrink-0" />
            <span>Tracks returning customers within 30 and 60 days of their initial HyperLocal visit.</span>
          </div>
        </div>
      </div>

      {/* Mobile Vendor Demand-to-Sale (if cart vendor) */}
      {isCart && data?.mobile_vendor_funnel && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/50 via-white to-orange-50/30 p-6 shadow-xs">
          <div className="flex items-center gap-2 mb-1">
            <Badge className="bg-amber-100 text-amber-900 border-0 text-xs">Mobile Vendor Special</Badge>
            <h2 className="font-display text-lg font-semibold text-stone-900">Demand → Match → Arrival → Purchase</h2>
          </div>
          <p className="text-xs text-stone-600">Track how "I need" requests convert into live cart stops and sales.</p>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-6 gap-3 text-center">
            <div className="bg-white p-3 rounded-xl border border-stone-200">
              <div className="text-[10px] uppercase text-stone-500">Demands</div>
              <div className="text-lg font-bold font-display text-stone-900 mt-0.5">{data.mobile_vendor_funnel.demand_requests}</div>
            </div>
            <div className="bg-white p-3 rounded-xl border border-stone-200">
              <div className="text-[10px] uppercase text-stone-500">Accepted</div>
              <div className="text-lg font-bold font-display text-amber-700 mt-0.5">{data.mobile_vendor_funnel.requests_accepted}</div>
            </div>
            <div className="bg-white p-3 rounded-xl border border-stone-200">
              <div className="text-[10px] uppercase text-stone-500">Matches</div>
              <div className="text-lg font-bold font-display text-stone-900 mt-0.5">{data.mobile_vendor_funnel.customer_matches}</div>
            </div>
            <div className="bg-white p-3 rounded-xl border border-stone-200">
              <div className="text-[10px] uppercase text-stone-500">Arrivals</div>
              <div className="text-lg font-bold font-display text-blue-700 mt-0.5">{data.mobile_vendor_funnel.vendor_arrivals}</div>
            </div>
            <div className="bg-white p-3 rounded-xl border border-stone-200">
              <div className="text-[10px] uppercase text-stone-500">Purchases</div>
              <div className="text-lg font-bold font-display text-emerald-700 mt-0.5">{data.mobile_vendor_funnel.confirmed_purchases}</div>
            </div>
            <div className="bg-white p-3 rounded-xl border border-stone-200">
              <div className="text-[10px] uppercase text-stone-500">Attributed Rev</div>
              <div className="text-lg font-bold font-display text-[#0A6E3B] mt-0.5">₹{data.mobile_vendor_funnel.attributed_revenue.toLocaleString()}</div>
            </div>
          </div>
        </div>
      )}

      {/* AI Business Advisor Section */}
      <div className="mt-8 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/60 via-white to-stone-50 p-6 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#0A6E3B] text-white grid place-items-center">
            <Sparkles size={16} />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-stone-900">AI Business Advisor</h2>
            <p className="text-xs text-stone-500">Ask real questions about your store's performance and conversion optimization</p>
          </div>
        </div>

        {/* Preset Prompt Chips */}
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            'How much business did HyperLocal generate for me?',
            'Did my sales increase after joining HyperLocal?',
            'Which products attract the most customers?',
            'Why are people viewing my shop but not visiting?',
            'Explain my monthly performance',
          ].map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => { setAiQuestion(prompt); askAdvisor(prompt); }}
              className="px-3 py-1.5 rounded-full text-xs bg-white border border-stone-200 text-stone-700 hover:border-[#0A6E3B] hover:text-[#0A6E3B] transition-colors"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Question Input */}
        <div className="mt-4 flex gap-2">
          <Input
            placeholder="Type a custom business question..."
            value={aiQuestion}
            onChange={(e) => setAiQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && askAdvisor()}
            className="rounded-full bg-white text-xs"
          />
          <Button
            onClick={() => askAdvisor()}
            disabled={aiLoading || !aiQuestion}
            className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white text-xs px-5"
          >
            {aiLoading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          </Button>
        </div>

        {/* AI Answer Card */}
        {aiAnswer && (
          <div className="mt-4 rounded-xl bg-white border border-emerald-200 p-4 shadow-xs">
            <div className="eyebrow text-emerald-800 flex items-center gap-1 mb-1.5">
              <Sparkles size={12} /> LocalPrice AI Business Insight
            </div>
            <div className="text-xs text-stone-800 whitespace-pre-line leading-relaxed">
              {aiAnswer}
            </div>
          </div>
        )}
      </div>

      {/* Monthly Report Dialog */}
      <Dialog open={reportModal} onOpenChange={setReportModal}>
        <DialogContent className="bg-white max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Monthly Business Impact Report</DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Official summary of offline customer acquisition, verified visits, and reported business impact.
            </DialogDescription>
          </DialogHeader>
          <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-4 text-xs text-stone-800">
            <div className="flex justify-between items-center border-b border-stone-200 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-stone-900">{user.shop_name}</h3>
                <div className="text-stone-500">{user.shop_address} · {user.vendor_type}</div>
              </div>
              <Badge variant="outline" className="text-xs">{range.replace('_', ' ').toUpperCase()}</Badge>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
              <div className="bg-white p-3 rounded-xl border border-stone-100">
                <div className="text-[10px] text-stone-500 uppercase">HyperLocal Shoppers</div>
                <div className="text-xl font-bold font-display text-stone-900 mt-0.5">{data?.customer_acquisition?.total_hyperlocal_customers ?? 0}</div>
              </div>
              <div className="bg-white p-3 rounded-xl border border-stone-100">
                <div className="text-[10px] text-stone-500 uppercase">Verified Visits</div>
                <div className="text-xl font-bold font-display text-emerald-700 mt-0.5">{data?.visits?.verified_visits ?? 0}</div>
              </div>
              <div className="bg-white p-3 rounded-xl border border-stone-100">
                <div className="text-[10px] text-stone-500 uppercase">Attributed Purchases</div>
                <div className="text-xl font-bold font-display text-stone-900 mt-0.5">{data?.purchases?.attributed_purchases ?? 0}</div>
              </div>
              <div className="bg-white p-3 rounded-xl border border-stone-100">
                <div className="text-[10px] text-stone-500 uppercase">Attributed Revenue</div>
                <div className="text-xl font-bold font-display text-[#0A6E3B] mt-0.5">₹{data?.revenue?.hyperlocal_attributed_revenue?.toLocaleString() ?? 0}</div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-stone-100 space-y-2">
              <div className="font-semibold text-stone-900">Baseline & Growth Analysis</div>
              <div className="grid grid-cols-2 gap-2 text-stone-600">
                <div>Before HyperLocal: ₹{growth?.before_daily_sales?.toLocaleString() ?? 0}/day</div>
                <div>After Joining: ₹{growth?.after_daily_sales?.toLocaleString() ?? 0}/day</div>
              </div>
              <div className="text-emerald-800 font-medium pt-1">
                Observed Sales Change: {growth?.observed_sales_change_pct != null ? `${growth.observed_sales_change_pct > 0 ? '+' : ''}${growth.observed_sales_change_pct}%` : 'N/A'}
              </div>
              <div className="text-[11px] text-stone-500 italic">
                Note: {growth?.label_disclaimer}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => window.print()} variant="outline" className="rounded-full text-xs">Print Report</Button>
            <Button onClick={handleExportCSV} className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white text-xs">Export CSV</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

