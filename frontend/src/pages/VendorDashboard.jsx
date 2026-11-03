import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { VENDOR_DASH } from '@/constants/testIds';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Sparkles, TrendingUp, Package, Eye, MousePointerClick, Store, ArrowRight,
  Building2, Rocket, Navigation, AlertTriangle, Zap, Cpu, Bot, MapPin, Loader2,
  Receipt, ShoppingBag, CheckCircle2, Clock, DollarSign, XCircle, RefreshCw, Banknote, ShieldCheck, Pencil
} from 'lucide-react';

export default function VendorDashboard() {
  const { user, refresh } = useAuth();
  const [products, setProducts] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLocked, setAnalyticsLocked] = useState(false);

  // Smart AI Hub States
  const [routeOpen, setRouteOpen] = useState(false);
  const [routeData, setRouteData] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);

  const [stockoutOpen, setStockoutOpen] = useState(false);
  const [stockoutData, setStockoutData] = useState(null);
  const [stockoutLoading, setStockoutLoading] = useState(false);

  const [demandOpen, setDemandOpen] = useState(false);
  const [demandData, setDemandData] = useState(null);
  const [demandLoading, setDemandLoading] = useState(false);

  const [forecastOpen, setForecastOpen] = useState(false);
  const [forecastData, setForecastData] = useState(null);
  const [forecastLoading, setForecastLoading] = useState(false);

  // Vendor In-App Orders & Billing States
  const [vendorOrders, setVendorOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderFilter, setOrderFilter] = useState('ALL');

  // Modals for Orders
  const [revisionModalOpen, setRevisionModalOpen] = useState(false);
  const [selectedOrderForRevision, setSelectedOrderForRevision] = useState(null);
  const [revisionItems, setRevisionItems] = useState([]);
  const [revisionCharges, setRevisionCharges] = useState(0);
  const [revisionDiscount, setRevisionDiscount] = useState(0);
  const [revisionNotes, setRevisionNotes] = useState('');
  const [revisionSubmitting, setRevisionSubmitting] = useState(false);

  const [cashModalOpen, setCashModalOpen] = useState(false);
  const [selectedOrderForCash, setSelectedOrderForCash] = useState(null);
  const [cashAmount, setCashAmount] = useState(0);
  const [cashNotes, setCashNotes] = useState('');
  const [cashSubmitting, setCashSubmitting] = useState(false);

  const loadVendorOrders = async () => {
    setOrdersLoading(true);
    try {
      const res = await api.get('/vendor/orders');
      setVendorOrders(res.data || []);
    } catch {
      // ignore
    } finally {
      setOrdersLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try { const { data } = await api.get('/vendor/products'); setProducts(data); } catch {}
      try { const { data } = await api.get('/vendor/analytics'); setAnalytics(data); }
      catch (e) { if (e.response?.status === 402) setAnalyticsLocked(true); }
      await loadVendorOrders();
      await refresh();
    })();
    // eslint-disable-next-line
  }, []);

  const handleQuickConfirm = async (orderId) => {
    try {
      await api.post(`/vendor/orders/${orderId}/confirm`, {
        action: 'CONFIRM',
        seller_notes: 'Order confirmed by seller'
      });
      toast.success('Order confirmed & price locked!');
      loadVendorOrders();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not confirm order');
    }
  };

  const handleQuickReject = async (orderId) => {
    try {
      await api.post(`/vendor/orders/${orderId}/confirm`, {
        action: 'REJECT',
        reason: 'Unable to fulfill this order at present'
      });
      toast.success('Order declined');
      loadVendorOrders();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not decline order');
    }
  };

  const handleMarkReady = async (orderId) => {
    try {
      await api.post(`/vendor/orders/${orderId}/mark-ready`);
      toast.success('Order marked ready for pickup!');
      loadVendorOrders();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not update order status');
    }
  };

  const openCashModal = (order) => {
    setSelectedOrderForCash(order);
    setCashAmount(order.total_amount);
    setCashNotes('Cash collected at shop');
    setCashModalOpen(true);
  };

  const handleConfirmCashCollection = async () => {
    if (!selectedOrderForCash) return;
    setCashSubmitting(true);
    try {
      await api.post(`/vendor/orders/${selectedOrderForCash.order_id}/collect-cash`, {
        amount_collected: parseFloat(cashAmount) || selectedOrderForCash.total_amount,
        notes: cashNotes
      });
      toast.success(`₹${cashAmount} cash recorded! Sale completed and attribution updated.`);
      setCashModalOpen(false);
      loadVendorOrders();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not record cash payment');
    } finally {
      setCashSubmitting(false);
    }
  };

  const openRevisionModal = (order) => {
    setSelectedOrderForRevision(order);
    setRevisionItems((order.items || []).map(it => ({
      product_id: it.product_id,
      name: it.name,
      quantity: it.quantity,
      unit_price: it.unit_price,
      reason: ''
    })));
    setRevisionCharges(order.additional_charges || 0);
    setRevisionDiscount(order.discount || 0);
    setRevisionNotes(order.seller_notes || '');
    setRevisionModalOpen(true);
  };

  const handleSubmitRevision = async () => {
    if (!selectedOrderForRevision) return;
    setRevisionSubmitting(true);
    try {
      await api.post(`/vendor/orders/${selectedOrderForRevision.order_id}/confirm`, {
        action: 'CONFIRM',
        revised_items: revisionItems.map(it => ({
          product_id: it.product_id,
          quantity: parseInt(it.quantity, 10),
          unit_price: parseFloat(it.unit_price),
          reason: it.reason || undefined
        })),
        additional_charges: parseFloat(revisionCharges) || 0,
        discount: parseFloat(revisionDiscount) || 0,
        seller_notes: revisionNotes
      });
      toast.success('Bill revision locked and sent to customer!');
      setRevisionModalOpen(false);
      loadVendorOrders();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not update bill');
    } finally {
      setRevisionSubmitting(false);
    }
  };

  const handleFetchRoute = async () => {
    setRouteLoading(true);
    setRouteOpen(true);
    try {
      const res = await api.post('/ai/route-recommendation');
      setRouteData(res.data);
    } catch {
      toast.error('Could not compute smart route recommendation.');
    } finally {
      setRouteLoading(false);
    }
  };

  const handleFetchStockouts = async () => {
    setStockoutLoading(true);
    setStockoutOpen(true);
    try {
      const res = await api.get('/vendor/stockout-prediction');
      setStockoutData(res.data);
    } catch {
      toast.error('Could not fetch stockout predictions.');
    } finally {
      setStockoutLoading(false);
    }
  };

  const handleFetchDemand = async () => {
    setDemandLoading(true);
    setDemandOpen(true);
    try {
      const res = await api.get('/mobile/demand-matching');
      setDemandData(res.data);
    } catch {
      toast.error('Could not load nearby demand matching.');
    } finally {
      setDemandLoading(false);
    }
  };

  const handleFetchForecast = async () => {
    setForecastLoading(true);
    setForecastOpen(true);
    try {
      const res = await api.post('/ai/demand-forecast?category=Vegetables');
      setForecastData(res.data);
    } catch {
      toast.error('Could not load 7-day demand forecast.');
    } finally {
      setForecastLoading(false);
    }
  };

  if (!user) return null;

  const daysLeft = user.days_left ?? 0;
  const isPro = user.is_pro;
  const trialActive = user.trial_active;
  const productLimit = user.product_limit; // null if pro/trial
  const canAddMore = productLimit == null || products.length < productLimit;

  return (
    <div data-testid={VENDOR_DASH.container} className="max-w-7xl mx-auto px-5 md:px-8 py-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <span className="chip chip-amber"><Store size={12} /> {user.shop_name}</span>
          <h1 className="font-display text-3xl md:text-4xl font-semibold text-stone-900 mt-3">Namaste, {user.name?.split(' ')[0]} 👋</h1>
          <p className="text-stone-600 text-sm mt-1">Update prices, toggle availability and watch the shoppers roll in.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isPro ? (
            <>
              <Badge data-testid={VENDOR_DASH.trialBadge} className="bg-emerald-600 hover:bg-emerald-600 text-white border-0">Pro plan active</Badge>
              <Link to="/vendor/pricing"><Button variant="outline" size="sm" className="rounded-full text-xs">Payments & UPI QR</Button></Link>
            </>
          ) : (
            <>
              <Badge data-testid={VENDOR_DASH.trialBadge} className="bg-amber-100 text-amber-900 hover:bg-amber-100 border-0">
                {trialActive ? `Free trial · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : 'Trial ended'}
              </Badge>
              <Link to="/vendor/pricing"><Button data-testid={VENDOR_DASH.upgradeButton} className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white"><Rocket size={14} className="mr-1.5" /> Pay via UPI QR / Upgrade</Button></Link>
            </>
          )}
        </div>
      </div>

      {/* Trial progress */}
      {!isPro && trialActive && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center justify-between text-sm">
            <div className="text-stone-800"><span className="font-semibold">{daysLeft}</span> of 30 days remaining</div>
            <Link to="/vendor/pricing" className="text-amber-800 font-medium text-xs hover:underline">Lock in Pro at ₹199/mo →</Link>
          </div>
          <Progress value={((30 - daysLeft) / 30) * 100} className="mt-3" />
        </div>
      )}

      {/* HyperLocal Sales Impact & Attribution Banner */}
      <div className="mt-8 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-900 via-stone-900 to-emerald-950 p-6 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-sm">
        <div className="space-y-1.5 max-w-xl">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-medium border border-emerald-400/30">
            <TrendingUp size={12} /> Sales Impact Engine
          </div>
          <h2 className="text-xl md:text-2xl font-display font-semibold text-white">How many customers did HyperLocal bring to your shop?</h2>
          <p className="text-stone-300 text-sm">
            Track walk-ins, customer attribution, verified purchases, and compare your before-vs-after sales growth with full confidence.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/vendor/analytics">
            <Button className="rounded-full bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-semibold shadow-md">
              Open Impact Dashboard <ArrowRight size={15} className="ml-1.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* SMART AI VENDOR HUB */}
      <div className="mt-6 bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 grid place-items-center">
              <Cpu size={15} />
            </div>
            <div>
              <div className="text-sm font-semibold text-stone-900">Smart AI Vendor Hub</div>
              <div className="text-xs text-stone-500">Autonomous intelligence, voice inventory, routes, demand matching & stockout warnings</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.dispatchEvent(new CustomEvent('open_ai_copilot', { detail: { voice: true } }))}
              className="rounded-full border-emerald-600 text-[#0A6E3B] hover:bg-emerald-50 text-xs h-7"
              data-testid="vendor-open-voice-copilot"
            >
              🔊 Ask AI Copilot (Voice & Text)
            </Button>
            <Link to="/vendor/products">
              <Button size="sm" className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white text-xs h-7">
                🎙 Add Product Using Voice
              </Button>
            </Link>
            <Badge variant="outline" className="text-[11px] text-emerald-700 border-emerald-300 bg-emerald-50 w-fit">
              AI Tiers 1 & 2 Active
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          {/* Action 1: Mobile Route */}
          <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 flex flex-col justify-between">
            <div>
              <div className="text-xs font-semibold text-stone-800 flex items-center gap-1.5">
                <Navigation size={13} className="text-blue-600" />
                Smart Cart Route
              </div>
              <p className="text-[11px] text-stone-500 mt-1">Multi-stop routes intersecting high-demand customer hotspots.</p>
            </div>
            <Button size="sm" variant="outline" onClick={handleFetchRoute} className="mt-3 text-xs h-8 rounded-lg border-stone-300 w-full">
              Optimize Route
            </Button>
          </div>

          {/* Action 2: Nearby Demand */}
          <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 flex flex-col justify-between">
            <div>
              <div className="text-xs font-semibold text-stone-800 flex items-center gap-1.5">
                <MapPin size={13} className="text-emerald-600" />
                Nearby Demand Matches
              </div>
              <p className="text-[11px] text-stone-500 mt-1">Open 'I Need' requests from shoppers within 3-5 km.</p>
            </div>
            <Button size="sm" variant="outline" onClick={handleFetchDemand} className="mt-3 text-xs h-8 rounded-lg border-stone-300 w-full">
              View Open Requests
            </Button>
          </div>

          {/* Action 3: Stockout Risk */}
          <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 flex flex-col justify-between">
            <div>
              <div className="text-xs font-semibold text-stone-800 flex items-center gap-1.5">
                <AlertTriangle size={13} className="text-amber-600" />
                Stockout Predictor
              </div>
              <p className="text-[11px] text-stone-500 mt-1">Items at risk of running out of stock within 24-48 hours.</p>
            </div>
            <Button size="sm" variant="outline" onClick={handleFetchStockouts} className="mt-3 text-xs h-8 rounded-lg border-stone-300 w-full">
              Check Stockout Risks
            </Button>
          </div>

          {/* Action 4: Demand Forecast */}
          <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 flex flex-col justify-between">
            <div>
              <div className="text-xs font-semibold text-stone-800 flex items-center gap-1.5">
                <TrendingUp size={13} className="text-purple-600" />
                7-Day Demand Trend
              </div>
              <p className="text-[11px] text-stone-500 mt-1">Forward-looking category sales projections.</p>
            </div>
            <Button size="sm" variant="outline" onClick={handleFetchForecast} className="mt-3 text-xs h-8 rounded-lg border-stone-300 w-full">
              View 7-Day Forecast
            </Button>
          </div>
        </div>
      </div>

      {/* SMART ROUTE MODAL */}
      <Dialog open={routeOpen} onOpenChange={setRouteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Navigation size={18} className="text-blue-600" />
              AI Route Recommendation
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            {routeLoading && <div className="text-center py-6 text-stone-500">Computing optimal waypoints...</div>}
            {!routeLoading && routeData && (
              <div className="space-y-3">
                <div className="p-2.5 bg-blue-50 text-blue-900 rounded-lg">
                  {routeData.rationale}
                </div>
                <div className="space-y-2">
                  <div className="font-semibold text-stone-700">Recommended Waypoint Stops:</div>
                  {(routeData.route || []).map((st) => (
                    <div key={st.stop} className="p-2.5 bg-stone-50 rounded-lg border border-stone-200 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-stone-900">Stop {st.stop}: {st.name}</div>
                        <div className="text-stone-500 text-[11px]">{st.expected_demand}</div>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        Dwell: {st.suggested_dwell_mins}m
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* STOCKOUT ALERTS MODAL */}
      <Dialog open={stockoutOpen} onOpenChange={setStockoutOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle size={18} className="text-amber-600" />
              Stockout Risk Assessment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            {stockoutLoading && <div className="text-center py-6 text-stone-500">Evaluating velocity logs...</div>}
            {!stockoutLoading && stockoutData && (
              <div className="space-y-2">
                <div className="text-stone-600 font-medium">
                  {stockoutData.at_risk_count} items requiring prompt restocking out of {stockoutData.total_items_checked} products:
                </div>
                {(stockoutData.stockout_alerts || []).length === 0 ? (
                  <div className="p-4 bg-emerald-50 text-emerald-800 rounded-lg text-center">
                    All items have healthy inventory levels! No immediate stockout risk.
                  </div>
                ) : (
                  (stockoutData.stockout_alerts || []).map((al, idx) => (
                    <div key={idx} className="p-2.5 bg-amber-50/60 border border-amber-200 rounded-lg flex items-center justify-between">
                      <div>
                        <div className="font-medium text-stone-900">{al.product_name}</div>
                        <div className="text-stone-500 text-[11px]">Stock: {al.current_stock} units · ~{al.estimated_days_remaining} days left</div>
                      </div>
                      <Badge className={al.risk_level === 'CRITICAL' ? 'bg-rose-600 text-white text-[10px]' : 'bg-amber-600 text-white text-[10px]'}>
                        {al.risk_level}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* NEARBY DEMAND MODAL */}
      <Dialog open={demandOpen} onOpenChange={setDemandOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <MapPin size={18} className="text-emerald-600" />
              Nearby Open Demand Requests
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            {demandLoading && <div className="text-center py-6 text-stone-500">Scanning customer requests...</div>}
            {!demandLoading && demandData && (
              <div className="space-y-2">
                <div className="text-stone-600 font-medium">
                  {demandData.matched_requests_count} customer requests in your area:
                </div>
                {(demandData.requests || []).length === 0 ? (
                  <div className="p-4 bg-stone-50 text-stone-500 rounded-lg text-center">
                    No open customer demand requests nearby right now.
                  </div>
                ) : (
                  (demandData.requests || []).map((req) => (
                    <div key={req.id} className="p-2.5 bg-stone-50 border border-stone-200 rounded-lg space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-stone-900">{req.product_name} ({req.quantity})</span>
                        {req.max_price && <span className="font-semibold text-emerald-700">Max ₹{req.max_price}</span>}
                      </div>
                      {req.notes && <div className="text-stone-500 text-[11px]">"{req.notes}"</div>}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 7-DAY DEMAND FORECAST MODAL */}
      <Dialog open={forecastOpen} onOpenChange={setForecastOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <TrendingUp size={18} className="text-purple-600" />
              7-Day Predictive Demand Forecast
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            {forecastLoading && <div className="text-center py-6 text-stone-500">Computing forecast...</div>}
            {!forecastLoading && forecastData && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  {(forecastData.forecast || []).map((f, i) => (
                    <div key={i} className="p-2 bg-stone-50 rounded border border-stone-200 flex items-center justify-between">
                      <span className="font-medium text-stone-800">{f.day} ({f.date})</span>
                      <span className="font-semibold text-purple-700">{f.predicted_demand_units} units projected</span>
                    </div>
                  ))}
                </div>
                <div className="text-[10px] text-stone-400 italic">
                  {forecastData.disclaimer}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* IN-APP ORDERS & BILLING COMMAND CENTER */}
      <div id="orders" className="mt-8 bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-[#0A6E3B] grid place-items-center">
              <Receipt size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-display font-semibold text-stone-900">In-App Customer Orders & Billing</h2>
                <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-800 border-emerald-200">
                  {vendorOrders.length} {vendorOrders.length === 1 ? 'order' : 'orders'}
                </Badge>
              </div>
              <p className="text-xs text-stone-500 mt-0.5">
                Lock prices, confirm bills, fulfill orders, and record cash payments with automated sales attribution.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadVendorOrders}
              disabled={ordersLoading}
              className="text-xs rounded-full border-stone-200 text-stone-600 hover:text-stone-900"
            >
              <RefreshCw size={13} className={`mr-1.5 ${ordersLoading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <Link to="/vendor/analytics">
              <Button size="sm" variant="ghost" className="text-xs text-emerald-700 hover:text-emerald-800">
                Sales Attribution & Impact →
              </Button>
            </Link>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap gap-2 mt-4 pb-1">
          {[
            { id: 'ALL', label: 'All Orders' },
            { id: 'PENDING', label: `Pending Confirmation (${vendorOrders.filter(o => o.order_status === 'PENDING_SELLER_CONFIRMATION').length})` },
            { id: 'CONFIRMED', label: `Confirmed (${vendorOrders.filter(o => o.order_status === 'CONFIRMED').length})` },
            { id: 'READY', label: `Ready for Pickup (${vendorOrders.filter(o => o.order_status === 'READY_FOR_PICKUP').length})` },
            { id: 'COMPLETED', label: `Completed (${vendorOrders.filter(o => o.order_status === 'COMPLETED').length})` },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setOrderFilter(tab.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                orderFilter === tab.id
                  ? 'bg-stone-900 text-white shadow-sm'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Orders List */}
        <div className="mt-4 space-y-3">
          {ordersLoading && vendorOrders.length === 0 && (
            <div className="py-12 text-center text-xs text-stone-400">Loading incoming orders...</div>
          )}

          {!ordersLoading && vendorOrders.length === 0 && (
            <div className="p-8 text-center bg-stone-50 rounded-xl border border-dashed border-stone-200 text-stone-500 text-xs">
              <ShoppingBag size={24} className="mx-auto text-stone-300 mb-2" />
              No customer orders received yet. When customers add your items to their HyperLocal cart and checkout, they will appear here in real-time.
            </div>
          )}

          {vendorOrders
            .filter(o => {
              if (orderFilter === 'ALL') return true;
              if (orderFilter === 'PENDING') return o.order_status === 'PENDING_SELLER_CONFIRMATION';
              if (orderFilter === 'CONFIRMED') return o.order_status === 'CONFIRMED';
              if (orderFilter === 'READY') return o.order_status === 'READY_FOR_PICKUP';
              if (orderFilter === 'COMPLETED') return o.order_status === 'COMPLETED';
              return true;
            })
            .map(order => (
              <div key={order.order_id || order.id} className="p-4 rounded-xl border border-stone-200 bg-white hover:border-emerald-300 transition-all shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-stone-100">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-stone-900">{order.order_id}</span>
                    <Badge className={
                      order.order_status === 'PENDING_SELLER_CONFIRMATION' ? 'bg-amber-100 text-amber-900 border-amber-200 text-[10px]' :
                      order.order_status === 'CONFIRMED' ? 'bg-blue-100 text-blue-900 border-blue-200 text-[10px]' :
                      order.order_status === 'READY_FOR_PICKUP' ? 'bg-indigo-100 text-indigo-900 border-indigo-200 text-[10px]' :
                      order.order_status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-900 border-emerald-200 text-[10px]' :
                      'bg-stone-100 text-stone-700 text-[10px]'
                    }>
                      {order.order_status?.replace(/_/g, ' ')}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] text-stone-600">
                      {order.checkout_mode === 'RESERVE_AT_SHOP' ? 'Mode A: Pay at Shop' : 'Mode B: Online'}
                    </Badge>
                    <Badge className={order.payment_status === 'PAID' ? 'bg-emerald-600 text-white text-[10px]' : 'bg-amber-500 text-white text-[10px]'}>
                      {order.payment_status === 'PAID' ? 'PAID' : 'PAYMENT DUE'}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-stone-400">
                    {order.created_at ? new Date(order.created_at).toLocaleString() : ''}
                  </div>
                </div>

                <div className="py-3 flex flex-col md:flex-row justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="text-xs text-stone-700">
                      Customer: <strong>{order.customer_name || 'HyperLocal Shopper'}</strong>
                      {order.customer_phone && <span className="text-stone-500 ml-2">({order.customer_phone})</span>}
                    </div>
                    {order.customer_notes && (
                      <div className="text-[11px] text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-100">
                        Customer note: "{order.customer_notes}"
                      </div>
                    )}
                    <div className="text-xs text-stone-600 space-y-1 mt-2">
                      <div className="font-medium text-stone-800 text-[11px] uppercase tracking-wider">Ordered Items:</div>
                      {(order.items || []).map((it, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs bg-stone-50 px-2 py-1 rounded border border-stone-100">
                          <span>{it.quantity}x {it.name}</span>
                          <span className="font-mono text-stone-900 font-medium">₹{it.line_total || (it.quantity * it.unit_price)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="sm:text-right border-t md:border-t-0 md:border-l border-stone-100 pt-3 md:pt-0 md:pl-4 flex flex-col justify-between min-w-[200px]">
                    <div>
                      <div className="text-xs text-stone-500">Total Order Bill</div>
                      <div className="text-2xl font-bold font-display text-emerald-800">
                        ₹{order.total_amount?.toFixed(2) || '0.00'}
                      </div>
                      {order.discount > 0 && <div className="text-[11px] text-emerald-600">Incl. ₹{order.discount} discount</div>}
                      {order.additional_charges > 0 && <div className="text-[11px] text-stone-500">+ ₹{order.additional_charges} charges</div>}
                    </div>

                    {/* Action buttons */}
                    <div className="mt-3 flex flex-wrap gap-1.5 justify-end">
                      {order.order_status === 'PENDING_SELLER_CONFIRMATION' && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleQuickConfirm(order.order_id)}
                            className="bg-[#0A6E3B] hover:bg-[#075030] text-white text-xs rounded-full h-8"
                          >
                            <CheckCircle2 size={13} className="mr-1" /> Confirm & Lock Price
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openRevisionModal(order)}
                            className="text-xs rounded-full h-8 border-stone-300"
                          >
                            <Pencil size={13} className="mr-1" /> Adjust Bill
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleQuickReject(order.order_id)}
                            className="text-xs text-red-600 hover:text-red-700 h-8"
                          >
                            Decline
                          </Button>
                        </>
                      )}

                      {order.order_status === 'CONFIRMED' && (
                        <Button
                          size="sm"
                          onClick={() => handleMarkReady(order.order_id)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded-full h-8"
                        >
                          <Clock size={13} className="mr-1" /> Mark Ready for Pickup
                        </Button>
                      )}

                      {order.payment_status !== 'PAID' && order.order_status !== 'CANCELLED' && (
                        <Button
                          size="sm"
                          onClick={() => openCashModal(order)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-full h-8"
                        >
                          <Banknote size={13} className="mr-1" /> Collect Cash (₹{order.total_amount})
                        </Button>
                      )}

                      {order.order_status === 'COMPLETED' && (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
                          <CheckCircle2 size={14} /> Completed & Attributed
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* CASH COLLECTION MODAL */}
      <Dialog open={cashModalOpen} onOpenChange={setCashModalOpen}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Banknote size={18} className="text-emerald-700" />
              Collect Cash & Finalize Sale
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Confirm cash received from shopper at shop counter. This automatically marks the order COMPLETED, issues a finalized digital invoice, and sends the verified sale to the HyperLocal Attribution Engine.
            </DialogDescription>
          </DialogHeader>

          {selectedOrderForCash && (
            <div className="space-y-4 py-2 text-xs">
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-1">
                <div className="flex justify-between">
                  <span className="text-stone-500">Order ID:</span>
                  <span className="font-mono font-medium">{selectedOrderForCash.order_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">Customer:</span>
                  <span className="font-medium">{selectedOrderForCash.customer_name || 'Shopper'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">Total Billed:</span>
                  <span className="font-bold text-emerald-800 text-sm">₹{selectedOrderForCash.total_amount}</span>
                </div>
              </div>

              <div>
                <Label className="text-xs">Amount Collected in Cash (₹)</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs">Vendor Receipt Notes</Label>
                <Input
                  type="text"
                  value={cashNotes}
                  onChange={(e) => setCashNotes(e.target.value)}
                  placeholder="e.g. Paid in full at store counter"
                  className="mt-1"
                />
              </div>

              <div className="p-2.5 bg-emerald-50 rounded-lg text-emerald-800 text-[11px] flex items-center gap-2 border border-emerald-200">
                <ShieldCheck size={14} className="shrink-0" />
                This sale will automatically reflect in your Daily Sales & Attribution analytics with zero manual double counting.
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setCashModalOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              onClick={handleConfirmCashCollection}
              disabled={cashSubmitting}
              className="bg-[#0A6E3B] hover:bg-[#075030] text-white"
            >
              {cashSubmitting ? 'Recording…' : 'Record Cash & Finalize'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BILL REVISION & PRICE LOCK MODAL */}
      <Dialog open={revisionModalOpen} onOpenChange={setRevisionModalOpen}>
        <DialogContent className="max-w-lg bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Pencil size={18} className="text-[#0A6E3B]" />
              Adjust Bill & Lock Price
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Modify item quantities, unit prices, or apply discounts if needed. The updated bill will be locked and customer can review it.
            </DialogDescription>
          </DialogHeader>

          {selectedOrderForRevision && (
            <div className="space-y-4 py-2 text-xs">
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {revisionItems.map((it, idx) => (
                  <div key={idx} className="p-2.5 bg-stone-50 rounded-lg border border-stone-200 space-y-2">
                    <div className="font-medium text-stone-900">{it.name}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[11px]">Quantity</Label>
                        <Input
                          type="number"
                          min="1"
                          value={it.quantity}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRevisionItems(prev => prev.map((item, i) => i === idx ? { ...item, quantity: val } : item));
                          }}
                          className="h-8 text-xs mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px]">Unit Price (₹)</Label>
                        <Input
                          type="number"
                          step="0.5"
                          value={it.unit_price}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRevisionItems(prev => prev.map((item, i) => i === idx ? { ...item, unit_price: val } : item));
                          }}
                          className="h-8 text-xs mt-1"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-stone-100">
                <div>
                  <Label className="text-[11px]">Additional Charges (₹)</Label>
                  <Input
                    type="number"
                    value={revisionCharges}
                    onChange={(e) => setRevisionCharges(e.target.value)}
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px]">Special Discount (₹)</Label>
                  <Input
                    type="number"
                    value={revisionDiscount}
                    onChange={(e) => setRevisionDiscount(e.target.value)}
                    className="h-8 text-xs mt-1"
                  />
                </div>
              </div>

              <div>
                <Label className="text-[11px]">Note to Shopper</Label>
                <Textarea
                  value={revisionNotes}
                  onChange={(e) => setRevisionNotes(e.target.value)}
                  placeholder="e.g. Adjusted price per fresh stock arrival"
                  rows={2}
                  className="text-xs mt-1"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setRevisionModalOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              onClick={handleSubmitRevision}
              disabled={revisionSubmitting}
              className="bg-[#0A6E3B] hover:bg-[#075030] text-white"
            >
              {revisionSubmitting ? 'Locking…' : 'Lock Price & Update Bill'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bento grid */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <StatCard label="Products live" value={products.length} icon={<Package size={16} />} sub={productLimit ? `${products.length}/${productLimit} used` : 'Unlimited'} />
        <StatCard label="Total views" value={analytics?.total_views ?? '—'} icon={<Eye size={16} />} locked={analyticsLocked} />
        <StatCard label="Total clicks" value={analytics?.total_clicks ?? '—'} icon={<MousePointerClick size={16} />} locked={analyticsLocked} />
        <StatCard label="Click-through" value={analytics ? `${analytics.ctr}%` : '—'} icon={<TrendingUp size={16} />} locked={analyticsLocked} />

        {/* Manage products */}
        <div className="md:col-span-2 rounded-2xl border border-stone-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="eyebrow text-stone-500">Product list</div>
              <div className="font-display text-xl font-semibold text-stone-900 mt-1">{products.length} products</div>
            </div>
            <div className="flex gap-2">
              <Link to="/vendor/products">
                <Button data-testid={VENDOR_DASH.addProductButton} disabled={!canAddMore} className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white">
                  {canAddMore ? 'Manage products' : 'Upgrade to add more'}
                </Button>
              </Link>
            </div>
          </div>
          <div className="mt-5 space-y-2 max-h-64 overflow-auto">
            {products.slice(0, 6).map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-stone-50 border border-stone-100">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-stone-900 truncate">{p.name}</div>
                  <div className="text-xs text-stone-500">₹{p.price}{p.unit ? `/${p.unit}` : ''}</div>
                </div>
                <Badge className={`${p.in_stock ? 'bg-emerald-100 text-emerald-900 hover:bg-emerald-100' : 'bg-stone-200 text-stone-700 hover:bg-stone-200'} border-0`}>
                  {p.in_stock ? 'Live' : 'Off'}
                </Badge>
              </div>
            ))}
            {products.length === 0 && <div className="text-sm text-stone-500 text-center py-8">No products yet. <Link to="/vendor/products" className="text-[#0A6E3B] font-medium">Add your first →</Link></div>}
          </div>
        </div>

        {/* Analytics / upsell */}
        <div data-testid={VENDOR_DASH.analyticsCard} className="md:col-span-2 rounded-2xl border border-stone-200 bg-white p-6">
          <div className="eyebrow text-stone-500">Top viewed products</div>
          {analyticsLocked ? (
            <div className="mt-4 text-center">
              <div className="w-12 h-12 rounded-full bg-amber-50 grid place-items-center mx-auto text-amber-700"><Sparkles size={18} /></div>
              <div className="font-display text-lg font-semibold text-stone-900 mt-3">Unlock analytics</div>
              <p className="text-stone-500 text-sm mt-1">See per-product views, clicks and CTR — Pro only.</p>
              <Link to="/vendor/pricing"><Button className="mt-4 rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white">Upgrade for ₹199/mo</Button></Link>
            </div>
          ) : analytics && analytics.per_product?.length ? (
            <div className="mt-4 space-y-2">
              {analytics.per_product.slice(0, 5).map((p) => (
                <div key={p.id} className="flex items-center justify-between p-2 border-b border-stone-100 last:border-0">
                  <div className="text-sm text-stone-900 truncate max-w-[60%]">{p.name}</div>
                  <div className="flex gap-3 text-xs text-stone-600"><span className="inline-flex items-center gap-1"><Eye size={11} /> {p.views}</span><span className="inline-flex items-center gap-1"><MousePointerClick size={11} /> {p.clicks}</span></div>
                </div>
              ))}
            </div>
          ) : <div className="text-stone-500 text-sm mt-4">No data yet.</div>}
        </div>

        {/* Branches */}
        <div data-testid={VENDOR_DASH.branchesCard} className="md:col-span-4 rounded-2xl border border-stone-200 bg-gradient-to-br from-emerald-50 via-white to-amber-50 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-white border border-stone-200 grid place-items-center text-[#0A6E3B]"><Building2 size={18} /></div>
            <div>
              <div className="font-display text-lg font-semibold text-stone-900">Multi-branch listings {!isPro && <span className="text-xs font-normal text-amber-800">(Pro)</span>}</div>
              <div className="text-stone-600 text-sm">Manage multiple outlets under a single account. Pro only.</div>
            </div>
          </div>
          <Link to="/vendor/branches"><Button variant="outline" className="rounded-full border-stone-300">Manage branches <ArrowRight size={14} className="ml-1" /></Button></Link>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, sub, locked }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div className="eyebrow text-stone-500">{label}</div>
        <div className="text-stone-400">{icon}</div>
      </div>
      <div className={`mt-3 font-display text-3xl font-semibold ${locked ? 'text-stone-300' : 'text-stone-900'}`}>{locked ? '—' : value}</div>
      {sub && <div className="text-xs text-stone-500 mt-1">{sub}</div>}
      {locked && <div className="text-[11px] text-amber-800 mt-1">🔒 Pro feature</div>}
    </div>
  );
}
