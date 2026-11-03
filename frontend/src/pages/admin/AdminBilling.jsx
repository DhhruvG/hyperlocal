import React, { useEffect, useState, useCallback } from 'react';
import { api, formatApiErrorDetail } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  CreditCard, Receipt, TrendingUp, Users, ShoppingBag, ShieldCheck,
  AlertTriangle, CheckCircle2, Download, Search, RefreshCw, Eye,
  RotateCcw, ArrowRight, Store, DollarSign, Filter, Layers, ShieldAlert,
  HelpCircle, Printer, XCircle
} from 'lucide-react';

export default function AdminBilling() {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'orders' | 'invoices' | 'reconciliation' | 'settings'

  const [dashboard, setDashboard] = useState(null);
  const [orders, setOrders] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [reconciliation, setReconciliation] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');

  // Inspection modal
  const [inspectOrder, setInspectOrder] = useState(null);
  const [correctionModal, setCorrectionModal] = useState(false);
  const [correctionForm, setCorrectionForm] = useState({ order_status: '', reason: '' });
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false);

  // Digital Invoice Modal
  const [inspectInvoice, setInspectInvoice] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [dRes, oRes, iRes, rRes, sRes] = await Promise.all([
        api.get('/admin/billing/dashboard'),
        api.get('/admin/billing/orders', { params: { search: orderSearch || undefined, status: orderStatusFilter !== 'all' ? orderStatusFilter : undefined } }),
        api.get('/admin/billing/invoices'),
        api.get('/admin/billing/reconciliation'),
        api.get('/admin/billing/settings'),
      ]);
      setDashboard(dRes.data);
      setOrders(oRes.data);
      setInvoices(iRes.data);
      setReconciliation(rRes.data);
      setSettings(sRes.data);
    } catch {
      toast.error('Failed to load billing administration data');
    } finally {
      setLoading(false);
    }
  }, [orderSearch, orderStatusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleSwitch = async (flagName, currentValue) => {
    try {
      const updated = { [flagName]: !currentValue };
      await api.patch('/admin/billing/settings', updated);
      setSettings(prev => ({ ...prev, ...updated }));
      toast.success(`Updated ${flagName} to ${!currentValue ? 'ENABLED' : 'PAUSED'}`);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const handleApplyCorrection = async (e) => {
    e.preventDefault();
    if (!correctionForm.reason.trim()) {
      toast.error('Please specify an audited reason for this correction');
      return;
    }
    setCorrectionSubmitting(true);
    try {
      await api.patch(`/admin/billing/orders/${inspectOrder.order_id}`, {
        order_status: correctionForm.order_status || undefined,
        reason: correctionForm.reason.trim(),
      });
      toast.success('Order operational metadata updated');
      setCorrectionModal(false);
      setInspectOrder(null);
      loadData();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setCorrectionSubmitting(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      const res = await api.get('/admin/billing/export');
      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hyperlocal_billing_audit_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Downloaded billing audit export');
    } catch {
      toast.error('Failed to export CSV');
    }
  };

  if (loading && !dashboard) {
    return (
      <div className="p-8 text-center text-stone-500">
        <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-emerald-600" />
        Loading Billing & Checkout Control Center…
      </div>
    );
  }

  const overview = dashboard?.overview || {};
  const ordersStats = dashboard?.orders || {};
  const customerStats = dashboard?.customers || {};

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-stone-900 flex items-center gap-2">
            <Receipt size={28} className="text-emerald-700" /> In-App Billing & Checkout Control
          </h1>
          <p className="text-stone-500 text-xs mt-1">
            Master control center for in-app orders, digital invoices, payment reconciliation, and sales attribution.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="rounded-full text-xs">
            <Download size={13} className="mr-1.5" /> Export Transactions CSV
          </Button>
          <Button variant="outline" size="sm" onClick={loadData} className="rounded-full text-xs">
            <RefreshCw size={13} className="mr-1.5" /> Refresh Data
          </Button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-stone-200 gap-6 text-sm font-medium">
        {[
          { id: 'overview', label: 'Overview & KPIs' },
          { id: 'orders', label: `Orders (${orders.length})` },
          { id: 'invoices', label: `Invoices (${invoices.length})` },
          { id: 'reconciliation', label: `Payment Reconciliation (${reconciliation?.discrepancies_count || 0} issues)` },
          { id: 'settings', label: 'Emergency Switches & Settings' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`pb-3 transition-colors ${activeTab === tab.id ? 'border-b-2 border-emerald-600 text-emerald-800 font-semibold' : 'text-stone-500 hover:text-stone-900'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW & KPIS */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-white border border-stone-200 shadow-xs">
              <div className="text-xs uppercase font-semibold text-stone-400 flex items-center justify-between">
                <span>Gross Transaction Value</span>
                <DollarSign size={16} className="text-emerald-600" />
              </div>
              <div className="text-2xl font-bold text-stone-900 mt-2">
                ₹{overview.gross_transaction_value || 0}
              </div>
              <p className="text-[11px] text-stone-500 mt-1">Total value across completed in-app orders</p>
            </div>

            <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 shadow-xs">
              <div className="text-xs uppercase font-semibold text-emerald-800 flex items-center justify-between">
                <span>HyperLocal-Attributed</span>
                <TrendingUp size={16} className="text-emerald-700" />
              </div>
              <div className="text-2xl font-bold text-emerald-950 mt-2">
                ₹{overview.attributed_revenue || 0}
              </div>
              <p className="text-[11px] text-emerald-800 mt-1">Verified sales originated via platform</p>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-stone-200 shadow-xs">
              <div className="text-xs uppercase font-semibold text-stone-400 flex items-center justify-between">
                <span>Orders Processed</span>
                <ShoppingBag size={16} className="text-blue-600" />
              </div>
              <div className="text-2xl font-bold text-stone-900 mt-2">
                {ordersStats.completed || 0} <span className="text-xs font-normal text-stone-500">/ {ordersStats.total || 0} total</span>
              </div>
              <p className="text-[11px] text-stone-500 mt-1">
                {ordersStats.pending || 0} pending · {ordersStats.cancelled || 0} cancelled
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-stone-200 shadow-xs">
              <div className="text-xs uppercase font-semibold text-stone-400 flex items-center justify-between">
                <span>Customer Acquisition</span>
                <Users size={16} className="text-purple-600" />
              </div>
              <div className="text-2xl font-bold text-stone-900 mt-2">
                {customerStats.new_customer_orders || 0} <span className="text-xs font-normal text-stone-500">New Shoppers</span>
              </div>
              <p className="text-[11px] text-stone-500 mt-1">
                {customerStats.returning_customer_orders || 0} returning purchases recorded
              </p>
            </div>
          </div>

          {/* Policy disclaimer banner */}
          <div className="p-4 bg-stone-100 rounded-xl border border-stone-200 text-xs text-stone-600 flex items-center gap-2">
            <ShieldCheck size={16} className="text-stone-500 shrink-0" />
            <span><strong>Mandatory Attribution Standard:</strong> {overview.disclaimer}</span>
          </div>

          {/* Emergency Switches Summary */}
          <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-stone-900 mb-4 flex items-center gap-2">
              <ShieldAlert size={16} className="text-amber-600" /> Master Feature Toggles
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 flex items-center justify-between">
                <span className="text-xs font-medium text-stone-800">Marketplace Billing</span>
                <Badge className={settings?.billing_enabled ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}>
                  {settings?.billing_enabled ? 'ACTIVE' : 'PAUSED'}
                </Badge>
              </div>
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 flex items-center justify-between">
                <span className="text-xs font-medium text-stone-800">Customer Checkout</span>
                <Badge className={settings?.checkout_enabled ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}>
                  {settings?.checkout_enabled ? 'ACTIVE' : 'PAUSED'}
                </Badge>
              </div>
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 flex items-center justify-between">
                <span className="text-xs font-medium text-stone-800">Cash Payments</span>
                <Badge className={settings?.cash_payment_enabled ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}>
                  {settings?.cash_payment_enabled ? 'ACTIVE' : 'PAUSED'}
                </Badge>
              </div>
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 flex items-center justify-between">
                <span className="text-xs font-medium text-stone-800">Online Payments</span>
                <Badge className={settings?.online_payment_enabled ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}>
                  {settings?.online_payment_enabled ? 'ACTIVE' : 'PAUSED'}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ORDERS MANAGEMENT */}
      {activeTab === 'orders' && (
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-stone-100 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative w-full sm:w-72">
                <Search size={14} className="absolute left-3 top-2.5 text-stone-400" />
                <Input
                  placeholder="Search Order ID, Invoice, Customer, Shop…"
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  className="pl-8 text-xs h-9"
                />
              </div>
              <Select value={orderStatusFilter} onValueChange={setOrderStatusFilter}>
                <SelectTrigger className="w-40 text-xs h-9">
                  <SelectValue placeholder="Status Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="PENDING_SELLER_CONFIRMATION">Pending Confirmation</SelectItem>
                  <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                  <SelectItem value="READY_FOR_PICKUP">Ready for Pickup</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  <SelectItem value="REFUNDED">Refunded</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-stone-500">
              Showing {orders.length} orders
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-stone-50 text-[11px] uppercase text-stone-500">
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Seller Shop</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Mode / Method</TableHead>
                  <TableHead>Order Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs divide-y divide-stone-100">
                {orders.map((o) => (
                  <TableRow key={o.order_id} className="hover:bg-stone-50/60">
                    <TableCell className="font-mono font-medium text-stone-900">{o.order_id}</TableCell>
                    <TableCell className="text-stone-500">{o.created_at ? new Date(o.created_at).toLocaleDateString() : '—'}</TableCell>
                    <TableCell>
                      <div className="font-medium text-stone-900">{o.customer_name}</div>
                      <div className="text-[10px] text-stone-400">{o.customer_phone}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-stone-900">{o.seller_shop_name}</div>
                      <div className="text-[10px] text-stone-400">{o.seller_vendor_type}</div>
                    </TableCell>
                    <TableCell className="font-semibold text-stone-900">₹{o.total_amount}</TableCell>
                    <TableCell>
                      <div>{o.checkout_mode === 'RESERVE_AT_SHOP' ? 'Reserve' : 'Online'}</div>
                      <div className="text-[10px] text-stone-400">{o.payment_method}</div>
                    </TableCell>
                    <TableCell>
                      <Badge className={
                        o.order_status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-900 border-0' :
                        o.order_status === 'CONFIRMED' ? 'bg-blue-100 text-blue-900 border-0' :
                        o.order_status === 'PENDING_SELLER_CONFIRMATION' ? 'bg-amber-100 text-amber-900 border-0' :
                        'bg-stone-100 text-stone-700 border-0'
                      }>
                        {o.order_status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className={o.payment_status === 'PAID' ? 'text-emerald-700 font-semibold' : 'text-stone-500'}>
                        {o.payment_status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setInspectOrder(o)}
                        className="text-stone-600 hover:text-stone-900 h-7 text-xs px-2"
                      >
                        <Eye size={12} className="mr-1" /> Inspect
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* TAB 3: INVOICES AUDIT */}
      {activeTab === 'invoices' && (
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-stone-100">
            <h3 className="text-sm font-semibold text-stone-900">Digital Invoices Registry</h3>
            <p className="text-xs text-stone-500 mt-0.5">Audited snapshot invoices generated for customers and sellers.</p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-stone-50 text-[11px] uppercase text-stone-500">
                <TableRow>
                  <TableHead>Invoice ID</TableHead>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Seller</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs divide-y divide-stone-100">
                {invoices.map((inv) => (
                  <TableRow key={inv.invoice_id} className="hover:bg-stone-50/60">
                    <TableCell className="font-mono font-medium text-emerald-800">{inv.invoice_id}</TableCell>
                    <TableCell className="font-mono text-stone-600">{inv.order_id}</TableCell>
                    <TableCell className="text-stone-500">{inv.date} {inv.time}</TableCell>
                    <TableCell className="font-medium text-stone-900">{inv.seller?.shop_name}</TableCell>
                    <TableCell>{inv.customer?.name}</TableCell>
                    <TableCell className="font-semibold text-stone-900">₹{inv.total}</TableCell>
                    <TableCell>
                      <Badge className="bg-stone-100 text-stone-800 border-0 text-[10px]">
                        {inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setInspectInvoice(inv)}
                        className="h-7 text-xs px-2 rounded-full"
                      >
                        <Receipt size={12} className="mr-1" /> View Receipt
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* TAB 4: PAYMENT RECONCILIATION */}
      {activeTab === 'reconciliation' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-white rounded-2xl border border-stone-200">
              <div className="text-xs text-stone-500 uppercase font-semibold">Audited Transactions</div>
              <div className="text-2xl font-bold text-stone-900 mt-1">{reconciliation?.total_audited || 0}</div>
            </div>
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200">
              <div className="text-xs text-emerald-800 uppercase font-semibold">100% Reconciled</div>
              <div className="text-2xl font-bold text-emerald-950 mt-1">{reconciliation?.reconciled_count || 0}</div>
            </div>
            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200">
              <div className="text-xs text-amber-800 uppercase font-semibold">Discrepancies / Mismatches</div>
              <div className="text-2xl font-bold text-amber-950 mt-1">{reconciliation?.discrepancies_count || 0}</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-stone-100">
              <h3 className="text-sm font-semibold text-stone-900">Audit Discrepancies</h3>
              <p className="text-xs text-stone-500 mt-0.5">Identifies orders marked PAID without matching gateway payments or amount deviations.</p>
            </div>
            {reconciliation?.discrepancies?.length === 0 ? (
              <div className="p-8 text-center text-xs text-emerald-700 font-medium">
                ✓ Zero payment discrepancies found across all audited orders.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-stone-50 text-[11px] uppercase text-stone-500">
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Shop</TableHead>
                      <TableHead>Issue Flag</TableHead>
                      <TableHead>Order Amount</TableHead>
                      <TableHead>Payment Received</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <tbody className="divide-y divide-stone-100 text-xs">
                    {reconciliation?.discrepancies?.map((d, idx) => (
                      <tr key={idx} className="bg-amber-50/40">
                        <td className="p-3 font-mono font-medium">{d.order_id}</td>
                        <td className="p-3">{d.seller_shop}</td>
                        <td className="p-3"><Badge className="bg-amber-100 text-amber-900 border-0">{d.issue}</Badge></td>
                        <td className="p-3 font-semibold">₹{d.order_total}</td>
                        <td className="p-3 text-red-600 font-semibold">₹{d.payment_received}</td>
                        <td className="p-3">
                          <Button size="sm" variant="outline" className="text-xs h-7 rounded-full">Investigate</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: EMERGENCY SWITCHES & SETTINGS */}
      {activeTab === 'settings' && (
        <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-6 shadow-sm max-w-3xl">
          <div>
            <h2 className="text-base font-semibold text-stone-900 flex items-center gap-2">
              <ShieldAlert size={18} className="text-amber-600" /> Administrative Emergency Switches
            </h2>
            <p className="text-xs text-stone-500 mt-1">
              Toggle specific billing or checkout systems independently. Disabling checkout or payments does not disrupt marketplace browsing or search.
            </p>
          </div>

          <div className="divide-y divide-stone-100 space-y-4 pt-2">
            {[
              { key: 'billing_enabled', title: 'Global In-App Billing', desc: 'Master switch for all in-app billing functions.' },
              { key: 'checkout_enabled', title: 'Customer Cart Checkout', desc: 'Allows shoppers to place new purchase requests.' },
              { key: 'cash_payment_enabled', title: 'Mode A: Cash Collection at Shop', desc: 'Allows vendors to mark cash payments collected at shop.' },
              { key: 'online_payment_enabled', title: 'Mode B: Online & UPI Gateway', desc: 'Allows upfront payment via digital providers.' },
              { key: 'seller_confirmation_enabled', title: 'Seller Bill Adjustments', desc: 'Enables sellers to modify quantities and prices upon stock availability.' },
              { key: 'automatic_sales_attribution_enabled', title: 'Automatic Sales Attribution Pipeline', desc: 'Automatically feeds completed orders into db.purchase_attributions.' },
            ].map(({ key, title, desc }) => (
              <div key={key} className="pt-4 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-stone-900">{title}</div>
                  <div className="text-xs text-stone-500">{desc}</div>
                </div>
                <Switch
                  checked={settings?.[key] !== false}
                  onCheckedChange={() => handleToggleSwitch(key, settings?.[key] !== false)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ORDER INSPECTION MODAL */}
      <Dialog open={!!inspectOrder} onOpenChange={(open) => !open && setInspectOrder(null)}>
        <DialogContent className="max-w-xl bg-white p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between text-base font-display">
              <span>Order Details: {inspectOrder?.order_id}</span>
              <Badge className="bg-emerald-100 text-emerald-900 border-0">{inspectOrder?.order_status}</Badge>
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Complete price snapshot, attribution metadata, and status history.
            </DialogDescription>
          </DialogHeader>

          {inspectOrder && (
            <div className="space-y-4 py-2 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-stone-50 rounded-xl border border-stone-200">
                <div>
                  <span className="text-[10px] text-stone-400 uppercase font-semibold">Customer</span>
                  <div className="font-semibold text-stone-900">{inspectOrder.customer_name}</div>
                  <div className="text-stone-500">{inspectOrder.customer_phone}</div>
                </div>
                <div>
                  <span className="text-[10px] text-stone-400 uppercase font-semibold">Seller Shop</span>
                  <div className="font-semibold text-stone-900">{inspectOrder.seller_shop_name}</div>
                  <div className="text-stone-500">{inspectOrder.seller_shop_address}</div>
                </div>
              </div>

              <div className="border border-stone-200 rounded-xl p-3">
                <div className="font-semibold text-stone-900 mb-2">Locked Line Items Snapshot:</div>
                <div className="divide-y divide-stone-100">
                  {inspectOrder.items?.map((it, idx) => (
                    <div key={idx} className="py-1.5 flex justify-between">
                      <span>{it.name} x{it.quantity} {it.unit}</span>
                      <span className="font-semibold">₹{it.line_total}</span>
                    </div>
                  ))}
                </div>
                <div className="pt-2 mt-2 border-t border-stone-200 flex justify-between font-bold text-sm">
                  <span>Total Amount</span>
                  <span className="text-emerald-800">₹{inspectOrder.total_amount}</span>
                </div>
              </div>

              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900">
                <div>Attribution Source: <strong>{inspectOrder.attribution_source}</strong></div>
                <div>Confidence: <strong>{inspectOrder.attribution_confidence}</strong></div>
                <div>Customer Classification: <strong>{inspectOrder.is_new_customer ? 'NEW CUSTOMER' : 'RETURNING CUSTOMER'}</strong></div>
              </div>

              {/* Status History Timeline */}
              <div className="border border-stone-200 rounded-xl p-3">
                <div className="font-semibold text-stone-900 mb-2">Status Audit Trail:</div>
                <div className="space-y-1.5">
                  {inspectOrder.status_history?.map((h, idx) => (
                    <div key={idx} className="flex justify-between text-[11px] text-stone-600">
                      <span>• {h.status} ({h.reason})</span>
                      <span className="text-stone-400">{h.timestamp ? new Date(h.timestamp).toLocaleTimeString() : '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="pt-2 flex justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCorrectionForm({ order_status: inspectOrder?.order_status || '', reason: '' });
                setCorrectionModal(true);
              }}
              className="text-xs rounded-full"
            >
              Apply Correction
            </Button>
            <Button size="sm" onClick={() => setInspectOrder(null)} className="rounded-full bg-stone-900 text-white text-xs">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CORRECTION MODAL */}
      <Dialog open={correctionModal} onOpenChange={setCorrectionModal}>
        <DialogContent className="max-w-sm bg-white p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-display">Operational Override</DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Audit-logged correction for Order {inspectOrder?.order_id}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleApplyCorrection} className="space-y-3 py-2 text-xs">
            <div>
              <Label className="text-xs">Override Order Status</Label>
              <Select
                value={correctionForm.order_status}
                onValueChange={(val) => setCorrectionForm(f => ({ ...f, order_status: val }))}
              >
                <SelectTrigger className="text-xs mt-1">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CONFIRMED">CONFIRMED</SelectItem>
                  <SelectItem value="COMPLETED">COMPLETED</SelectItem>
                  <SelectItem value="CANCELLED">CANCELLED</SelectItem>
                  <SelectItem value="REFUNDED">REFUNDED</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Reason for Audit Log (Mandatory)</Label>
              <Input
                placeholder="e.g. Seller confirmed offline settlement"
                value={correctionForm.reason}
                onChange={(e) => setCorrectionForm(f => ({ ...f, reason: e.target.value }))}
                required
                className="text-xs mt-1"
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setCorrectionModal(false)} className="rounded-full text-xs">
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={correctionSubmitting} className="rounded-full bg-[#0A6E3B] text-white text-xs">
                Save Override
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* INVOICE MODAL */}
      <Dialog open={!!inspectInvoice} onOpenChange={(open) => !open && setInspectInvoice(null)}>
        <DialogContent className="max-w-md bg-white p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-display flex items-center justify-between">
              <span>Invoice {inspectInvoice?.invoice_id}</span>
              <Badge className="bg-emerald-100 text-emerald-900 border-0">{inspectInvoice?.status}</Badge>
            </DialogTitle>
          </DialogHeader>
          {inspectInvoice && (
            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200">
                <div className="font-semibold text-stone-900">{inspectInvoice.seller?.shop_name}</div>
                <div className="text-stone-500">{inspectInvoice.seller?.address}</div>
                <div className="text-stone-400 mt-1">Customer: {inspectInvoice.customer?.name}</div>
              </div>
              <div className="border border-stone-200 rounded-xl p-3 divide-y divide-stone-100">
                {inspectInvoice.items?.map((it, idx) => (
                  <div key={idx} className="py-1 flex justify-between">
                    <span>{it.name} x{it.quantity}</span>
                    <span className="font-semibold">₹{it.line_total}</span>
                  </div>
                ))}
                <div className="pt-2 font-bold flex justify-between text-sm">
                  <span>Total</span>
                  <span className="text-emerald-800">₹{inspectInvoice.total}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button size="sm" onClick={() => window.print()} variant="outline" className="rounded-full text-xs">
              <Printer size={12} className="mr-1" /> Print
            </Button>
            <Button size="sm" onClick={() => setInspectInvoice(null)} className="rounded-full bg-stone-900 text-white text-xs">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

