import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
  Receipt, ShoppingBag, CheckCircle2, Clock, DollarSign, XCircle, RefreshCw, Banknote, ShieldCheck, Pencil,
  Power, MessageSquare, HelpCircle, QrCode, Layers, UserCheck, Copy
} from 'lucide-react';

export default function VendorDashboard() {
  const { user, refresh } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'home';
  const [products, setProducts] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLocked, setAnalyticsLocked] = useState(false);

  // Mobile Cart & Daily Operations States (Part 6 & Part 7)
  const [sellingBusy, setSellingBusy] = useState(false);
  const [copyingInventory, setCopyingInventory] = useState(false);
  const [customStopName, setCustomStopName] = useState('');
  const [gpsStatusText, setGpsStatusText] = useState('');

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

  // Commerce OS Merchant Growth & Monetization States (Points 10-16, 20-21, 28)
  const [revenueHero, setRevenueHero] = useState(null);
  const [demandGaps, setDemandGaps] = useState(null);
  const [crmAnalytics, setCrmAnalytics] = useState(null);
  const [mobileCartDash, setMobileCartDash] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [qrCodes, setQrCodes] = useState([]);
  const [adModalOpen, setAdModalOpen] = useState(false);
  const [adForm, setAdForm] = useState({
    campaign_name: '',
    campaign_type: 'FEATURED_SHOP_CARD',
    daily_budget_inr: 50,
    total_budget_inr: 500,
    billing_model: 'CPC',
    bid_amount_inr: 5,
    duration_days: 7,
  });

  const loadCommerceOSPanels = async () => {
    try { const { data } = await api.get('/vendor/revenue-hero'); setRevenueHero(data); } catch {}
    try { const { data } = await api.get('/vendor/demand-gaps'); setDemandGaps(data); } catch {}
    try { const { data } = await api.get('/vendor/crm-analytics'); setCrmAnalytics(data); } catch {}
    try { const { data } = await api.get('/vendor/mobile-cart/dashboard'); setMobileCartDash(data); } catch {}
    try { const { data } = await api.get('/vendor/campaigns'); setCampaigns(data.campaigns || []); } catch {}
    try { const { data } = await api.get('/vendor/qr-codes'); setQrCodes(data.qr_codes || []); } catch {}
  };

  const handleUpdateCartStatus = async (status, currentStopName) => {
    try {
      await api.post('/vendor/mobile-cart/status', {
        cart_status: status,
        current_stop_name: currentStopName || mobileCartDash?.current_stop_name || user?.address || 'Main Chowk',
        eta_next_stop_mins: 15,
      });
      toast.success(`Cart status updated to ${status}`);
      loadCommerceOSPanels();
    } catch {
      toast.error('Failed to update cart status');
    }
  };

  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    try {
      await api.post('/vendor/campaigns', {
        ...adForm,
        daily_budget_inr: parseFloat(adForm.daily_budget_inr) || 50,
        total_budget_inr: parseFloat(adForm.total_budget_inr) || 500,
        bid_amount_inr: parseFloat(adForm.bid_amount_inr) || 5,
        duration_days: parseInt(adForm.duration_days, 10) || 7,
      });
      toast.success('Sponsored campaign launched!');
      setAdModalOpen(false);
      loadCommerceOSPanels();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not launch campaign');
    }
  };

  const handleGenerateQr = async (qrType) => {
    try {
      await api.post('/vendor/qr-codes/generate', { qr_type: qrType, label: `${user?.shop_name || 'Shop'} ${qrType}` });
      toast.success(`Generated ${qrType} QR code!`);
      loadCommerceOSPanels();
    } catch {
      toast.error('Failed to generate QR code');
    }
  };

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
      await loadCommerceOSPanels();
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

  const handleStartStopSelling = async (targetOnline) => {
    setSellingBusy(true);
    try {
      let lat = user?.lat;
      let lng = user?.lng;
      if (targetOnline && navigator.geolocation) {
        try {
          const pos = await new Promise((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4500 })
          );
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
          setGpsStatusText(`Live GPS updated (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
        } catch {
          setGpsStatusText('Using saved shop/cart coordinates');
        }
      }
      await api.patch('/vendor/profile', {
        is_online: targetOnline,
        ...(lat != null && lng != null ? { lat, lng } : {}),
      });
      if (user?.vendor_type === 'cart_vendor') {
        await api.post('/vendor/mobile-cart/status', {
          cart_status: targetOnline ? 'AT_HOTSPOT' : 'CLOSED_TODAY',
          current_stop_name: customStopName || mobileCartDash?.current_stop_name || user?.address || 'Main Chowk',
          eta_next_stop_mins: 15,
        });
      }
      toast.success(
        targetOnline
          ? (user?.vendor_type === 'cart_vendor' ? 'You are now LIVE! Nearby shoppers can see your cart.' : 'Shop marked OPEN for nearby shoppers!')
          : (user?.vendor_type === 'cart_vendor' ? 'Stopped selling for now. Cart hidden from live map.' : 'Shop marked CLOSED.')
      );
      await loadCommerceOSPanels();
      await refresh();
    } catch {
      toast.error('Could not update selling status');
    } finally {
      setSellingBusy(false);
    }
  };

  const handleCopyYesterdayInventory = async () => {
    setCopyingInventory(true);
    try {
      const { data } = await api.post('/vendor/inventory/copy-previous');
      toast.success(`Restored & refreshed ${data.refreshed_count ?? products.length} products for today!`);
      const prodRes = await api.get('/vendor/products');
      setProducts(prodRes.data || []);
    } catch {
      toast.error('Could not copy previous inventory');
    } finally {
      setCopyingInventory(false);
    }
  };

  const handleFetchRoute = async () => {
    setRouteLoading(true);
    setRouteOpen(true);
    try {
      const res = await api.post('/ai/route-recommendation');
      setRouteData(res.data);
    } catch (err) {
      if (err.response?.status === 402) {
        setRouteData({ pro_locked: true, detail: err.response?.data?.detail });
      } else {
        toast.error('Could not compute smart route recommendation.');
      }
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
    } catch (err) {
      if (err.response?.status === 402) {
        setStockoutData({ pro_locked: true, detail: err.response?.data?.detail });
      } else {
        toast.error('Could not fetch stockout predictions.');
      }
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
    } catch (err) {
      if (err.response?.status === 402) {
        setForecastData({ pro_locked: true, detail: err.response?.data?.detail });
      } else {
        toast.error('Could not load 7-day demand forecast.');
      }
    } finally {
      setForecastLoading(false);
    }
  };

  if (!user) return null;

  const isCartVendor = user.vendor_type === 'cart_vendor';
  const isOnlineNow = Boolean(user.is_online) && mobileCartDash?.cart_status !== 'CLOSED_TODAY';
  const daysLeft = user.days_left ?? 0;
  const isPro = user.is_pro;
  const trialActive = user.trial_active;
  const hasProAccess = Boolean(user.has_pro_access ?? (isPro || trialActive));
  const freeCap = user.free_product_cap ?? (isCartVendor ? 20 : 30);
  const productLimit = user.product_limit; // null if pro/trial
  const activeProductsCount = products.filter(p => p.in_stock !== false && p.listing_status !== 'paused_by_cap').length;
  const outOfStockCount = products.filter(p => !p.in_stock).length;
  const pendingOrdersCount = vendorOrders.filter(o => o.order_status === 'PENDING_SELLER_CONFIRMATION').length;
  const canAddMore = productLimit == null || activeProductsCount < productLimit;
  const proPlanPriceLabel = isCartVendor ? '₹99/mo' : '₹199/mo';

  const showHome = activeTab === 'home' || activeTab === 'all';
  const showOrders = activeTab === 'orders' || activeTab === 'customers' || activeTab === 'all';
  const showGrowth = activeTab === 'growth' || activeTab === 'all';
  const showMore = activeTab === 'more' || activeTab === 'all';

  return (
    <div data-testid={VENDOR_DASH.container} className="max-w-7xl mx-auto px-5 md:px-8 py-8 pb-24">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <span className="chip chip-amber">
            {isCartVendor ? <Navigation size={12} /> : <Store size={12} />} {user.shop_name}
            <span className="ml-1.5 text-[10px] opacity-75">({isCartVendor ? 'Mobile Cart Vendor' : 'Retailer Shop'})</span>
          </span>
          <h1 className="font-display text-3xl md:text-4xl font-semibold text-stone-900 mt-3">Namaste, {user.name?.split(' ')[0]} 👋</h1>
          <p className="text-stone-600 text-sm mt-1">
            {isCartVendor
              ? 'Tap Start Selling to broadcast your live location, update prices in seconds, and serve nearby customers.'
              : 'Your daily shop checklist — manage products, confirm customer orders, and grow neighbourhood walk-ins.'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isPro ? (
            <>
              <Badge data-testid={VENDOR_DASH.trialBadge} className="bg-emerald-600 hover:bg-emerald-600 text-white border-0">Pro plan active</Badge>
              <Link to="/vendor/pricing"><Button variant="outline" size="sm" className="rounded-full text-xs">Subscription & Billing</Button></Link>
            </>
          ) : (
            <>
              <Badge data-testid={VENDOR_DASH.trialBadge} className="bg-amber-100 text-amber-900 hover:bg-amber-100 border-0">
                {trialActive ? `Free 30-Day Pro Trial · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : `Free Plan (Up to ${freeCap} Active Products)`}
              </Badge>
              <Link to="/vendor/pricing">
                <Button data-testid={VENDOR_DASH.upgradeButton} className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white">
                  <Rocket size={14} className="mr-1.5" /> Upgrade ({proPlanPriceLabel})
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Trial progress */}
      {!isPro && trialActive && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center justify-between text-sm">
            <div className="text-stone-800"><span className="font-semibold">{daysLeft}</span> of 30 Pro trial days remaining</div>
            <Link to="/vendor/pricing" className="text-amber-800 font-medium text-xs hover:underline">
              Keep Pro at {proPlanPriceLabel} →
            </Link>
          </div>
          <Progress value={((30 - daysLeft) / 30) * 100} className="mt-2.5" />
        </div>
      )}

      {/* Layer A / Layer B 5-Section Progressive Disclosure Navigation Bar (Part 3.2 & Rule 5) */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 bg-stone-100/90 p-1.5 rounded-2xl border border-stone-200">
        <div className="flex flex-wrap items-center gap-1">
          {[
            { id: 'home', label: isCartVendor ? '1. Live Selling Home' : '1. Daily Home' },
            { id: 'products_link', label: `2. Products (${activeProductsCount}/${productLimit ?? '∞'})`, href: '/vendor/products' },
            {
              id: isCartVendor ? 'customers' : 'orders',
              label: isCartVendor
                ? `3. Customers & Orders (${vendorOrders.length})`
                : `3. Orders (${pendingOrdersCount > 0 ? `${pendingOrdersCount} Action Needed` : vendorOrders.length})`
            },
            { id: 'growth', label: '4. Growth & AI' },
            { id: 'more', label: '5. More & Settings' },
          ].map((t) =>
            t.href ? (
              <Link
                key={t.id}
                to={t.href}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-stone-700 hover:bg-white hover:text-[#0A6E3B] transition-all"
              >
                {t.label}
              </Link>
            ) : (
              <button
                key={t.id}
                type="button"
                onClick={() => setSearchParams({ tab: t.id })}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === t.id
                    ? 'bg-[#0A6E3B] text-white shadow-sm'
                    : 'text-stone-700 hover:bg-white'
                }`}
              >
                {t.label}
              </button>
            )
          )}
        </div>
        <button
          type="button"
          onClick={() => setSearchParams({ tab: activeTab === 'all' ? 'home' : 'all' })}
          className="px-3 py-1.5 rounded-xl text-[11px] font-medium text-stone-600 hover:bg-white border border-transparent hover:border-stone-200"
        >
          {activeTab === 'all' ? 'Simple Tab View' : 'Show All Sections'}
        </button>
      </div>

      {/* =====================================================================
          LAYER A (TAB 1: HOME) — MOBILE CART VENDOR ULTRA-SIMPLE HOME (PART 7)
         ===================================================================== */}
      {showHome && isCartVendor && (
        <div className="mt-6 space-y-5" data-testid="cart-vendor-simple-home">
          {/* Giant 1-Tap START SELLING / STOP SELLING Hero Card */}
          <div className={`rounded-3xl p-6 md:p-8 border-2 shadow-md transition-all ${
            isOnlineNow
              ? 'bg-gradient-to-br from-emerald-900 via-[#0A6E3B] to-emerald-950 text-white border-emerald-400'
              : 'bg-white text-stone-900 border-stone-300'
          }`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2 max-w-xl">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={isOnlineNow ? 'bg-emerald-400 text-stone-950 font-bold border-0' : 'bg-stone-200 text-stone-700 border-0'}>
                    {isOnlineNow ? '● LIVE ON NEARBY SHOPPER MAP' : '○ CURRENTLY OFFLINE'}
                  </Badge>
                  <Badge variant="outline" className={isOnlineNow ? 'border-emerald-300/50 text-emerald-100 text-[11px]' : 'border-emerald-300 text-emerald-800 bg-emerald-50 text-[11px]'}>
                    Live Location & Selling Always 100% Free
                  </Badge>
                </div>
                <h2 className="font-display text-2xl md:text-3xl font-bold">
                  {isOnlineNow ? 'You are Live & Selling Nearby!' : 'Ready to Start Selling Today?'}
                </h2>
                <p className={`text-sm ${isOnlineNow ? 'text-emerald-100' : 'text-stone-600'}`}>
                  {isOnlineNow
                    ? `Current stop: ${mobileCartDash?.current_stop_name || user.address || 'Active Neighbourhood Stop'}. Nearby customers can see your live cart and today's items.`
                    : 'Tap the big button below to turn on live location sharing so nearby families can find your cart.'}
                </p>
                {gpsStatusText && (
                  <div className={`text-xs font-medium ${isOnlineNow ? 'text-amber-300' : 'text-emerald-700'}`}>
                    📍 {gpsStatusText}
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row md:flex-col gap-3 min-w-[240px]">
                <Button
                  type="button"
                  disabled={sellingBusy}
                  onClick={() => handleStartStopSelling(!isOnlineNow)}
                  data-testid="cart-start-stop-selling-btn"
                  className={`h-16 px-8 rounded-2xl text-lg font-bold shadow-lg transition-transform active:scale-95 ${
                    isOnlineNow
                      ? 'bg-rose-600 hover:bg-rose-700 text-white'
                      : 'bg-[#0A6E3B] hover:bg-[#075030] text-white'
                  }`}
                >
                  <Power size={22} className="mr-2.5" />
                  {sellingBusy ? 'Updating...' : isOnlineNow ? 'STOP SELLING' : 'START SELLING'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={copyingInventory}
                  onClick={handleCopyYesterdayInventory}
                  data-testid="copy-yesterday-inventory-btn"
                  className={`h-11 rounded-xl text-xs font-semibold ${
                    isOnlineNow
                      ? 'bg-white/10 border-white/30 text-white hover:bg-white/20'
                      : 'border-emerald-300 text-emerald-900 bg-emerald-50 hover:bg-emerald-100'
                  }`}
                >
                  <Copy size={14} className="mr-1.5" />
                  {copyingInventory ? 'Copying...' : "Use Yesterday's Product List"}
                </Button>
              </div>
            </div>

            {/* Manual Stop Name & Quick Status Strip */}
            <div className={`mt-6 pt-4 border-t flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 ${
              isOnlineNow ? 'border-white/15' : 'border-stone-200'
            }`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-xs font-semibold ${isOnlineNow ? 'text-emerald-200' : 'text-stone-600'}`}>Cart Status:</span>
                {[
                  { id: 'AT_HOTSPOT', label: '📍 Standing at Stop' },
                  { id: 'MOVING', label: '🛞 Moving on Route' },
                  { id: 'CLOSED_TODAY', label: '🏠 Done for Today' },
                ].map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => handleUpdateCartStatus(st.id, customStopName)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                      mobileCartDash?.cart_status === st.id
                        ? 'bg-amber-400 text-stone-950 border-amber-400 shadow-sm'
                        : isOnlineNow
                        ? 'bg-white/10 text-white border-white/20 hover:bg-white/20'
                        : 'bg-stone-100 text-stone-700 border-stone-200 hover:bg-stone-200'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={customStopName}
                  onChange={(e) => setCustomStopName(e.target.value)}
                  placeholder={mobileCartDash?.current_stop_name || 'Enter current stop / landmark...'}
                  className="h-9 text-xs bg-white text-stone-900 min-w-[200px]"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleUpdateCartStatus(mobileCartDash?.cart_status || 'AT_HOTSPOT', customStopName)}
                  className="h-9 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-semibold text-xs shrink-0"
                >
                  Update Stop
                </Button>
              </div>
            </div>
          </div>

          {/* 4 Giant Touch-Friendly Daily Action Cards for Cart Vendors */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <Link
              to="/vendor/products"
              className="p-5 rounded-2xl bg-white border-2 border-emerald-200 hover:border-[#0A6E3B] shadow-sm flex flex-col justify-between transition-all"
            >
              <div className="w-11 h-11 rounded-xl bg-emerald-100 text-[#0A6E3B] grid place-items-center font-bold">
                <Package size={22} />
              </div>
              <div className="mt-3">
                <div className="font-display text-base font-bold text-stone-900">Add / Edit Products</div>
                <div className="text-xs text-stone-500 mt-0.5">1-Tap templates & voice ({activeProductsCount}/{productLimit ?? '∞'} active)</div>
              </div>
            </Link>

            <Link
              to="/vendor/products"
              className="p-5 rounded-2xl bg-white border-2 border-amber-200 hover:border-amber-500 shadow-sm flex flex-col justify-between transition-all"
            >
              <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-800 grid place-items-center font-bold">
                <DollarSign size={22} />
              </div>
              <div className="mt-3">
                <div className="font-display text-base font-bold text-stone-900">Update Prices</div>
                <div className="text-xs text-stone-500 mt-0.5">Inline 1-tap daily rate updates</div>
              </div>
            </Link>

            <button
              type="button"
              onClick={handleFetchDemand}
              className="p-5 rounded-2xl bg-white border-2 border-blue-200 hover:border-blue-500 shadow-sm flex flex-col justify-between text-left transition-all"
            >
              <div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-800 grid place-items-center font-bold">
                <MapPin size={22} />
              </div>
              <div className="mt-3">
                <div className="font-display text-base font-bold text-stone-900">Customer Requests</div>
                <div className="text-xs text-stone-500 mt-0.5">See what nearby homes need right now</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSearchParams({ tab: 'customers' })}
              className="p-5 rounded-2xl bg-white border-2 border-purple-200 hover:border-purple-500 shadow-sm flex flex-col justify-between text-left transition-all"
            >
              <div className="w-11 h-11 rounded-xl bg-purple-100 text-purple-800 grid place-items-center font-bold">
                <ShoppingBag size={22} />
              </div>
              <div className="mt-3">
                <div className="font-display text-base font-bold text-stone-900">Orders ({vendorOrders.length})</div>
                <div className="text-xs text-stone-500 mt-0.5">
                  {pendingOrdersCount > 0 ? `${pendingOrdersCount} waiting confirmation` : 'Confirm & collect cash'}
                </div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          LAYER A (TAB 1: HOME) — RETAILER DAILY CHECKLIST HOME (PART 6.1)
         ===================================================================== */}
      {showHome && !isCartVendor && (
        <div className="mt-6 space-y-5" data-testid="retailer-daily-checklist-home">
          <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#0A6E3B]">What Needs Attention Today?</span>
                <h2 className="font-display text-xl font-semibold text-stone-900 mt-0.5">
                  Daily Shop Checklist & Quick Actions
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={user.is_online ? 'default' : 'outline'}
                  disabled={sellingBusy}
                  onClick={() => handleStartStopSelling(!user.is_online)}
                  className={`rounded-full text-xs font-semibold ${
                    user.is_online ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'border-stone-300 text-stone-700'
                  }`}
                >
                  <Power size={13} className="mr-1.5" />
                  {user.is_online ? 'Shop Open (Tap to Close)' : 'Shop Closed (Tap to Open)'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={copyingInventory}
                  onClick={handleCopyYesterdayInventory}
                  className="rounded-full text-xs border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100"
                >
                  <Copy size={13} className="mr-1.5" />
                  {copyingInventory ? 'Refreshing...' : "Confirm Yesterday's Stock & Prices"}
                </Button>
              </div>
            </div>

            {/* 4 Checklist Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mt-4">
              <div className={`p-4 rounded-2xl border ${pendingOrdersCount > 0 ? 'bg-amber-50 border-amber-300' : 'bg-stone-50 border-stone-200'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-stone-700">1. Orders to Confirm</span>
                  <Receipt size={16} className={pendingOrdersCount > 0 ? 'text-amber-700' : 'text-stone-400'} />
                </div>
                <div className="font-display text-2xl font-bold text-stone-900 mt-2">{pendingOrdersCount}</div>
                <p className="text-[11px] text-stone-600 mt-0.5">
                  {pendingOrdersCount > 0 ? 'Shoppers waiting for bill confirmation' : 'All incoming orders are up to date'}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setSearchParams({ tab: 'orders' })}
                  className="mt-3 w-full rounded-xl text-xs h-8 bg-white"
                >
                  View Orders ({vendorOrders.length})
                </Button>
              </div>

              <div className="p-4 rounded-2xl border bg-stone-50 border-stone-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-stone-700">2. Catalogue & Stock</span>
                  <Package size={16} className="text-[#0A6E3B]" />
                </div>
                <div className="font-display text-2xl font-bold text-stone-900 mt-2">
                  {activeProductsCount}{productLimit ? <span className="text-sm font-normal text-stone-500">/{productLimit}</span> : null}
                </div>
                <p className="text-[11px] text-stone-600 mt-0.5">
                  {outOfStockCount > 0 ? `${outOfStockCount} items currently marked Out of Stock` : 'All listed items are in stock'}
                </p>
                <Link to="/vendor/products" className="block mt-3">
                  <Button size="sm" className="w-full rounded-xl text-xs h-8 bg-[#0A6E3B] hover:bg-[#075030] text-white">
                    + Add / Update Prices
                  </Button>
                </Link>
              </div>

              <div className="p-4 rounded-2xl border bg-stone-50 border-stone-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-stone-700">3. Customer Requests</span>
                  <MapPin size={16} className="text-blue-600" />
                </div>
                <div className="font-display text-2xl font-bold text-stone-900 mt-2">
                  {demandGaps?.demand_gaps?.length || 0}
                </div>
                <p className="text-[11px] text-stone-600 mt-0.5">
                  Nearby shopper searches & open 'I Need' alerts
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleFetchDemand}
                  className="mt-3 w-full rounded-xl text-xs h-8 bg-white"
                >
                  Respond to Requests
                </Button>
              </div>

              <div className="p-4 rounded-2xl border bg-stone-50 border-stone-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-stone-700">4. Shop Performance</span>
                  <TrendingUp size={16} className="text-emerald-700" />
                </div>
                <div className="font-display text-2xl font-bold text-stone-900 mt-2">
                  ₹{revenueHero?.confidence_adjusted_attributable_revenue?.toLocaleString('en-IN') || 0}
                </div>
                <p className="text-[11px] text-stone-600 mt-0.5">
                  Verified + attributed HyperLocal sales
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setSearchParams({ tab: 'growth' })}
                  className="mt-3 w-full rounded-xl text-xs h-8 bg-white"
                >
                  Open Growth & AI →
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          LAYER B (TAB 4: GROWTH & AI) — REVENUE HERO, DEMAND GAPS, CRM, CAMPAIGNS
         ===================================================================== */}
      {showGrowth && (
      <>
      {/* HyperLocal Sales Impact & Attribution Banner + Point 10/11/36 Revenue Hero KPI */}
      <div className="mt-8 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-900 via-stone-900 to-emerald-950 p-6 text-white shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-medium border border-emerald-400/30">
              <TrendingUp size={12} /> {revenueHero?.hero_kpi_title || 'HyperLocal Revenue Generated For Your Business'}
            </div>
            <h2 className="text-xl md:text-2xl font-display font-semibold text-white">
              {revenueHero
                ? `₹${revenueHero.confidence_adjusted_attributable_revenue?.toLocaleString('en-IN') || 0} Confidence-Adjusted Revenue`
                : 'How many customers did HyperLocal bring to your shop?'}
            </h2>
            <p className="text-stone-300 text-sm">
              {revenueHero?.roi_explanation || 'Track walk-ins, customer attribution, verified purchases, and compare your before-vs-after sales growth with full confidence.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {revenueHero?.merchant_roi_multiple !== null && revenueHero?.merchant_roi_multiple !== undefined && (
              <Badge className="bg-amber-400 text-stone-950 font-bold text-xs px-3 py-1 border-0">
                ROI: {revenueHero.merchant_roi_multiple}x Return
              </Badge>
            )}
            <Link to="/vendor/analytics">
              <Button className="rounded-full bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-semibold shadow-md">
                Open Impact Dashboard <ArrowRight size={15} className="ml-1.5" />
              </Button>
            </Link>
          </div>
        </div>

        {revenueHero?.tiers && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-white/10 text-xs">
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="text-emerald-300 font-semibold">VERIFIED (100% wt)</div>
              <div className="text-lg font-bold text-white mt-0.5">₹{revenueHero.tiers.VERIFIED?.revenue || 0}</div>
              <div className="text-[11px] text-stone-400">{revenueHero.tiers.VERIFIED?.count || 0} completed orders/visits</div>
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="text-blue-300 font-semibold">HIGH CONFIDENCE (85%)</div>
              <div className="text-lg font-bold text-white mt-0.5">₹{revenueHero.tiers.HIGH_CONFIDENCE?.revenue || 0}</div>
              <div className="text-[11px] text-stone-400">{revenueHero.tiers.HIGH_CONFIDENCE?.count || 0} QR / dual signals</div>
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="text-amber-300 font-semibold">LIKELY (60% wt)</div>
              <div className="text-lg font-bold text-white mt-0.5">₹{revenueHero.tiers.LIKELY?.revenue || 0}</div>
              <div className="text-[11px] text-stone-400">{revenueHero.tiers.LIKELY?.count || 0} single-party signals</div>
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="text-stone-300 font-semibold">POSSIBLE (25% wt)</div>
              <div className="text-lg font-bold text-white mt-0.5">₹{revenueHero.tiers.POSSIBLE?.revenue || 0}</div>
              <div className="text-[11px] text-stone-400">{revenueHero.tiers.POSSIBLE?.count || 0} proximity intents</div>
            </div>
          </div>
        )}
      </div>

      {/* Point 13, 14, 15, 20, 28: Merchant Growth, Demand Gaps, Mobile Cart, Promotions & QR Strip */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Demand Gap Engine (Point 13 & 14) */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Local Demand Gaps</span>
              <Badge variant="outline" className="text-[10px] border-emerald-200 text-emerald-800">
                {demandGaps?.demand_gaps?.length || 0} opportunities
              </Badge>
            </div>
            <p className="text-xs text-stone-500 mt-1">
              Products searched or requested nearby that are missing or low in your catalogue.
            </p>
            <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
              {(demandGaps?.demand_gaps || []).slice(0, 4).map((gap, idx) => (
                <div key={idx} className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-semibold text-stone-900 capitalize">{gap.term}</div>
                    <div className="text-[11px] text-stone-500">
                      Demand: {gap.demand_count} · Supply: {gap.nearby_supply_count} · Score: {gap.opportunity_score}
                    </div>
                  </div>
                  <Link to="/vendor/products">
                    <Button size="sm" variant="outline" className="h-7 text-[11px] rounded-full border-emerald-300 text-emerald-800">
                      + Add
                    </Button>
                  </Link>
                </div>
              ))}
              {(!demandGaps?.demand_gaps || demandGaps.demand_gaps.length === 0) && (
                <div className="text-xs text-stone-400 py-4 text-center">
                  {demandGaps?.empty_state || 'Awaiting Marketplace Activity'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Privacy-Safe Merchant CRM & QR Codes (Point 12 & Point 28) */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-stone-700">Customer CRM & Store QR</span>
              <Badge variant="outline" className="text-[10px]">Privacy-Safe</Badge>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <div className="p-2 rounded-xl bg-stone-50 border border-stone-100">
                <div className="text-lg font-bold text-stone-900">{crmAnalytics?.total_transacting_customers ?? 0}</div>
                <div className="text-[10px] text-stone-500">Customers</div>
              </div>
              <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-100">
                <div className="text-lg font-bold text-emerald-900">{crmAnalytics?.repeat_customers ?? 0}</div>
                <div className="text-[10px] text-emerald-700">Repeat</div>
              </div>
              <div className="p-2 rounded-xl bg-amber-50 border border-amber-100">
                <div className="text-lg font-bold text-amber-900">₹{crmAnalytics?.average_basket_value_inr ?? 0}</div>
                <div className="text-[10px] text-amber-800">Avg Basket</div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-stone-100">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-stone-700">Signed Physical QR ({qrCodes.length})</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => handleGenerateQr('CHECKIN_QR')} className="h-6 text-[10px] px-2 rounded-full">
                    + Check-in QR
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleGenerateQr('CART_QR')} className="h-6 text-[10px] px-2 rounded-full">
                    + Cart QR
                  </Button>
                </div>
              </div>
              {qrCodes.slice(0, 2).map((q) => (
                <div key={q.id} className="mt-1.5 text-[11px] font-mono bg-stone-50 px-2 py-1 rounded border border-stone-200 truncate">
                  {q.qr_type}: {q.deep_link}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Self-Service Promoted Listings & Mobile Cart Status (Point 15, 20, 21) */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-800">Promotions & Cart Status</span>
              <Button size="sm" onClick={() => setAdModalOpen(true)} className="h-7 text-[11px] rounded-full bg-amber-600 hover:bg-amber-700 text-white">
                + Promote Shop
              </Button>
            </div>
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-stone-600">Mobile Cart Live Status:</div>
              <div className="flex flex-wrap gap-1.5">
                {['AT_HOTSPOT', 'MOVING', 'CLOSED_TODAY'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => handleUpdateCartStatus(st)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                      mobileCartDash?.cart_status === st
                        ? 'bg-[#0A6E3B] text-white border-[#0A6E3B]'
                        : 'bg-stone-50 text-stone-600 border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    {st.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>
            <div className="pt-2 border-t border-stone-100 space-y-1">
              <div className="text-[11px] font-medium text-stone-600">Active Sponsored Campaigns ({campaigns.length}):</div>
              {campaigns.slice(0, 2).map((c) => (
                <div key={c.id} className="p-2 rounded-lg bg-amber-50/60 border border-amber-200 flex items-center justify-between text-xs">
                  <span className="font-medium text-stone-900 truncate">{c.campaign_name}</span>
                  <span className="text-[10px] text-amber-900">{c.impressions || 0} views · {c.clicks || 0} clicks</span>
                </div>
              ))}
              {campaigns.length === 0 && (
                <div className="text-[11px] text-stone-400">No active promotions. Boost visibility in local search!</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Self-Service Sponsored Campaign Modal (Points 20 & 21) */}
      <Dialog open={adModalOpen} onOpenChange={setAdModalOpen}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader>
            <DialogTitle>Launch Local Sponsored Campaign</DialogTitle>
            <DialogDescription>
              Clearly labeled SPONSORED placement in nearby shopper searches. Never overrides relevance or out-of-stock rules.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateCampaign} className="space-y-3 text-xs">
            <div>
              <Label className="text-xs">Campaign Name</Label>
              <Input
                required
                value={adForm.campaign_name}
                onChange={(e) => setAdForm({ ...adForm, campaign_name: e.target.value })}
                placeholder="e.g. Weekend Fresh Sabzi Boost"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Placement Type</Label>
                <select
                  value={adForm.campaign_type}
                  onChange={(e) => setAdForm({ ...adForm, campaign_type: e.target.value })}
                  className="w-full h-9 rounded-md border border-stone-200 px-2 text-xs mt-1"
                >
                  <option value="FEATURED_SHOP_CARD">Featured Shop Card</option>
                  <option value="SPONSORED_PRODUCT">Sponsored Product</option>
                  <option value="LOCALITY_SPOTLIGHT">Locality Spotlight</option>
                  <option value="DEAL_OF_THE_DAY">Deal of the Day</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Billing Model</Label>
                <select
                  value={adForm.billing_model}
                  onChange={(e) => setAdForm({ ...adForm, billing_model: e.target.value })}
                  className="w-full h-9 rounded-md border border-stone-200 px-2 text-xs mt-1"
                >
                  <option value="CPC">CPC (Per Click)</option>
                  <option value="CPM">CPM (Per 1000 Views)</option>
                  <option value="FIXED_DAILY">Fixed Daily</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Daily Budget (₹)</Label>
                <Input
                  type="number"
                  value={adForm.daily_budget_inr}
                  onChange={(e) => setAdForm({ ...adForm, daily_budget_inr: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Total Budget (₹)</Label>
                <Input
                  type="number"
                  value={adForm.total_budget_inr}
                  onChange={(e) => setAdForm({ ...adForm, total_budget_inr: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Bid (₹)</Label>
                <Input
                  type="number"
                  value={adForm.bid_amount_inr}
                  onChange={(e) => setAdForm({ ...adForm, bid_amount_inr: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAdModalOpen(false)}>Cancel</Button>
              <Button type="submit" className="rounded-full bg-[#0A6E3B] text-white">Launch Campaign</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
      </>
      )}

      {/* SMART ROUTE MODAL */}
      <Dialog open={routeOpen} onOpenChange={setRouteOpen}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Navigation size={18} className="text-blue-600" />
              AI Route Recommendation
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            {routeLoading && <div className="text-center py-6 text-stone-500">Computing optimal waypoints...</div>}
            {!routeLoading && routeData?.pro_locked && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2 text-stone-800">
                <div className="font-semibold text-amber-900">AI Smart Route Optimization (Pro Feature)</div>
                <p className="text-xs text-stone-600">
                  Predicts which residential colonies and stops have the highest shopper demand by hour of the day. Note: Live location sharing and Start/Stop Selling remain 100% Free forever.
                </p>
                <Link to="/vendor/pricing" className="inline-block pt-1">
                  <Button size="sm" className="rounded-full bg-[#0A6E3B] text-white text-xs">
                    See Pro Plans ({proPlanPriceLabel})
                  </Button>
                </Link>
              </div>
            )}
            {!routeLoading && routeData && !routeData.pro_locked && (
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
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle size={18} className="text-amber-600" />
              Stockout Risk Assessment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            {stockoutLoading && <div className="text-center py-6 text-stone-500">Evaluating velocity logs...</div>}
            {!stockoutLoading && stockoutData?.pro_locked && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2 text-stone-800">
                <div className="font-semibold text-amber-900">AI Stockout Intelligence (Pro Feature)</div>
                <p className="text-xs text-stone-600">
                  Automatically predicts which items will run out of stock within 24–48 hours based on neighbourhood order velocity.
                </p>
                <Link to="/vendor/pricing" className="inline-block pt-1">
                  <Button size="sm" className="rounded-full bg-[#0A6E3B] text-white text-xs">
                    See Pro Plans ({proPlanPriceLabel})
                  </Button>
                </Link>
              </div>
            )}
            {!stockoutLoading && stockoutData && !stockoutData.pro_locked && (
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
        <DialogContent className="max-w-md bg-white">
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
                <div className="pt-2 flex justify-end">
                  <Link to="/i-need">
                    <Button size="sm" variant="outline" className="rounded-full text-xs">
                      Open Full Customer Requests Page →
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 7-DAY DEMAND FORECAST MODAL */}
      <Dialog open={forecastOpen} onOpenChange={setForecastOpen}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <TrendingUp size={18} className="text-purple-600" />
              7-Day Predictive Demand Forecast
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            {forecastLoading && <div className="text-center py-6 text-stone-500">Computing forecast...</div>}
            {!forecastLoading && forecastData?.pro_locked && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2 text-stone-800">
                <div className="font-semibold text-amber-900">7-Day Demand Forecasting (Pro Feature)</div>
                <p className="text-xs text-stone-600">
                  See projected neighbourhood demand for the coming week so you buy the right stock quantity and avoid wastage.
                </p>
                <Link to="/vendor/pricing" className="inline-block pt-1">
                  <Button size="sm" className="rounded-full bg-[#0A6E3B] text-white text-xs">
                    See Pro Plans ({proPlanPriceLabel})
                  </Button>
                </Link>
              </div>
            )}
            {!forecastLoading && forecastData && !forecastData.pro_locked && (
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

      {/* IN-APP ORDERS & BILLING COMMAND CENTER (Shown on Home, Orders/Customers, or All) */}
      {(showOrders || showHome) && (
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
      )}

      {/* =====================================================================
          LAYER B (TAB 5: MORE & SETTINGS) — PROFILE, QR, SUBSCRIPTION, BRANCHES, HELP
         ===================================================================== */}
      {showMore && (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="vendor-more-settings-panel">
          <div className="rounded-2xl border border-stone-200 bg-white p-5 flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#0A6E3B] grid place-items-center">
                <Store size={18} />
              </div>
              <h3 className="font-display text-lg font-semibold text-stone-900 mt-3">
                {isCartVendor ? 'Cart Profile & Location' : 'Shop Profile & Timings'}
              </h3>
              <p className="text-xs text-stone-500 mt-1">
                Update your shop/cart name, phone number, category, address, and map coordinates.
              </p>
            </div>
            <Link to="/vendor/profile" className="mt-4">
              <Button variant="outline" size="sm" className="w-full rounded-xl text-xs">
                Edit Profile & Map Pin →
              </Button>
            </Link>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5 flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-800 grid place-items-center">
                <Rocket size={18} />
              </div>
              <h3 className="font-display text-lg font-semibold text-stone-900 mt-3">
                Subscription & Billing
              </h3>
              <p className="text-xs text-stone-500 mt-1">
                Current tier: <strong>{isPro ? 'Pro Active' : trialActive ? `30-Day Pro Trial (${daysLeft}d left)` : 'Free Plan'}</strong>. Compare Free vs Pro plans, view history, or pay via UPI QR.
              </p>
            </div>
            <Link to="/vendor/pricing" className="mt-4">
              <Button size="sm" className="w-full rounded-xl text-xs bg-[#0A6E3B] hover:bg-[#075030] text-white">
                Manage Plan ({proPlanPriceLabel}) →
              </Button>
            </Link>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5 flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-800 grid place-items-center">
                <QrCode size={18} />
              </div>
              <h3 className="font-display text-lg font-semibold text-stone-900 mt-3">
                Physical Store & Cart QR ({qrCodes.length})
              </h3>
              <p className="text-xs text-stone-500 mt-1">
                Generate cryptographic QR codes for customer walk-in check-ins and verified sales attribution.
              </p>
            </div>
            <div className="flex gap-2 mt-4">
              <Button size="sm" variant="outline" onClick={() => handleGenerateQr('CHECKIN_QR')} className="flex-1 rounded-xl text-xs">
                + Check-in QR
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleGenerateQr('CART_QR')} className="flex-1 rounded-xl text-xs">
                + Cart QR
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5 flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-800 grid place-items-center">
                <MessageSquare size={18} />
              </div>
              <h3 className="font-display text-lg font-semibold text-stone-900 mt-3">
                Customer Messages & Inquiries
              </h3>
              <p className="text-xs text-stone-500 mt-1">
                Chat directly with nearby customers asking about stock, custom quantities, or availability.
              </p>
            </div>
            <Link to="/messages" className="mt-4">
              <Button variant="outline" size="sm" className="w-full rounded-xl text-xs">
                Open Messages →
              </Button>
            </Link>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5 flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-800 grid place-items-center">
                <TrendingUp size={18} />
              </div>
              <h3 className="font-display text-lg font-semibold text-stone-900 mt-3">
                Business Impact & Receipts
              </h3>
              <p className="text-xs text-stone-500 mt-1">
                Full before-vs-after sales comparison, offline walk-in attribution, and CSV sales import.
              </p>
            </div>
            <Link to="/vendor/analytics" className="mt-4">
              <Button variant="outline" size="sm" className="w-full rounded-xl text-xs">
                Open Business Impact →
              </Button>
            </Link>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5 flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-800 grid place-items-center">
                <HelpCircle size={18} />
              </div>
              <h3 className="font-display text-lg font-semibold text-stone-900 mt-3">
                Help, Support & Grievances
              </h3>
              <p className="text-xs text-stone-500 mt-1">
                Need help with billing, orders, or account verification? Raise a support ticket anytime.
              </p>
            </div>
            <Link to="/grievances" className="mt-4">
              <Button variant="outline" size="sm" className="w-full rounded-xl text-xs">
                Support & Grievance Center →
              </Button>
            </Link>
          </div>
        </div>
      )}

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
