import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, formatApiErrorDetail } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Package, Receipt, RefreshCw, AlertTriangle, CheckCircle2, Clock,
  Store, ChevronRight, ArrowLeft, Printer, ShieldAlert, XCircle,
  ShoppingBag, HelpCircle, Loader2
} from 'lucide-react';

export default function CustomerOrdersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // Digital Invoice Modal
  const [activeInvoice, setActiveInvoice] = useState(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  // Revision Review Modal
  const [revisionOrder, setRevisionOrder] = useState(null);
  const [revisionSubmitting, setRevisionSubmitting] = useState(false);

  // Reorder loading
  const [reorderingId, setReorderingId] = useState(null);

  const loadOrders = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const res = await api.get('/orders');
      setOrders(res.data);
    } catch {
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleOpenInvoice = async (invoiceId) => {
    setInvoiceLoading(true);
    try {
      const res = await api.get(`/invoices/${invoiceId}`);
      setActiveInvoice(res.data);
    } catch {
      toast.error('Could not load digital invoice');
    } finally {
      setInvoiceLoading(false);
    }
  };

  const handleConfirmRevision = async (orderId, accepted) => {
    setRevisionSubmitting(true);
    try {
      await api.post(`/orders/${orderId}/confirm-revision`, {
        accepted: accepted,
        rejection_reason: accepted ? undefined : 'Customer declined revised prices',
      });
      toast.success(accepted ? 'Approved revised bill' : 'Cancelled order due to revision');
      setRevisionOrder(null);
      loadOrders();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setRevisionSubmitting(false);
    }
  };

  const handleReorder = async (orderId) => {
    setReorderingId(orderId);
    try {
      const res = await api.post(`/orders/${orderId}/reorder`);
      toast.success(`Added ${res.data.reordered_count} items back to your cart!`);
      navigate('/cart');
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setReorderingId(null);
    }
  };

  const handleReportProblem = (order) => {
    // Navigate to grievance filing with order context pre-filled
    const params = new URLSearchParams({
      category: 'Price',
      subject: `Issue regarding Order ${order.order_id}`,
      description: `Dispute or issue for Order #${order.order_id} at ${order.seller_shop_name}. Total amount: ₹${order.total_amount}.`,
      related_entity_type: 'order',
      related_entity_id: order.order_id,
    });
    navigate(`/grievances?${params.toString()}`);
  };

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-5 py-16 text-center">
        <h1 className="text-2xl font-display font-semibold text-stone-900">Sign in to view your orders</h1>
        <Link to="/auth/consumer" className="mt-4 inline-block">
          <Button className="rounded-full bg-[#0A6E3B] text-white">Sign In</Button>
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-5 py-20 text-center text-stone-500">
        <Loader2 size={24} className="animate-spin mx-auto mb-2 text-[#0A6E3B]" />
        Loading your purchase history…
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-5 md:px-8 py-8 pb-28 md:pb-16">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link to="/" className="text-xs text-stone-500 hover:text-[#0A6E3B] inline-flex items-center gap-1 mb-1">
            <ArrowLeft size={14} /> Back to Store
          </Link>
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-stone-900 flex items-center gap-2">
            <Package size={26} className="text-[#0A6E3B]" /> My Orders & Bills
          </h1>
          <p className="text-stone-500 text-xs mt-1">Track orders, review price updates, and access digital invoices.</p>
        </div>
        <Link to="/cart">
          <Button variant="outline" size="sm" className="rounded-full border-stone-300 text-xs">
            <ShoppingBag size={14} className="mr-1.5" /> View Cart
          </Button>
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center">
          <div className="w-14 h-14 rounded-full bg-stone-100 text-stone-400 grid place-items-center mx-auto mb-3">
            <Package size={24} />
          </div>
          <h2 className="text-lg font-semibold text-stone-900">No orders yet</h2>
          <p className="text-stone-500 text-xs mt-1">You haven't placed any in-app orders yet.</p>
          <Link to="/search" className="mt-5 inline-block">
            <Button className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white text-xs px-5">
              Browse Local Stores
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {orders.map((order) => {
            const needsCustomerReview = order.customer_confirmed_revision === false && order.order_status !== 'CANCELLED';

            return (
              <div key={order.order_id} className={`bg-white rounded-2xl border transition-all ${needsCustomerReview ? 'border-amber-300 ring-2 ring-amber-100' : 'border-stone-200'} p-5 shadow-xs`}>
                {/* Header info */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-stone-900">{order.order_id}</span>
                      <span className="text-stone-300">·</span>
                      <span className="text-xs text-stone-500">{new Date(order.created_at).toLocaleDateString()}</span>
                      <span className="text-stone-300">·</span>
                      <span className="text-xs font-semibold text-emerald-800 flex items-center gap-1">
                        <Store size={12} /> {order.seller_shop_name}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {order.order_status === 'PENDING_SELLER_CONFIRMATION' && (
                      <Badge className="bg-amber-100 text-amber-900 border-0 text-[11px] font-medium">
                        <Clock size={11} className="mr-1" /> Awaiting Shop Confirmation
                      </Badge>
                    )}
                    {order.order_status === 'CONFIRMED' && (
                      <Badge className="bg-blue-100 text-blue-900 border-0 text-[11px] font-medium">
                        <CheckCircle2 size={11} className="mr-1" /> Confirmed by Shop
                      </Badge>
                    )}
                    {order.order_status === 'READY_FOR_PICKUP' && (
                      <Badge className="bg-purple-100 text-purple-900 border-0 text-[11px] font-medium animate-pulse">
                        <Package size={11} className="mr-1" /> Ready for Pickup
                      </Badge>
                    )}
                    {order.order_status === 'COMPLETED' && (
                      <Badge className="bg-emerald-100 text-emerald-900 border-0 text-[11px] font-medium">
                        <CheckCircle2 size={11} className="mr-1" /> Completed & Verified
                      </Badge>
                    )}
                    {order.order_status === 'CANCELLED' && (
                      <Badge className="bg-stone-100 text-stone-600 border-0 text-[11px] font-medium">
                        <XCircle size={11} className="mr-1" /> Cancelled
                      </Badge>
                    )}
                    {order.order_status === 'REFUNDED' && (
                      <Badge className="bg-red-100 text-red-900 border-0 text-[11px] font-medium">
                        Refunded
                      </Badge>
                    )}

                    <Badge variant="outline" className="text-[10px] border-stone-300">
                      {order.checkout_mode === 'RESERVE_AT_SHOP' ? 'Reserve at Shop' : 'Online Payment'}
                    </Badge>
                  </div>
                </div>

                {/* Revision Alert Banner if seller modified bill */}
                {needsCustomerReview && (
                  <div className="mt-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={16} className="text-amber-700 shrink-0 mt-0.5" />
                      <div>
                        <strong>Seller Adjusted Bill:</strong> The shopkeeper revised items or quantities ({order.seller_notes || 'Adjusted available stock'}). Please review and approve the revised total of <strong>₹{order.total_amount}</strong>.
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setRevisionOrder(order)}
                      className="bg-amber-700 hover:bg-amber-800 text-white rounded-full text-xs font-semibold px-4 shrink-0"
                    >
                      Review Revision
                    </Button>
                  </div>
                )}

                {/* Line items preview */}
                <div className="mt-3 divide-y divide-stone-100 text-xs">
                  {order.items?.map((it, idx) => (
                    <div key={idx} className="py-2 flex items-center justify-between text-stone-700">
                      <div>
                        <span className="font-medium text-stone-900">{it.name}</span>
                        <span className="text-stone-400 ml-2">x{it.quantity} {it.unit}</span>
                      </div>
                      <div className="font-semibold text-stone-900">₹{it.line_total}</div>
                    </div>
                  ))}
                </div>

                {/* Total and actions */}
                <div className="mt-4 pt-3 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-stone-600">
                    Total Amount: <span className="font-bold text-stone-900 text-sm">₹{order.total_amount}</span>
                    <span className="text-stone-400 ml-2">({order.payment_status === 'PAID' ? '✓ Paid' : 'Payment pending at shop'})</span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenInvoice(order.invoice_id)}
                      className="rounded-full text-xs"
                    >
                      <Receipt size={13} className="mr-1.5" /> Digital Invoice
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReorder(order.order_id)}
                      disabled={reorderingId === order.order_id}
                      className="rounded-full text-xs"
                    >
                      <RefreshCw size={13} className={`mr-1.5 ${reorderingId === order.order_id ? 'animate-spin' : ''}`} /> Buy Again
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleReportProblem(order)}
                      className="text-stone-500 hover:text-amber-700 hover:bg-amber-50 text-xs rounded-full"
                    >
                      <HelpCircle size={13} className="mr-1" /> Report Problem
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DIGITAL INVOICE MODAL */}
      <Dialog open={!!activeInvoice} onOpenChange={(open) => !open && setActiveInvoice(null)}>
        <DialogContent className="max-w-md bg-white p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between text-base font-display">
              <span className="flex items-center gap-2">
                <Receipt size={18} className="text-[#0A6E3B]" /> Digital Invoice
              </span>
              <Badge className="bg-emerald-100 text-emerald-900 border-0 text-[10px]">
                {activeInvoice?.status || 'PAID'}
              </Badge>
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Official transaction receipt generated by HyperLocal Marketplace
            </DialogDescription>
          </DialogHeader>

          {activeInvoice && (
            <div id="printable-invoice" className="space-y-4 py-2 text-xs">
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 flex justify-between items-center text-stone-700">
                <div>
                  <div className="font-mono font-bold text-stone-900">{activeInvoice.invoice_id}</div>
                  <div className="text-[10px] text-stone-500 mt-0.5">{activeInvoice.date} · {activeInvoice.time}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-stone-500 uppercase tracking-widest">Order ID</div>
                  <div className="font-mono text-stone-800">{activeInvoice.order_id}</div>
                </div>
              </div>

              {/* Seller details */}
              <div className="p-3 bg-white rounded-xl border border-stone-200 text-stone-700">
                <div className="text-[10px] uppercase font-semibold text-stone-400">Seller / Vendor</div>
                <div className="font-semibold text-stone-900 text-sm mt-0.5">{activeInvoice.seller?.shop_name}</div>
                <div className="text-stone-500 text-[11px]">{activeInvoice.seller?.address}</div>
              </div>

              {/* Line items table */}
              <div className="border border-stone-200 rounded-xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-stone-50 text-[10px] uppercase text-stone-500 border-b border-stone-200">
                    <tr>
                      <th className="p-2.5">Item</th>
                      <th className="p-2.5 text-center">Qty</th>
                      <th className="p-2.5 text-right">Price</th>
                      <th className="p-2.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {activeInvoice.items?.map((it, idx) => (
                      <tr key={idx}>
                        <td className="p-2.5 font-medium text-stone-900">{it.name}</td>
                        <td className="p-2.5 text-center text-stone-600">{it.quantity}</td>
                        <td className="p-2.5 text-right text-stone-600">₹{it.unit_price}</td>
                        <td className="p-2.5 text-right font-semibold text-stone-900">₹{it.line_total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Breakdown */}
              <div className="space-y-1.5 pt-2 border-t border-stone-100 text-stone-600">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>₹{activeInvoice.subtotal}</span>
                </div>
                {activeInvoice.discount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Discount</span>
                    <span>-₹{activeInvoice.discount}</span>
                  </div>
                )}
                {activeInvoice.additional_charges > 0 && (
                  <div className="flex justify-between">
                    <span>Additional charges</span>
                    <span>₹{activeInvoice.additional_charges}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm text-stone-900 pt-1.5 border-t border-stone-200">
                  <span>Final Total</span>
                  <span className="text-emerald-800 text-base">₹{activeInvoice.total}</span>
                </div>
              </div>

              <div className="p-2.5 bg-emerald-50/60 border border-emerald-100 rounded-lg text-[11px] text-emerald-900 flex items-center justify-between">
                <span>Payment Mode: <strong>{activeInvoice.payment_method}</strong></span>
                <span className="text-emerald-700 font-semibold">Status: {activeInvoice.payment_status}</span>
              </div>
            </div>
          )}

          <DialogFooter className="pt-2 flex sm:justify-between gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()} className="rounded-full text-xs">
              <Printer size={13} className="mr-1.5" /> Print / Save PDF
            </Button>
            <Button size="sm" onClick={() => setActiveInvoice(null)} className="rounded-full bg-[#0A6E3B] text-white text-xs">
              Close Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* REVISION REVIEW DIALOG */}
      <Dialog open={!!revisionOrder} onOpenChange={(open) => !open && setRevisionOrder(null)}>
        <DialogContent className="max-w-md bg-white p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-display text-amber-900">
              <AlertTriangle size={18} className="text-amber-600" /> Review Bill Adjustments
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              {revisionOrder?.seller_shop_name} updated the order before packing.
            </DialogDescription>
          </DialogHeader>

          {revisionOrder && (
            <div className="space-y-4 py-2 text-xs">
              {revisionOrder.seller_notes && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900">
                  <strong>Shopkeeper's note:</strong> "{revisionOrder.seller_notes}"
                </div>
              )}

              <div className="border border-stone-200 rounded-xl p-3 space-y-2">
                <div className="font-semibold text-stone-900">Adjusted Items:</div>
                {revisionOrder.revisions?.map((rev, idx) => (
                  <div key={idx} className="p-2 bg-stone-50 rounded-lg border border-stone-200 text-stone-700 space-y-1">
                    <div className="font-medium text-stone-900">{rev.product_name}</div>
                    <div className="text-[11px] text-stone-600 flex justify-between">
                      <span>Qty: <del className="text-stone-400">{rev.old_quantity}</del> → <strong>{rev.new_quantity}</strong></span>
                      <span>Price: <del className="text-stone-400">₹{rev.old_price}</del> → <strong>₹{rev.new_price}</strong></span>
                    </div>
                    {rev.reason && <div className="text-[10px] text-amber-800 italic">Reason: {rev.reason}</div>}
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center text-sm font-bold p-3 bg-stone-100 rounded-xl">
                <span>Revised Bill Total:</span>
                <span className="text-emerald-800 text-base">₹{revisionOrder.total_amount}</span>
              </div>
            </div>
          )}

          <DialogFooter className="pt-2 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={revisionSubmitting}
              onClick={() => handleConfirmRevision(revisionOrder.order_id, false)}
              className="rounded-full text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              Decline & Cancel
            </Button>
            <Button
              size="sm"
              disabled={revisionSubmitting}
              onClick={() => handleConfirmRevision(revisionOrder.order_id, true)}
              className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white text-xs font-semibold"
            >
              {revisionSubmitting ? 'Updating…' : 'Approve Revised Total'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

