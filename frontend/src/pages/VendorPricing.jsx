import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, formatApiErrorDetail } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PRICING } from '@/constants/testIds';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Check, Sparkles, TrendingUp, BarChart3, Building2, Package, Zap, Store, Truck,
  QrCode, Copy, CheckCircle2, Smartphone, CreditCard, ShieldCheck, ExternalLink, Download, Maximize2
} from 'lucide-react';

const PERKS = [
  { icon: <Package size={15} />, text: 'Unlimited product listings' },
  { icon: <TrendingUp size={15} />, text: 'Priority placement in search results' },
  { icon: <BarChart3 size={15} />, text: 'Analytics: views & clicks per product' },
  { icon: <Sparkles size={15} />, text: 'Featured / promoted product cards' },
  { icon: <Building2 size={15} />, text: 'Multi-branch listings' },
  { icon: <Zap size={15} />, text: 'Same-day price updates, no cap' },
];

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

function pct(compare, price) {
  if (!compare || compare <= price) return 0;
  return Math.round(((compare - price) / compare) * 100);
}

export default function VendorPricing() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [config, setConfig] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('retailer');

  // Direct UPI QR section states
  const [selectedPlanKey, setSelectedPlanKey] = useState('monthly');
  const [customAmount, setCustomAmount] = useState('');
  const [utrNumber, setUtrNumber] = useState('');
  const [payerUpi, setPayerUpi] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [copied, setCopied] = useState(false);
  const [qrZoomOpen, setQrZoomOpen] = useState(false);

  // Plan checkout modal states
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [checkoutPlanKey, setCheckoutPlanKey] = useState('monthly');
  const [checkoutMethod, setCheckoutMethod] = useState('upi_qr'); // 'upi_qr' | 'razorpay'
  const [modalUtr, setModalUtr] = useState('');
  const [modalPayerUpi, setModalPayerUpi] = useState('');
  const [subStatus, setSubStatus] = useState(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  const loadSubStatus = async () => {
    if (user?.role === 'vendor') {
      try {
        const { data } = await api.get('/vendor/subscription-status');
        setSubStatus(data);
      } catch {
        // ignore
      }
    }
  };

  useEffect(() => {
    api.get('/payments/config').then((r) => {
      setConfig(r.data);
      if (r.data?.vendor_tier) setTab(r.data.vendor_tier);
      if (r.data?.upi_qr?.enabled === false) {
        setCheckoutMethod('razorpay');
      }
    });
    loadSubStatus();
    // eslint-disable-next-line
  }, [user?.id]);

  const handleCancelSubscription = async () => {
    setCancelBusy(true);
    try {
      const { data } = await api.post('/vendor/subscription/cancel');
      toast.success(data.message || 'Auto-renewal cancelled. Your products and history remain safe.');
      await loadSubStatus();
      await refresh();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || 'Could not cancel subscription');
    } finally {
      setCancelBusy(false);
    }
  };

  const isPro = user?.is_pro;
  const activeTier = user?.role === 'vendor' ? (user.vendor_type === 'cart_vendor' ? 'cart_vendor' : 'retailer') : tab;
  const plans = config?.all_plans?.[activeTier];

  const upiConfig = config?.upi_qr || {
    enabled: true,
    upi_id: '8955745543@yapl',
    payee_name: 'LocalPrice Official',
    qr_image_url: '/payment-qr.jpg',
    verification_mode: 'auto_approve',
    instructions: 'Scan the QR code with any UPI app (PhonePe, Google Pay, Paytm, BHIM) or send the exact plan amount to the UPI ID below. After paying, enter your 12-digit UTR / UPI Reference Number to activate Pro.',
  };
  const razorpayEnabled = config?.razorpay_enabled !== false;

  const copyUpiId = () => {
    navigator.clipboard.writeText(upiConfig.upi_id);
    setCopied(true);
    toast.success(`Copied UPI ID: ${upiConfig.upi_id}`);
    setTimeout(() => setCopied(false), 2500);
  };

  const getActivePlanPriceRupees = (pKey) => {
    if (pKey === 'custom') return parseFloat(customAmount) || 0;
    const p = plans?.[pKey] || config?.all_plans?.cart_vendor?.[pKey] || config?.all_plans?.retailer?.monthly;
    return p ? p.amount / 100 : 149;
  };

  const getUpiDeepLink = (amountRupees, planLabel) => {
    const pa = encodeURIComponent(upiConfig.upi_id);
    const pn = encodeURIComponent(upiConfig.payee_name || 'LocalPrice');
    const tn = encodeURIComponent(`LocalPrice ${planLabel || 'Vendor Payment'}`);
    const am = amountRupees > 0 ? `&am=${amountRupees}` : '';
    return `upi://pay?pa=${pa}&pn=${pn}&tn=${tn}${am}&cu=INR`;
  };

  const handlePlanButtonClick = (planKey) => {
    if (!user) {
      navigate('/auth/vendor');
      return;
    }
    if (user.role !== 'vendor') {
      toast.error('Only vendors and retailers can subscribe.');
      return;
    }
    if (upiConfig.enabled) {
      setCheckoutPlanKey(planKey);
      setCheckoutMethod('upi_qr');
      setModalUtr('');
      setModalPayerUpi('');
      setCheckoutModalOpen(true);
    } else {
      buyViaRazorpay(planKey);
    }
  };

  const submitUpiPayment = async ({ planKey, utr, payer, notes, customAmt, fromModal = false }) => {
    if (!user) {
      toast.info('Please sign in to your vendor/retailer account first');
      navigate('/auth/vendor');
      return;
    }
    if (user.role !== 'vendor') {
      toast.error('Only vendors and retailers can submit vendor payments.');
      return;
    }
    if (!utr || utr.trim().length < 4) {
      toast.error('Please enter your UTR / UPI Transaction Reference Number');
      return;
    }
    if (planKey === 'custom' && (!customAmt || parseFloat(customAmt) <= 0)) {
      toast.error('Please enter a valid payment amount in ₹');
      return;
    }

    setBusy(true);
    try {
      const { data } = await api.post('/payments/upi-submit', {
        plan: planKey,
        utr_number: utr.trim(),
        custom_amount_rupees: planKey === 'custom' ? parseFloat(customAmt) : undefined,
        payer_upi_id: payer?.trim() || undefined,
        notes: notes?.trim() || undefined,
      });
      await refresh();
      toast.success(data.message || 'Payment submitted!');
      if (fromModal) setCheckoutModalOpen(false);
      setUtrNumber('');
      setModalUtr('');
      if (data.status === 'paid') {
        navigate('/vendor/dashboard');
      }
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || 'Failed to submit UPI payment');
    } finally {
      setBusy(false);
    }
  };

  const buyViaRazorpay = async (planKey) => {
    if (!user) { navigate('/auth/vendor'); return; }
    if (user.role !== 'vendor') { toast.error('Only vendors can subscribe.'); return; }
    setBusy(true);
    try {
      const { data: order } = await api.post('/payments/create-order', { plan: planKey });
      const isMock = order.mode !== 'live' || !order.key_id || order.key_id.includes('placeholder');

      if (isMock) {
        await api.post('/payments/verify', {
          razorpay_order_id: order.order_id,
          razorpay_payment_id: `pay_mock_${Date.now()}`,
          razorpay_signature: null,
          plan: planKey,
        });
        await refresh();
        toast.success('Pro activated! (demo mode)');
        setCheckoutModalOpen(false);
        navigate('/vendor/dashboard');
        return;
      }

      const ok = await loadRazorpayScript();
      if (!ok) { toast.error('Could not load Razorpay. Check your connection.'); return; }

      const rzp = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        order_id: order.order_id,
        name: 'LocalPrice',
        description: `${activeTier === 'cart_vendor' ? 'Cart' : 'Retail'} Pro ${planKey === 'yearly' ? 'Yearly' : 'Monthly'}`,
        prefill: { name: user.name, email: user.email, contact: user.phone || '' },
        theme: { color: '#0A6E3B' },
        method: { upi: true, card: true, netbanking: false, wallet: false },
        handler: async (res) => {
          try {
            await api.post('/payments/verify', {
              razorpay_order_id: res.razorpay_order_id,
              razorpay_payment_id: res.razorpay_payment_id,
              razorpay_signature: res.razorpay_signature,
              plan: planKey,
            });
            await refresh();
            toast.success('Welcome to Pro!');
            setCheckoutModalOpen(false);
            navigate('/vendor/dashboard');
          } catch (e) {
            toast.error(formatApiErrorDetail(e.response?.data?.detail) || 'Verification failed');
          }
        },
      });
      rzp.open();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally { setBusy(false); }
  };

  const modalPlanObj = plans?.[checkoutPlanKey] || config?.all_plans?.retailer?.monthly;
  const modalAmountRupees = modalPlanObj ? modalPlanObj.amount / 100 : 149;

  return (
    <div className="max-w-6xl mx-auto px-5 md:px-8 py-14 pb-24 md:pb-14">
      <div className="text-center max-w-2xl mx-auto">
        <span className="chip chip-amber"><Sparkles size={12} /> Vendor & Retailer Pro</span>
        <h1 className="font-display text-4xl md:text-5xl font-semibold text-stone-900 mt-4 leading-tight">Outsell your neighbourhood.</h1>
        <p className="mt-3 text-stone-600">Instant activation via Direct UPI QR Scan ({upiConfig.upi_id}) or Online Checkout in INR.</p>
      </div>

      {isPro && (
        <div className="mt-6 max-w-lg mx-auto rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center text-emerald-900 text-sm">
          You're already on Pro. <Link to="/vendor/dashboard" className="font-semibold underline">Back to dashboard →</Link>
        </div>
      )}

      {/* Tier tabs — vendors are locked to their own tier, public visitors can browse both */}
      <div className="mt-8 flex justify-center">
        <div className="inline-flex rounded-full border border-stone-200 bg-white p-1">
          <button
            data-testid="tier-retailer"
            onClick={() => { if (user?.role === 'vendor' && user.vendor_type !== 'retailer') return; setTab('retailer'); }}
            disabled={user?.role === 'vendor' && user.vendor_type !== 'retailer'}
            className={`px-4 py-1.5 rounded-full text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
              activeTier === 'retailer' ? 'bg-[#0A6E3B] text-white' : 'text-stone-600 hover:text-[#0A6E3B]'
            } ${user?.role === 'vendor' && user.vendor_type !== 'retailer' ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <Store size={13} /> Retail shop
          </button>
          <button
            data-testid="tier-cart"
            onClick={() => { if (user?.role === 'vendor' && user.vendor_type !== 'cart_vendor') return; setTab('cart_vendor'); }}
            disabled={user?.role === 'vendor' && user.vendor_type !== 'cart_vendor'}
            className={`px-4 py-1.5 rounded-full text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
              activeTier === 'cart_vendor' ? 'bg-[#0A6E3B] text-white' : 'text-stone-600 hover:text-[#0A6E3B]'
            } ${user?.role === 'vendor' && user.vendor_type !== 'cart_vendor' ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <Truck size={13} /> Cart vendor
          </button>
        </div>
      </div>
      {user?.role === 'vendor' && (
        <div className="mt-2 text-center text-[11px] text-stone-500">
          You're a {user.vendor_type === 'cart_vendor' ? 'cart vendor' : 'retailer'} — your tier is locked.
        </div>
      )}

      {plans && (
        <div className={`mt-8 grid gap-5 max-w-5xl mx-auto ${plans.weekly ? 'md:grid-cols-3' : 'md:grid-cols-2 max-w-4xl'}`}>
          {plans.weekly && (
            <PlanCard
              testId="pricing-weekly-card"
              buyTestId="pricing-weekly-buy"
              title="Weekly"
              price={`₹${plans.weekly.amount / 100}`}
              compareRupees={plans.weekly.compare_amount / 100}
              discountPct={pct(plans.weekly.compare_amount, plans.weekly.amount)}
              suffix="/ 7 days"
              badge="Lowest ticket"
              desc="Try Pro for one week. Perfect for cart vendors starting out."
              onBuy={() => handlePlanButtonClick('weekly')}
              disabled={busy || isPro || (user && user.role !== 'vendor')}
            />
          )}
          <PlanCard
            testId={PRICING.monthlyCard}
            buyTestId={PRICING.monthlyBuy}
            title="Monthly"
            price={`₹${plans.monthly.amount / 100}`}
            compareRupees={plans.monthly.compare_amount / 100}
            discountPct={pct(plans.monthly.compare_amount, plans.monthly.amount)}
            suffix="/ month"
            desc="Best to test the waters."
            onBuy={() => handlePlanButtonClick('monthly')}
            disabled={busy || isPro || (user && user.role !== 'vendor')}
          />
          <PlanCard
            testId={PRICING.yearlyCard}
            buyTestId={PRICING.yearlyBuy}
            title="Yearly"
            price={`₹${plans.yearly.amount / 100}`}
            compareRupees={plans.yearly.compare_amount / 100}
            discountPct={pct(plans.yearly.compare_amount, plans.yearly.amount)}
            suffix="/ year"
            badge="Best value"
            highlighted
            desc={`Just ₹${Math.round(plans.yearly.amount / 100 / 12)}/month billed yearly.`}
            onBuy={() => handlePlanButtonClick('yearly')}
            disabled={busy || isPro || (user && user.role !== 'vendor')}
          />
        </div>
      )}

      {/* FREE VS PRO CLEAR COMPARISON CARD (Part 4.2, 4.3, 4.6) */}
      <div data-testid="free-vs-pro-comparison" className="mt-10 max-w-5xl mx-auto rounded-3xl border border-stone-200 bg-white p-6 md:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-stone-100">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#0A6E3B]">Transparent Plan Comparison</span>
            <h2 className="font-display text-2xl font-semibold text-stone-900 mt-1">
              {activeTier === 'cart_vendor' ? 'Mobile Cart Vendor: Free vs. Pro' : 'Retail Shopkeeper: Free vs. Pro'}
            </h2>
            <p className="text-xs text-stone-600 mt-0.5">
              Every new seller receives a 30-day Free Pro Trial. If your trial or subscription ends, none of your products or sales history are ever deleted.
            </p>
          </div>
          <Badge className="bg-emerald-50 text-emerald-900 border border-emerald-200 text-xs w-fit">
            Consumers are 100% Free Forever
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          {/* Free Tier Column */}
          <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-display text-lg font-bold text-stone-900">
                {activeTier === 'cart_vendor' ? 'Mobile Cart Free Plan' : 'Retailer Free Plan'}
              </div>
              <Badge variant="outline" className="bg-white text-stone-800">₹0 Forever</Badge>
            </div>
            <p className="text-xs text-stone-600">
              Everything you need to run your daily neighbourhood business at zero cost.
            </p>
            <ul className="space-y-2 text-xs text-stone-700 pt-2">
              <li className="flex items-center gap-2">
                <Check size={14} className="text-[#0A6E3B] shrink-0" />
                <span>Up to <strong>{activeTier === 'cart_vendor' ? '20 active product listings' : '30 active product listings'}</strong></span>
              </li>
              {activeTier === 'cart_vendor' && (
                <>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-[#0A6E3B] shrink-0" />
                    <span><strong>Live Location Sharing & Map Pin (Always 100% Free)</strong></span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-[#0A6E3B] shrink-0" />
                    <span><strong>1-Tap Start Selling / Stop Selling (Always 100% Free)</strong></span>
                  </li>
                </>
              )}
              <li className="flex items-center gap-2">
                <Check size={14} className="text-[#0A6E3B] shrink-0" />
                <span>1-Tap Product Templates, Manual & Basic Voice Entry</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={14} className="text-[#0A6E3B] shrink-0" />
                <span>Receive & Manage Customer Orders, Cash Collection & Invoices</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={14} className="text-[#0A6E3B] shrink-0" />
                <span>Customer Messages & Nearby 'I Need' Buyer Requests</span>
              </li>
            </ul>
          </div>

          {/* Pro Tier Column */}
          <div className="rounded-2xl border-2 border-[#0A6E3B] bg-emerald-50/30 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-display text-lg font-bold text-stone-900">
                {activeTier === 'cart_vendor' ? 'Mobile Cart Pro Plan' : 'Retailer Pro Plan'}
              </div>
              <Badge className="bg-[#0A6E3B] text-white border-0">
                {activeTier === 'cart_vendor' ? '₹99/mo · ₹799/yr' : '₹199/mo · ₹1,499/yr'}
              </Badge>
            </div>
            <p className="text-xs text-stone-600">
              Includes a <strong>30-Day Free Trial</strong> for every new account. Cancel anytime without losing data.
            </p>
            <ul className="space-y-2 text-xs text-stone-800 pt-2">
              <li className="flex items-center gap-2">
                <Check size={14} className="text-[#0A6E3B] shrink-0" />
                <span><strong>Unlimited Active Product Listings</strong> (No 20/30 item cap)</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={14} className="text-[#0A6E3B] shrink-0" />
                <span>
                  {activeTier === 'cart_vendor'
                    ? 'AI Smart Route Optimization & High-Demand Stop Predictions'
                    : 'AI Stockout Risk Alerts & Competitor Price Intelligence'}
                </span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={14} className="text-[#0A6E3B] shrink-0" />
                <span>7-Day Predictive Neighbourhood Demand Forecasting</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={14} className="text-[#0A6E3B] shrink-0" />
                <span>Per-Product Views, Clicks, CTR & Customer Retention CRM</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={14} className="text-[#0A6E3B] shrink-0" />
                <span>Multi-Branch Management & Featured Local Promotions</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* CURRENT SUBSCRIPTION STATUS, BILLING HISTORY & NON-DESTRUCTIVE CANCELLATION (Part 4.4 & 4.6) */}
      {user?.role === 'vendor' && subStatus && (
        <div data-testid="vendor-subscription-status-card" className="mt-8 max-w-5xl mx-auto rounded-3xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-stone-500">Your Account Subscription Summary</div>
              <div className="font-display text-xl font-semibold text-stone-900 mt-1">
                Status: {subStatus.is_pro ? 'Pro Subscription Active' : subStatus.trial_active ? `30-Day Free Pro Trial (${subStatus.days_left} days left)` : 'Free Plan Active'}
              </div>
              <div className="text-xs text-stone-600 mt-0.5">
                Active Products: <strong>{subStatus.active_product_count ?? 0}</strong> / {subStatus.product_limit ?? 'Unlimited'}
                {subStatus.pro_expires_at && <span className="ml-3">· Renewal / Expiry: <strong>{new Date(subStatus.pro_expires_at).toLocaleDateString()}</strong></span>}
                {subStatus.trial_ends_at && !subStatus.is_pro && <span className="ml-3">· Trial Ends: <strong>{new Date(subStatus.trial_ends_at).toLocaleDateString()}</strong></span>}
              </div>
            </div>
            {subStatus.is_pro && !subStatus.subscription_cancelled && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={cancelBusy}
                onClick={handleCancelSubscription}
                data-testid="cancel-subscription-btn"
                className="rounded-full text-xs border-stone-300 text-stone-700 hover:text-rose-700"
              >
                {cancelBusy ? 'Updating...' : 'Cancel Auto-Renewal (Keep Products Safe)'}
              </Button>
            )}
          </div>

          {subStatus.billing_history?.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-stone-700 mb-2">Recent Billing & Payment History</div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {subStatus.billing_history.slice(0, 5).map((bh) => (
                  <div key={bh.id} className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-stone-50 border border-stone-200">
                    <div>
                      <span className="font-semibold text-stone-900 uppercase">{bh.plan}</span>
                      <span className="text-stone-500 ml-2">via {bh.payment_method || 'UPI / Online'}</span>
                      {bh.utr_number && <span className="font-mono text-[11px] text-stone-500 ml-2">UTR: {bh.utr_number}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-stone-900">₹{(bh.amount || 0) / 100}</span>
                      <Badge variant="outline" className="text-[10px]">{bh.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* DIRECT UPI QR CODE & PAYMENT SECTION FOR VENDORS AND RETAILERS */}
      {upiConfig.enabled && (
        <div data-testid="upi-qr-payment-section" className="mt-14 max-w-5xl mx-auto rounded-3xl border-2 border-emerald-200 bg-white shadow-xl shadow-emerald-900/5 overflow-hidden">
          <div className="bg-gradient-to-r from-[#0A6E3B] via-emerald-800 to-stone-900 px-6 md:px-8 py-5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur grid place-items-center">
                <QrCode size={22} className="text-emerald-200" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-lg md:text-xl font-semibold">Accepting Vendor & Retailer Payments via UPI QR</h2>
                  <Badge className="bg-emerald-400/20 text-emerald-200 border border-emerald-300/30 text-[10px]">Official UPI</Badge>
                </div>
                <p className="text-emerald-100/80 text-xs mt-0.5">
                  Scan QR code with any UPI app or pay directly to <span className="font-mono font-semibold text-white">{upiConfig.upi_id}</span>
                </p>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <div className="text-[10px] uppercase tracking-widest text-emerald-200">Payee Account</div>
              <div className="text-sm font-semibold text-white">{upiConfig.payee_name || 'LocalPrice Official'}</div>
            </div>
          </div>

          <div className="p-6 md:p-8 grid md:grid-cols-12 gap-8 items-center">
            {/* Left Column: QR Code Image + UPI ID */}
            <div className="md:col-span-5 flex flex-col items-center text-center bg-stone-50 rounded-2xl p-6 border border-stone-200">
              <div className="relative group">
                <img
                  data-testid="vendor-payment-qr-image"
                  src={upiConfig.qr_image_url || '/payment-qr.jpg'}
                  alt={`UPI QR Code - ${upiConfig.upi_id}`}
                  onClick={() => setQrZoomOpen(true)}
                  className="w-60 h-60 md:w-64 md:h-64 object-contain rounded-xl border-2 border-white shadow-md bg-white cursor-pointer transition-transform group-hover:scale-[1.02]"
                />
                <button
                  type="button"
                  onClick={() => setQrZoomOpen(true)}
                  className="absolute bottom-2 right-2 bg-stone-900/75 hover:bg-stone-900 text-white text-[11px] px-2.5 py-1 rounded-full inline-flex items-center gap-1 backdrop-blur-xs"
                >
                  <Maximize2 size={11} /> Enlarge
                </button>
              </div>

              {/* UPI ID Pill + Copy */}
              <div className="mt-4 w-full">
                <div className="text-[10px] uppercase tracking-widest text-stone-500 font-semibold">Official UPI ID</div>
                <div className="mt-1.5 flex items-center justify-between gap-2 bg-white border border-emerald-300 rounded-xl px-3.5 py-2.5 shadow-2xs">
                  <span data-testid="vendor-upi-id-text" className="font-mono text-sm md:text-base font-bold text-stone-900 select-all">
                    {upiConfig.upi_id}
                  </span>
                  <Button
                    data-testid="copy-upi-id-btn"
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={copyUpiId}
                    className="h-8 rounded-lg border-emerald-200 text-[#0A6E3B] hover:bg-emerald-50 text-xs shrink-0"
                  >
                    {copied ? <><CheckCircle2 size={13} className="mr-1 text-emerald-600" /> Copied</> : <><Copy size={13} className="mr-1" /> Copy UPI</>}
                  </Button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-center gap-2 w-full">
                <a
                  href={getUpiDeepLink(getActivePlanPriceRupees(selectedPlanKey), selectedPlanKey)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#0A6E3B] font-medium text-xs transition-colors border border-emerald-200"
                >
                  <Smartphone size={13} /> Open in UPI App <ExternalLink size={11} />
                </a>
                <a
                  href={upiConfig.qr_image_url || '/payment-qr.jpg'}
                  download="LocalPrice-UPI-QR.jpg"
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-stone-100 text-stone-700 font-medium text-xs transition-colors border border-stone-200"
                >
                  <Download size={13} /> Save QR
                </a>
              </div>

              <div className="mt-3 text-[11px] text-stone-500">
                Supports PhonePe · Google Pay · Paytm · BHIM · All UPI Apps
              </div>
            </div>

            {/* Right Column: Submit Payment / UTR Verification Form */}
            <div className="md:col-span-7 space-y-5">
              <div>
                <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 border-0 text-xs mb-2">
                  {upiConfig.verification_mode === 'auto_approve' ? '⚡ Instant Pro Activation' : '🛡️ Verified Activation'}
                </Badge>
                <h3 className="font-display text-2xl font-semibold text-stone-900">
                  Complete Your Vendor / Retailer Payment
                </h3>
                <p className="text-stone-600 text-sm mt-1">
                  {upiConfig.instructions}
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitUpiPayment({
                    planKey: selectedPlanKey,
                    utr: utrNumber,
                    payer: payerUpi,
                    notes: paymentNotes,
                    customAmt: customAmount,
                    fromModal: false,
                  });
                }}
                className="space-y-4 bg-stone-50/70 p-5 rounded-2xl border border-stone-200"
              >
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs uppercase tracking-wider text-stone-600">Select Plan / Payment Type</Label>
                    <Select value={selectedPlanKey} onValueChange={setSelectedPlanKey}>
                      <SelectTrigger data-testid="upi-plan-select" className="mt-1 bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {plans?.weekly && (
                          <SelectItem value="weekly">
                            Weekly Plan — ₹{plans.weekly.amount / 100} (7 days)
                          </SelectItem>
                        )}
                        {plans?.monthly && (
                          <SelectItem value="monthly">
                            Monthly Plan — ₹{plans.monthly.amount / 100} (30 days)
                          </SelectItem>
                        )}
                        {plans?.yearly && (
                          <SelectItem value="yearly">
                            Yearly Plan — ₹{plans.yearly.amount / 100} (365 days)
                          </SelectItem>
                        )}
                        <SelectItem value="custom">Custom Vendor / Retailer Payment Amount</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedPlanKey === 'custom' ? (
                    <div>
                      <Label className="text-xs uppercase tracking-wider text-stone-600">Amount Paid (₹ INR) *</Label>
                      <Input
                        data-testid="upi-custom-amount"
                        type="number"
                        min="1"
                        step="0.01"
                        required
                        value={customAmount}
                        onChange={(e) => setCustomAmount(e.target.value)}
                        placeholder="e.g. 500"
                        className="mt-1 bg-white font-semibold"
                      />
                    </div>
                  ) : (
                    <div>
                      <Label className="text-xs uppercase tracking-wider text-stone-600">Amount to Pay via QR / UPI</Label>
                      <div className="mt-1 h-9 px-3 rounded-md border border-emerald-200 bg-emerald-50/70 flex items-center justify-between">
                        <span className="font-display text-lg font-bold text-[#0A6E3B]">
                          ₹{getActivePlanPriceRupees(selectedPlanKey)}
                        </span>
                        <span className="text-[11px] text-emerald-800 font-medium">
                          Pay to {upiConfig.upi_id}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs uppercase tracking-wider text-stone-600">
                      UTR / UPI Reference No. (12 digits) *
                    </Label>
                    <Input
                      data-testid="upi-utr-input"
                      required
                      value={utrNumber}
                      onChange={(e) => setUtrNumber(e.target.value)}
                      placeholder="e.g. 412345678901"
                      className="mt-1 bg-white font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider text-stone-600">
                      Your UPI ID / Phone (Optional)
                    </Label>
                    <Input
                      data-testid="upi-payer-id"
                      value={payerUpi}
                      onChange={(e) => setPayerUpi(e.target.value)}
                      placeholder="e.g. yourname@okaxis"
                      className="mt-1 bg-white text-sm"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs uppercase tracking-wider text-stone-600">
                    Shop Name / Payment Note (Optional)
                  </Label>
                  <Input
                    data-testid="upi-payment-notes"
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    placeholder="e.g. Monthly subscription for Sharma Kirana Store"
                    className="mt-1 bg-white text-sm"
                  />
                </div>

                <div className="pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-stone-500 flex items-center gap-1.5">
                    <ShieldCheck size={15} className="text-[#0A6E3B] shrink-0" />
                    <span>All vendor & retailer transactions are logged and verifiable in the Admin Console.</span>
                  </div>
                  <Button
                    data-testid="submit-upi-payment-btn"
                    type="submit"
                    disabled={busy}
                    className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white px-6 shrink-0"
                  >
                    {busy ? 'Submitting…' : 'Submit Payment & Activate Pro'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <div className="mt-14 grid md:grid-cols-3 gap-4 max-w-4xl mx-auto">
        {PERKS.map((p, i) => (
          <div key={i} className="rounded-xl border border-stone-200 bg-white p-5">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-[#0A6E3B] grid place-items-center">{p.icon}</div>
            <div className="mt-3 text-sm font-medium text-stone-900">{p.text}</div>
          </div>
        ))}
      </div>

      <div className="mt-14 rounded-2xl border border-stone-200 bg-stone-50 p-6 text-center text-sm text-stone-600 max-w-3xl mx-auto">
        Payments accepted directly via <span className="font-semibold text-stone-900">Official UPI QR ({upiConfig.upi_id})</span>
        {razorpayEnabled && <> and <span className="font-semibold text-stone-900">Razorpay</span></>}. Prices in INR.
      </div>

      {/* PLAN CHECKOUT MODAL (UPI QR + RAZORPAY) */}
      <Dialog open={checkoutModalOpen} onOpenChange={setCheckoutModalOpen}>
        <DialogContent className="bg-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              Complete Subscription — ₹{modalAmountRupees}
            </DialogTitle>
            <DialogDescription>
              {activeTier === 'cart_vendor' ? 'Cart Vendor' : 'Retail Shop'} · {checkoutPlanKey.toUpperCase()} Plan ({modalPlanObj?.days || 30} days)
            </DialogDescription>
          </DialogHeader>

          {upiConfig.enabled && razorpayEnabled && (
            <div className="grid grid-cols-2 gap-2 p-1 bg-stone-100 rounded-xl">
              <button
                type="button"
                onClick={() => setCheckoutMethod('upi_qr')}
                className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  checkoutMethod === 'upi_qr' ? 'bg-[#0A6E3B] text-white shadow-xs' : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <QrCode size={14} /> Scan UPI QR ({upiConfig.upi_id})
              </button>
              <button
                type="button"
                onClick={() => setCheckoutMethod('razorpay')}
                className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  checkoutMethod === 'razorpay' ? 'bg-[#0A6E3B] text-white shadow-xs' : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <CreditCard size={14} /> Razorpay Gateway
              </button>
            </div>
          )}

          {checkoutMethod === 'upi_qr' && upiConfig.enabled ? (
            <div className="space-y-4 pt-1">
              <div className="flex flex-col items-center bg-stone-50 p-4 rounded-2xl border border-stone-200 text-center">
                <img
                  src={upiConfig.qr_image_url || '/payment-qr.jpg'}
                  alt="Payment QR Code"
                  className="w-48 h-48 object-contain rounded-xl border bg-white p-1 shadow-xs"
                />
                <div className="mt-3 flex items-center gap-2 bg-white border border-emerald-300 px-3 py-1.5 rounded-lg">
                  <span className="font-mono text-sm font-bold text-stone-900">{upiConfig.upi_id}</span>
                  <button
                    type="button"
                    onClick={copyUpiId}
                    className="text-xs text-[#0A6E3B] font-semibold hover:underline inline-flex items-center gap-1"
                  >
                    <Copy size={12} /> Copy
                  </button>
                </div>
                <div className="text-xs text-stone-600 mt-2">
                  Scan & pay <strong className="text-stone-900">₹{modalAmountRupees}</strong> to <strong>{upiConfig.upi_id}</strong>
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitUpiPayment({
                    planKey: checkoutPlanKey,
                    utr: modalUtr,
                    payer: modalPayerUpi,
                    fromModal: true,
                  });
                }}
                className="space-y-3"
              >
                <div>
                  <Label className="text-xs">Enter 12-Digit UTR / UPI Reference Number *</Label>
                  <Input
                    data-testid="modal-upi-utr"
                    required
                    value={modalUtr}
                    onChange={(e) => setModalUtr(e.target.value)}
                    placeholder="e.g. 412345678901"
                    className="mt-1 font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs">Your UPI ID (Optional)</Label>
                  <Input
                    value={modalPayerUpi}
                    onChange={(e) => setModalPayerUpi(e.target.value)}
                    placeholder="e.g. shopkeeper@ybl"
                    className="mt-1"
                  />
                </div>
                <Button
                  data-testid="modal-upi-submit"
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white h-11"
                >
                  {busy ? 'Verifying…' : `Confirm ₹${modalAmountRupees} Payment & Activate Pro`}
                </Button>
              </form>
            </div>
          ) : (
            <div className="space-y-4 py-4 text-center">
              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 text-sm text-stone-700">
                Proceed to Razorpay checkout to pay <strong>₹{modalAmountRupees}</strong> for the <strong>{checkoutPlanKey}</strong> plan.
              </div>
              <Button
                onClick={() => buyViaRazorpay(checkoutPlanKey)}
                disabled={busy}
                className="w-full rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white h-11"
              >
                {busy ? 'Opening Checkout…' : `Pay ₹${modalAmountRupees} via Razorpay`}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* QR ENLARGE MODAL */}
      <Dialog open={qrZoomOpen} onOpenChange={setQrZoomOpen}>
        <DialogContent className="bg-white max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="text-center font-display">Scan QR to Pay</DialogTitle>
            <DialogDescription className="text-center font-mono font-bold text-stone-900 text-base">
              {upiConfig.upi_id}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center py-2">
            <img
              src={upiConfig.qr_image_url || '/payment-qr.jpg'}
              alt="Enlarged UPI QR"
              className="w-72 h-72 object-contain rounded-xl border p-2 bg-white shadow-sm"
            />
            <Button onClick={copyUpiId} variant="outline" className="mt-4 rounded-full w-full">
              <Copy size={14} className="mr-2" /> Copy UPI ID ({upiConfig.upi_id})
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PlanCard({ title, price, compareRupees, discountPct, suffix, desc, onBuy, disabled, badge, highlighted, testId, buyTestId }) {
  return (
    <div data-testid={testId} className={`rounded-2xl p-8 relative ${highlighted ? 'border-2 border-[#0A6E3B] bg-white shadow-lg shadow-emerald-500/10' : 'border border-stone-200 bg-white'}`}>
      {badge && <Badge className="absolute -top-3 right-6 bg-amber-500 hover:bg-amber-500 text-white border-0">{badge}</Badge>}
      <div className="eyebrow text-stone-500">{title}</div>
      <div className="mt-3 flex items-baseline gap-2 flex-wrap">
        <span className="font-display text-5xl font-semibold text-stone-900">{price}</span>
        <span className="text-base text-stone-500 font-normal">{suffix}</span>
      </div>
      {compareRupees && discountPct > 0 && (
        <div className="mt-2 flex items-center gap-2 text-sm">
          <span className="text-stone-400 line-through">₹{compareRupees}</span>
          <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 border-0 text-[10px]">{discountPct}% OFF</Badge>
        </div>
      )}
      <div className="text-sm text-stone-600 mt-3">{desc}</div>
      <ul className="mt-6 space-y-2 text-sm">
        {PERKS.slice(0, 5).map((p, i) => (
          <li key={i} className="flex items-center gap-2 text-stone-700"><Check size={14} className="text-[#0A6E3B]" /> {p.text}</li>
        ))}
      </ul>
      <Button data-testid={buyTestId} onClick={onBuy} disabled={disabled} className={`w-full mt-8 rounded-full ${highlighted ? 'bg-[#0A6E3B] hover:bg-[#075030] text-white' : ''}`} variant={highlighted ? 'default' : 'outline'}>
        {disabled ? 'Please wait…' : `Get ${title}`}
      </Button>
    </div>
  );
}
