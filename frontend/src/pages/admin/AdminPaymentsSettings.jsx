import React, { useEffect, useState, useCallback } from 'react';
import { api, formatApiErrorDetail } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  CreditCard, Save, RotateCcw, Eye, EyeOff, ShieldCheck, AlertTriangle,
  QrCode, Upload, Copy, CheckCircle2, Pencil, Trash2, Plus, Store, Truck, Check, XCircle
} from 'lucide-react';

export default function AdminPaymentsSettings() {
  const [activeTab, setActiveTab] = useState('upi_qr'); // 'upi_qr' | 'plans' | 'submissions' | 'razorpay'
  const [settings, setSettings] = useState(null);
  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(false);

  // UPI QR Form State
  const [upiForm, setUpiForm] = useState({
    upi_qr_enabled: true,
    upi_id: '8955745543@yapl',
    upi_payee_name: 'LocalPrice Official',
    qr_image_url: '/payment-qr.jpg',
    upi_verification_mode: 'auto_approve',
    payment_instructions: '',
  });

  // Plan Pricing Form State (in Rupees for easy editing)
  const [plansForm, setPlansForm] = useState(null);

  // Razorpay Form State
  const [rzpForm, setRzpForm] = useState({
    razorpay_enabled: true,
    key_id: '',
    key_secret: '',
    mode: 'live',
  });
  const [showSecret, setShowSecret] = useState(false);

  // Orders Management States
  const [editingOrder, setEditingOrder] = useState(null);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    user_id: '',
    plan: 'monthly',
    tier: 'retailer',
    amount_rupees: '149',
    payment_method: 'upi_qr',
    utr_number: '',
    upi_id: '8955745543@yapl',
    status: 'paid',
    notes: '',
  });

  const initPlansFormFromData = (plansByTier) => {
    if (!plansByTier) return;
    const converted = {};
    for (const [tierKey, tierPlans] of Object.entries(plansByTier)) {
      converted[tierKey] = {};
      for (const [planKey, pVal] of Object.entries(tierPlans)) {
        converted[tierKey][planKey] = {
          amount_rupees: ((pVal.amount || 0) / 100).toString(),
          compare_rupees: ((pVal.compare_amount || 0) / 100).toString(),
          days: (pVal.days || 30).toString(),
          label: pVal.label || `${tierKey} ${planKey}`,
        };
      }
    }
    setPlansForm(converted);
  };

  const load = useCallback(async () => {
    try {
      const [sRes, oRes] = await Promise.all([
        api.get('/admin/settings/razorpay'),
        api.get('/admin/orders'),
      ]);
      const data = sRes.data;
      setSettings(data);
      setOrders(oRes.data || []);

      setUpiForm({
        upi_qr_enabled: data.upi_qr_enabled !== false,
        upi_id: data.upi_id || '8955745543@yapl',
        upi_payee_name: data.upi_payee_name || 'LocalPrice Official',
        qr_image_url: data.qr_image_url || '/payment-qr.jpg',
        upi_verification_mode: data.upi_verification_mode || 'auto_approve',
        payment_instructions: data.payment_instructions || '',
      });

      setRzpForm({
        razorpay_enabled: data.razorpay_enabled !== false,
        key_id: data.key_id || '',
        key_secret: '',
        mode: data.mode || 'live',
      });

      initPlansFormFromData(data.plans_by_tier);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || 'Failed to load payment settings');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Handle QR Code Image File Upload (converts to base64 data URI)
  const handleQrFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast.error('QR image file size should be under 4 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setUpiForm((prev) => ({ ...prev, qr_image_url: reader.result }));
        toast.success('QR image loaded! Click "Save UPI & QR Settings" to publish.');
      }
    };
    reader.readAsDataURL(file);
  };

  const saveUpiSettings = async (e) => {
    e.preventDefault();
    if (!upiForm.upi_id.trim()) {
      toast.error('UPI ID cannot be empty');
      return;
    }
    setBusy(true);
    try {
      await api.patch('/admin/settings/razorpay', {
        upi_qr_enabled: upiForm.upi_qr_enabled,
        upi_id: upiForm.upi_id.trim(),
        upi_payee_name: upiForm.upi_payee_name.trim() || 'LocalPrice Official',
        qr_image_url: upiForm.qr_image_url.trim() || '/payment-qr.jpg',
        upi_verification_mode: upiForm.upi_verification_mode,
        payment_instructions: upiForm.payment_instructions.trim(),
      });
      toast.success('UPI QR code & UPI ID settings saved!');
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const resetUpiSettings = async () => {
    if (!window.confirm('Reset UPI ID to 8955745543@yapl and restore the default QR code image?')) return;
    setBusy(true);
    try {
      await api.post('/admin/settings/upi-qr/reset');
      toast.success('Restored default UPI QR & UPI ID (8955745543@yapl)');
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const savePlanPricing = async (e) => {
    e.preventDefault();
    if (!plansForm) return;
    setBusy(true);
    try {
      const plans_override = {};
      for (const [tierKey, tierPlans] of Object.entries(plansForm)) {
        plans_override[tierKey] = {};
        for (const [planKey, pVal] of Object.entries(tierPlans)) {
          plans_override[tierKey][planKey] = {
            amount: Math.max(100, Math.round((parseFloat(pVal.amount_rupees) || 0) * 100)),
            compare_amount: Math.max(100, Math.round((parseFloat(pVal.compare_rupees) || 0) * 100)),
            days: Math.max(1, parseInt(pVal.days, 10) || 30),
            label: (pVal.label || '').trim() || `${tierKey} ${planKey}`,
          };
        }
      }
      await api.patch('/admin/settings/razorpay', { plans_override });
      toast.success('Vendor & Retailer plan pricing updated!');
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const resetPlanPricing = async () => {
    if (!window.confirm('Reset all Retailer and Cart Vendor plan prices to defaults?')) return;
    setBusy(true);
    try {
      await api.post('/admin/settings/plans/reset');
      toast.success('Plan prices reset to defaults');
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const saveRazorpay = async (e) => {
    e.preventDefault();
    setBusy(true);
    const payload = {
      mode: rzpForm.mode,
      razorpay_enabled: rzpForm.razorpay_enabled,
    };
    if (rzpForm.key_id?.trim()) payload.key_id = rzpForm.key_id.trim();
    if (rzpForm.key_secret?.trim()) payload.key_secret = rzpForm.key_secret.trim();
    try {
      await api.patch('/admin/settings/razorpay', payload);
      toast.success('Razorpay settings updated');
      setRzpForm((f) => ({ ...f, key_secret: '' }));
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const revertAll = async () => {
    if (!window.confirm('Remove all admin payment overrides and fall back to defaults?')) return;
    await api.delete('/admin/settings/razorpay');
    toast.success('Reverted to default values');
    load();
  };

  const handleApproveOrder = async (orderId) => {
    try {
      await api.post(`/admin/orders/${orderId}/approve`);
      toast.success('Payment approved & Vendor Pro plan activated!');
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const handleRejectOrder = async (orderId) => {
    try {
      await api.post(`/admin/orders/${orderId}/reject`);
      toast.success('Order marked as rejected/failed');
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const handleDeleteOrder = async (id) => {
    if (!window.confirm('Delete this payment order record?')) return;
    try {
      await api.delete(`/admin/orders/${id}`);
      toast.success('Order deleted');
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const handleSaveEditedOrder = async (e) => {
    e.preventDefault();
    if (!editingOrder) return;
    try {
      await api.patch(`/admin/orders/${editingOrder.id}`, {
        status: editingOrder.status,
        plan: editingOrder.plan,
        tier: editingOrder.tier,
        amount: Math.round((parseFloat(editingOrder.amount_rupees) || 0) * 100),
        utr_number: editingOrder.utr_number || '',
        upi_id: editingOrder.upi_id || '',
        payment_method: editingOrder.payment_method || 'upi_qr',
        notes: editingOrder.notes || '',
      });
      toast.success('Payment order updated');
      setEditingOrder(null);
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const handleCreateManualOrder = async (e) => {
    e.preventDefault();
    if (!manualForm.user_id.trim()) {
      toast.error('Please enter the Vendor User ID');
      return;
    }
    try {
      await api.post('/admin/orders/create-manual', {
        ...manualForm,
        user_id: manualForm.user_id.trim(),
        amount_rupees: parseFloat(manualForm.amount_rupees) || 149,
      });
      toast.success('Manual vendor payment recorded!');
      setManualModalOpen(false);
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  if (!settings) return <div className="text-stone-500">Loading payment settings…</div>;

  const pendingCount = orders.filter((o) => o.status === 'pending_verification').length;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-stone-900 flex items-center gap-2">
            <QrCode size={24} className="text-[#0A6E3B]" /> Vendor & Retailer Payment Control Center
          </h1>
          <p className="text-stone-600 text-sm mt-1">
            Full editability over the Official UPI QR Code ({settings.upi_id}), Plan Pricing, Vendor UTR Verifications, and Razorpay Gateway.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setManualForm((prev) => ({ ...prev, upi_id: upiForm.upi_id }));
            setManualModalOpen(true);
          }}
          className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white"
        >
          <Plus size={14} className="mr-1.5" /> Record Manual Vendor Payment
        </Button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap border-b border-stone-200 gap-6 text-sm font-medium">
        {[
          { id: 'upi_qr', label: 'UPI QR Code & UPI ID Settings', icon: <QrCode size={15} /> },
          { id: 'plans', label: 'Retailer & Vendor Plan Prices', icon: <Store size={15} /> },
          {
            id: 'submissions',
            label: `Vendor Payments & UTR Queue (${orders.length})`,
            badge: pendingCount > 0 ? `${pendingCount} pending` : null,
          },
          { id: 'razorpay', label: 'Razorpay Gateway Credentials', icon: <CreditCard size={15} /> },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`pb-3 inline-flex items-center gap-2 transition-colors ${
              activeTab === t.id
                ? 'border-b-2 border-[#0A6E3B] text-[#0A6E3B] font-semibold'
                : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
            {t.badge && (
              <Badge className="bg-amber-500 text-white border-0 text-[10px] px-1.5 py-0">{t.badge}</Badge>
            )}
          </button>
        ))}
      </div>

      {/* TAB 1: UPI QR CODE & UPI ID FULL EDITABILITY */}
      {activeTab === 'upi_qr' && (
        <div className="grid lg:grid-cols-12 gap-6 items-start">
          {/* Edit Form */}
          <form
            onSubmit={saveUpiSettings}
            className="lg:col-span-7 rounded-2xl bg-white border border-stone-200 p-6 space-y-5 shadow-2xs"
          >
            <div className="flex items-center justify-between pb-4 border-b border-stone-100">
              <div>
                <h2 className="font-display text-lg font-semibold text-stone-900">
                  Accept Payments via UPI QR & UPI ID
                </h2>
                <p className="text-xs text-stone-500">
                  Shown to all Retailers & Cart Vendors in the Payments / Upgrade section.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs font-semibold text-stone-700">
                  {upiForm.upi_qr_enabled ? 'Enabled' : 'Disabled'}
                </Label>
                <Switch
                  data-testid="admin-upi-enabled-switch"
                  checked={upiForm.upi_qr_enabled}
                  onCheckedChange={(v) => setUpiForm({ ...upiForm, upi_qr_enabled: v })}
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs uppercase tracking-widest text-stone-500">
                  Official UPI ID *
                </Label>
                <Input
                  data-testid="admin-upi-id-input"
                  required
                  value={upiForm.upi_id}
                  onChange={(e) => setUpiForm({ ...upiForm, upi_id: e.target.value })}
                  placeholder="8955745543@yapl"
                  className="font-mono text-sm mt-1 font-semibold"
                />
                <p className="text-[10px] text-stone-500 mt-1">
                  Default from uploaded QR: <code>8955745543@yapl</code>
                </p>
              </div>

              <div>
                <Label className="text-xs uppercase tracking-widest text-stone-500">
                  Payee / Account Name
                </Label>
                <Input
                  data-testid="admin-upi-payee-input"
                  value={upiForm.upi_payee_name}
                  onChange={(e) => setUpiForm({ ...upiForm, upi_payee_name: e.target.value })}
                  placeholder="LocalPrice Official"
                  className="text-sm mt-1"
                />
                <p className="text-[10px] text-stone-500 mt-1">
                  Displayed on the QR payment banner & UPI deep link.
                </p>
              </div>
            </div>

            {/* QR Image Upload + URL Editor */}
            <div className="space-y-3 bg-stone-50 p-4 rounded-xl border border-stone-200">
              <Label className="text-xs uppercase tracking-widest text-stone-600">
                QR Code Image (Upload File or Enter Image Path / URL)
              </Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  data-testid="admin-qr-image-url-input"
                  value={upiForm.qr_image_url}
                  onChange={(e) => setUpiForm({ ...upiForm, qr_image_url: e.target.value })}
                  placeholder="/payment-qr.jpg or https://..."
                  className="font-mono text-xs bg-white flex-1"
                />
                <label className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-stone-300 hover:bg-stone-100 text-xs font-medium text-stone-800 cursor-pointer shrink-0">
                  <Upload size={14} className="text-[#0A6E3B]" />
                  <span>Upload New QR Image</span>
                  <input
                    data-testid="admin-qr-file-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleQrFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
              <p className="text-[10px] text-stone-500">
                You can upload any PNG/JPG QR code from your computer or keep <code>/payment-qr.jpg</code>.
              </p>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-widest text-stone-500">
                UTR Verification & Pro Activation Mode
              </Label>
              <Select
                value={upiForm.upi_verification_mode}
                onValueChange={(v) => setUpiForm({ ...upiForm, upi_verification_mode: v })}
              >
                <SelectTrigger data-testid="admin-upi-verification-mode" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto_approve">
                    Instant Auto-Approve — Activate Pro immediately when vendor submits UTR
                  </SelectItem>
                  <SelectItem value="manual_approval">
                    Manual Admin Review — Hold order as "pending_verification" until Admin approves
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-widest text-stone-500">
                Custom Payment Instructions for Vendors & Retailers
              </Label>
              <Textarea
                data-testid="admin-upi-instructions-input"
                rows={3}
                value={upiForm.payment_instructions}
                onChange={(e) => setUpiForm({ ...upiForm, payment_instructions: e.target.value })}
                placeholder="Instructions shown to vendors when scanning the QR code..."
                className="text-sm mt-1"
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                data-testid="save-upi-settings-btn"
                type="submit"
                disabled={busy}
                className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white"
              >
                <Save size={14} className="mr-1.5" /> {busy ? 'Saving…' : 'Save UPI & QR Settings'}
              </Button>
              <Button
                data-testid="reset-upi-settings-btn"
                type="button"
                variant="outline"
                onClick={resetUpiSettings}
                disabled={busy}
                className="rounded-full"
              >
                <RotateCcw size={14} className="mr-1.5" /> Reset Default QR (8955745543@yapl)
              </Button>
            </div>
          </form>

          {/* Live Preview Card */}
          <div className="lg:col-span-5 rounded-2xl bg-white border border-stone-200 p-6 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-widest text-stone-500 font-semibold">
                Live Vendor Preview
              </span>
              <Badge
                className={
                  upiForm.upi_qr_enabled
                    ? 'bg-emerald-600 text-white border-0'
                    : 'bg-stone-200 text-stone-700 border-0'
                }
              >
                {upiForm.upi_qr_enabled ? 'LIVE ON PAYMENTS PAGE' : 'HIDDEN'}
              </Badge>
            </div>

            <div className="rounded-2xl bg-stone-50 border border-stone-200 p-5 flex flex-col items-center text-center">
              <div className="text-xs font-semibold text-stone-700 mb-2">
                {upiForm.upi_payee_name || 'LocalPrice Official'}
              </div>
              <img
                data-testid="admin-qr-preview-img"
                src={upiForm.qr_image_url || '/payment-qr.jpg'}
                alt="QR Code Preview"
                className="w-56 h-56 object-contain rounded-xl border bg-white p-2 shadow-xs"
              />
              <div className="mt-4 w-full bg-white border border-emerald-300 rounded-xl px-3 py-2 flex items-center justify-between">
                <span className="font-mono text-sm font-bold text-stone-900">{upiForm.upi_id}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(upiForm.upi_id);
                    toast.success('Copied UPI ID');
                  }}
                  className="text-xs text-[#0A6E3B] font-semibold inline-flex items-center gap-1"
                >
                  <Copy size={12} /> Copy
                </button>
              </div>
              <p className="text-xs text-stone-600 mt-3 leading-relaxed">
                {upiForm.payment_instructions}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: EDITABLE PLAN PRICING FOR RETAILERS & CART VENDORS */}
      {activeTab === 'plans' && plansForm && (
        <form onSubmit={savePlanPricing} className="space-y-6 max-w-4xl">
          <div className="rounded-2xl bg-white border border-stone-200 p-6 space-y-6">
            <div>
              <h2 className="font-display text-lg font-semibold text-stone-900 flex items-center gap-2">
                <Store size={18} className="text-[#0A6E3B]" /> Retailer Subscription Plans
              </h2>
              <p className="text-xs text-stone-500">
                Edit the prices (in ₹ INR) and duration (days) charged to Retail Shops.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              {Object.entries(plansForm.retailer || {}).map(([pKey, pVal]) => (
                <div key={pKey} className="p-4 rounded-xl border border-stone-200 bg-stone-50 space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge className="bg-[#0A6E3B] text-white border-0 uppercase">{pKey}</Badge>
                    <span className="text-xs text-stone-500">Retailer Tier</span>
                  </div>
                  <div>
                    <Label className="text-xs">Plan Display Label</Label>
                    <Input
                      value={pVal.label}
                      onChange={(e) =>
                        setPlansForm({
                          ...plansForm,
                          retailer: {
                            ...plansForm.retailer,
                            [pKey]: { ...pVal, label: e.target.value },
                          },
                        })
                      }
                      className="mt-1 bg-white text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">Price (₹)</Label>
                      <Input
                        type="number"
                        step="1"
                        value={pVal.amount_rupees}
                        onChange={(e) =>
                          setPlansForm({
                            ...plansForm,
                            retailer: {
                              ...plansForm.retailer,
                              [pKey]: { ...pVal, amount_rupees: e.target.value },
                            },
                          })
                        }
                        className="mt-1 bg-white font-semibold"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Compare (₹)</Label>
                      <Input
                        type="number"
                        step="1"
                        value={pVal.compare_rupees}
                        onChange={(e) =>
                          setPlansForm({
                            ...plansForm,
                            retailer: {
                              ...plansForm.retailer,
                              [pKey]: { ...pVal, compare_rupees: e.target.value },
                            },
                          })
                        }
                        className="mt-1 bg-white"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Days</Label>
                      <Input
                        type="number"
                        value={pVal.days}
                        onChange={(e) =>
                          setPlansForm({
                            ...plansForm,
                            retailer: {
                              ...plansForm.retailer,
                              [pKey]: { ...pVal, days: e.target.value },
                            },
                          })
                        }
                        className="mt-1 bg-white"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-stone-200">
              <h2 className="font-display text-lg font-semibold text-stone-900 flex items-center gap-2">
                <Truck size={18} className="text-[#0A6E3B]" /> Cart Vendor Subscription Plans
              </h2>
              <p className="text-xs text-stone-500">
                Edit the prices (in ₹ INR) and duration (days) charged to Mobile / Cart Vendors.
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              {Object.entries(plansForm.cart_vendor || {}).map(([pKey, pVal]) => (
                <div key={pKey} className="p-4 rounded-xl border border-stone-200 bg-stone-50 space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge className="bg-amber-600 text-white border-0 uppercase">{pKey}</Badge>
                    <span className="text-xs text-stone-500">Cart Tier</span>
                  </div>
                  <div>
                    <Label className="text-xs">Plan Display Label</Label>
                    <Input
                      value={pVal.label}
                      onChange={(e) =>
                        setPlansForm({
                          ...plansForm,
                          cart_vendor: {
                            ...plansForm.cart_vendor,
                            [pKey]: { ...pVal, label: e.target.value },
                          },
                        })
                      }
                      className="mt-1 bg-white text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">Price (₹)</Label>
                      <Input
                        type="number"
                        step="1"
                        value={pVal.amount_rupees}
                        onChange={(e) =>
                          setPlansForm({
                            ...plansForm,
                            cart_vendor: {
                              ...plansForm.cart_vendor,
                              [pKey]: { ...pVal, amount_rupees: e.target.value },
                            },
                          })
                        }
                        className="mt-1 bg-white font-semibold"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Compare (₹)</Label>
                      <Input
                        type="number"
                        step="1"
                        value={pVal.compare_rupees}
                        onChange={(e) =>
                          setPlansForm({
                            ...plansForm,
                            cart_vendor: {
                              ...plansForm.cart_vendor,
                              [pKey]: { ...pVal, compare_rupees: e.target.value },
                            },
                          })
                        }
                        className="mt-1 bg-white"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Days</Label>
                      <Input
                        type="number"
                        value={pVal.days}
                        onChange={(e) =>
                          setPlansForm({
                            ...plansForm,
                            cart_vendor: {
                              ...plansForm.cart_vendor,
                              [pKey]: { ...pVal, days: e.target.value },
                            },
                          })
                        }
                        className="mt-1 bg-white"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                data-testid="save-plan-pricing-btn"
                type="submit"
                disabled={busy}
                className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white"
              >
                <Save size={14} className="mr-1.5" /> {busy ? 'Saving…' : 'Save Plan Prices'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={resetPlanPricing}
                disabled={busy}
                className="rounded-full"
              >
                <RotateCcw size={14} className="mr-1.5" /> Reset Default Prices
              </Button>
            </div>
          </div>
        </form>
      )}

      {/* TAB 3: VENDOR PAYMENTS & UTR VERIFICATION QUEUE */}
      {activeTab === 'submissions' && (
        <div className="rounded-2xl border border-stone-200 bg-white overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-stone-50">
                <TableHead>Order ID</TableHead>
                <TableHead>Vendor / Shop</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Method & UTR</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Admin Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">{o.order_id}</TableCell>
                  <TableCell>
                    <div className="text-xs font-semibold text-stone-900">
                      {o.shop_name || o.vendor_name || 'Vendor'}
                    </div>
                    <div className="text-[10px] font-mono text-stone-500">{o.user_id}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {o.plan} ({o.tier || 'retailer'})
                    </Badge>
                  </TableCell>
                  <TableCell className="font-semibold">
                    ₹{(((o.amount || 0) / 100) || 0).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge
                        className={
                          o.payment_method === 'upi_qr'
                            ? 'bg-emerald-100 text-emerald-900 border-0 text-[10px]'
                            : 'bg-stone-100 text-stone-700 border-0 text-[10px]'
                        }
                      >
                        {o.payment_method === 'upi_qr' ? 'UPI QR' : o.payment_method || 'Razorpay'}
                      </Badge>
                      {o.utr_number && (
                        <span className="font-mono text-xs font-semibold text-stone-800">
                          UTR: {o.utr_number}
                        </span>
                      )}
                    </div>
                    {o.upi_id && (
                      <div className="text-[10px] text-stone-500 font-mono mt-0.5">
                        To: {o.upi_id}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        o.status === 'paid'
                          ? 'bg-emerald-600 text-white border-0'
                          : o.status === 'pending_verification'
                          ? 'bg-amber-500 text-white border-0'
                          : o.status === 'failed'
                          ? 'bg-red-600 text-white border-0'
                          : ''
                      }
                    >
                      {o.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-stone-500">
                    {o.created_at ? new Date(o.created_at).toLocaleString() : '—'}
                  </TableCell>
                  <TableCell className="text-right space-x-1 whitespace-nowrap">
                    {o.status !== 'paid' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleApproveOrder(o.id)}
                        className="h-7 text-xs border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                        title="Approve & Activate Pro"
                      >
                        <Check size={12} className="mr-1" /> Approve
                      </Button>
                    )}
                    {o.status !== 'failed' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRejectOrder(o.id)}
                        className="h-7 text-xs text-amber-700 hover:bg-amber-50"
                        title="Reject Payment"
                      >
                        <XCircle size={13} />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setEditingOrder({
                          ...o,
                          amount_rupees: (((o.amount || 0) / 100) || 0).toString(),
                        })
                      }
                      title="Edit Payment Record"
                    >
                      <Pencil size={13} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteOrder(o.id)}
                      className="text-red-600"
                      title="Delete Order"
                    >
                      <Trash2 size={13} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-stone-500 text-sm">
                    No vendor payment submissions yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* TAB 4: RAZORPAY GATEWAY SETTINGS */}
      {activeTab === 'razorpay' && (
        <div className="space-y-6 max-w-2xl">
          <div className={`rounded-2xl p-5 border ${settings.is_live_key ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  {settings.is_live_key ? <ShieldCheck size={16} className="text-emerald-700" /> : <AlertTriangle size={16} className="text-amber-700" />}
                  <div className={`text-sm font-semibold ${settings.is_live_key ? 'text-emerald-900' : 'text-amber-900'}`}>
                    {settings.is_live_key ? 'LIVE MODE — real money' : settings.is_test_key ? 'TEST MODE — sandbox transactions' : 'No live key configured'}
                  </div>
                </div>
                <div className={`text-xs mt-1 ${settings.is_live_key ? 'text-emerald-800' : 'text-amber-800'}`}>
                  Source: <strong>{settings.source === 'admin_override' ? 'Admin override (from this panel)' : 'Environment file'}</strong>
                  {settings.updated_at && ` · Last updated: ${new Date(settings.updated_at).toLocaleString()}`}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-stone-500">Active Key ID</div>
                <div className="font-mono text-xs text-stone-800">{settings.active_key_id}</div>
              </div>
            </div>
          </div>

          <form onSubmit={saveRazorpay} className="rounded-2xl bg-white border border-stone-200 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div>
                <div className="text-sm font-semibold text-stone-900">Enable Razorpay Checkout Option</div>
                <div className="text-xs text-stone-500">Allow vendors to also pay via Razorpay alongside UPI QR</div>
              </div>
              <Switch
                checked={rzpForm.razorpay_enabled}
                onCheckedChange={(v) => setRzpForm({ ...rzpForm, razorpay_enabled: v })}
              />
            </div>

            <div>
              <Label className="text-xs uppercase tracking-widest text-stone-500">Razorpay Key ID</Label>
              <Input
                data-testid="razorpay-key-id"
                value={rzpForm.key_id}
                onChange={(e) => setRzpForm({ ...rzpForm, key_id: e.target.value })}
                placeholder="rzp_live_XXXXXXXX or rzp_test_XXXXXXXX"
                className="font-mono text-sm mt-1"
              />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-stone-500">Razorpay Key Secret</Label>
              <div className="relative mt-1">
                <Input
                  data-testid="razorpay-key-secret"
                  type={showSecret ? 'text' : 'password'}
                  value={rzpForm.key_secret}
                  onChange={(e) => setRzpForm({ ...rzpForm, key_secret: e.target.value })}
                  placeholder={settings.has_secret ? `Current: ${settings.secret_preview} — leave blank to keep` : 'Paste the secret here'}
                  className="font-mono text-sm pr-10"
                />
                <button type="button" onClick={() => setShowSecret((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-800">
                  {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-stone-500">Mode</Label>
              <Select value={rzpForm.mode} onValueChange={(v) => setRzpForm({ ...rzpForm, mode: v })}>
                <SelectTrigger data-testid="razorpay-mode" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="live">Live — process real payments</SelectItem>
                  <SelectItem value="mock">Mock — auto-approve for demos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button data-testid="save-razorpay" type="submit" disabled={busy} className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white">
                <Save size={14} className="mr-1.5" /> {busy ? 'Saving…' : 'Save Razorpay Settings'}
              </Button>
              {settings.source === 'admin_override' && (
                <Button data-testid="revert-razorpay" type="button" variant="outline" onClick={revertAll} className="rounded-full">
                  <RotateCcw size={14} className="mr-1.5" /> Revert All Overrides
                </Button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* EDIT PAYMENT ORDER DIALOG */}
      <Dialog open={!!editingOrder} onOpenChange={(v) => !v && setEditingOrder(null)}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Vendor Payment Order</DialogTitle>
          </DialogHeader>
          {editingOrder && (
            <form onSubmit={handleSaveEditedOrder} className="space-y-3">
              <div>
                <Label className="text-xs">Order ID</Label>
                <Input disabled value={editingOrder.order_id || ''} className="font-mono text-xs" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Amount (₹)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editingOrder.amount_rupees || ''}
                    onChange={(e) => setEditingOrder({ ...editingOrder, amount_rupees: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs">Plan</Label>
                  <Input
                    value={editingOrder.plan || ''}
                    onChange={(e) => setEditingOrder({ ...editingOrder, plan: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Payment Method</Label>
                  <Select
                    value={editingOrder.payment_method || 'upi_qr'}
                    onValueChange={(v) => setEditingOrder({ ...editingOrder, payment_method: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="upi_qr">UPI QR</SelectItem>
                      <SelectItem value="razorpay">Razorpay</SelectItem>
                      <SelectItem value="cash">Cash / Manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Status</Label>
                  <Select
                    value={editingOrder.status || 'created'}
                    onValueChange={(v) => setEditingOrder({ ...editingOrder, status: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paid">Paid (Activates Pro)</SelectItem>
                      <SelectItem value="pending_verification">Pending Verification</SelectItem>
                      <SelectItem value="created">Created</SelectItem>
                      <SelectItem value="failed">Failed / Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">UTR / Reference No.</Label>
                  <Input
                    value={editingOrder.utr_number || ''}
                    onChange={(e) => setEditingOrder({ ...editingOrder, utr_number: e.target.value })}
                    className="font-mono text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">UPI ID Paid To</Label>
                  <Input
                    value={editingOrder.upi_id || ''}
                    onChange={(e) => setEditingOrder({ ...editingOrder, upi_id: e.target.value })}
                    className="font-mono text-xs"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Input
                  value={editingOrder.notes || ''}
                  onChange={(e) => setEditingOrder({ ...editingOrder, notes: e.target.value })}
                />
              </div>
              <DialogFooter className="pt-2">
                <Button type="submit" className="bg-[#0A6E3B] hover:bg-[#075030] text-white rounded-full">
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* RECORD MANUAL PAYMENT DIALOG */}
      <Dialog open={manualModalOpen} onOpenChange={setManualModalOpen}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader>
            <DialogTitle>Record Manual Vendor / Retailer Payment</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateManualOrder} className="space-y-3">
            <div>
              <Label className="text-xs">Vendor User ID *</Label>
              <Input
                required
                value={manualForm.user_id}
                onChange={(e) => setManualForm({ ...manualForm, user_id: e.target.value })}
                placeholder="Paste vendor user ID"
                className="font-mono text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Tier</Label>
                <Select
                  value={manualForm.tier}
                  onValueChange={(v) => setManualForm({ ...manualForm, tier: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="retailer">Retailer</SelectItem>
                    <SelectItem value="cart_vendor">Cart Vendor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Plan</Label>
                <Select
                  value={manualForm.plan}
                  onValueChange={(v) => setManualForm({ ...manualForm, plan: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Amount Paid (₹)</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={manualForm.amount_rupees}
                  onChange={(e) => setManualForm({ ...manualForm, amount_rupees: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">UTR / Ref Number</Label>
                <Input
                  value={manualForm.utr_number}
                  onChange={(e) => setManualForm({ ...manualForm, utr_number: e.target.value })}
                  placeholder="12-digit UTR"
                  className="font-mono text-xs"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">UPI ID</Label>
                <Input
                  value={manualForm.upi_id}
                  onChange={(e) => setManualForm({ ...manualForm, upi_id: e.target.value })}
                  className="font-mono text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select
                  value={manualForm.status}
                  onValueChange={(v) => setManualForm({ ...manualForm, status: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">Paid (Activate Pro)</SelectItem>
                    <SelectItem value="pending_verification">Pending Verification</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button type="submit" className="bg-[#0A6E3B] hover:bg-[#075030] text-white rounded-full">
                Record Payment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
