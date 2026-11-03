import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, formatApiErrorDetail } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLang } from '@/lib/lang';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import {
  ShoppingBag, Trash2, Plus, Minus, Store, ArrowRight, ShieldCheck,
  CreditCard, Banknote, ChevronLeft, Loader2, Sparkles, CheckCircle2,
  AlertCircle
} from 'lucide-react';

export default function CartPage() {
  const { user } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();

  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);

  // Checkout form state
  const [checkoutMode, setCheckoutMode] = useState('RESERVE_AT_SHOP'); // 'RESERVE_AT_SHOP' | 'PAY_THROUGH_HYPERLOCAL'
  const [paymentMethod, setPaymentMethod] = useState('CASH'); // 'CASH' | 'UPI' | 'ONLINE_PAYMENT'
  const [customerNotes, setCustomerNotes] = useState('');

  const loadCart = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const res = await api.get('/cart');
      setCart(res.data);
    } catch {
      toast.error('Failed to load cart');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadCart();
  }, [loadCart]);

  const handleUpdateQty = async (productId, currentQty, delta) => {
    const newQty = Math.max(1, currentQty + delta);
    try {
      await api.patch(`/cart/items/${productId}`, { quantity: newQty });
      loadCart();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const handleRemoveItem = async (productId) => {
    try {
      await api.delete(`/cart/items/${productId}`);
      toast.success('Item removed from cart');
      loadCart();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const handleClearCart = async () => {
    if (!window.confirm('Clear all items from your cart?')) return;
    try {
      await api.delete('/cart');
      toast.success('Cart cleared');
      loadCart();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const handleCheckout = async () => {
    if (!user) {
      toast.info('Please sign in as a shopper to checkout');
      navigate('/auth/consumer');
      return;
    }
    setCheckingOut(true);
    try {
      const res = await api.post('/checkout/orders', {
        checkout_mode: checkoutMode,
        payment_method: checkoutMode === 'RESERVE_AT_SHOP' ? 'CASH' : paymentMethod,
        customer_notes: customerNotes.trim() || undefined,
        attribution_source: 'HYPERLOCAL_CART_CHECKOUT',
      });

      const ordersCount = res.data.orders?.length || 1;
      toast.success(`Success! Created ${ordersCount} purchase request${ordersCount > 1 ? 's' : ''}.`);
      navigate('/orders');
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setCheckingOut(false);
    }
  };

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-50 text-[#0A6E3B] grid place-items-center mx-auto mb-4">
          <ShoppingBag size={28} />
        </div>
        <h1 className="text-2xl font-display font-semibold text-stone-900">Sign in to view your cart</h1>
        <p className="text-stone-500 text-sm mt-2 max-w-md mx-auto">
          Add items from local retailers and mobile cart vendors, compare prices, and checkout seamlessly.
        </p>
        <Link to="/auth/consumer" className="mt-6 inline-block">
          <Button className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white px-6">
            Sign In as Shopper
          </Button>
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-5 py-20 text-center text-stone-500">
        <Loader2 size={24} className="animate-spin mx-auto mb-2 text-[#0A6E3B]" />
        Loading your cart…
      </div>
    );
  }

  const items = cart?.items || [];
  const sellers = cart?.sellers || [];

  if (items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-stone-100 text-stone-400 grid place-items-center mx-auto mb-4">
          <ShoppingBag size={28} />
        </div>
        <h1 className="text-2xl font-display font-semibold text-stone-900">Your cart is empty</h1>
        <p className="text-stone-500 text-sm mt-2">
          Discover fresh local produce, groceries, and shop specials in Dehradun.
        </p>
        <Link to="/search" className="mt-6 inline-block">
          <Button className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white px-6">
            Explore Nearby Products
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-5 md:px-8 py-8 pb-28 md:pb-16">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link to="/search" className="text-xs text-stone-500 hover:text-[#0A6E3B] inline-flex items-center gap-1 mb-1">
            <ChevronLeft size={14} /> Continue Shopping
          </Link>
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-stone-900 flex items-center gap-2">
            <ShoppingBag size={24} className="text-[#0A6E3B]" /> Shopping Cart
            <Badge variant="outline" className="text-xs font-normal border-stone-300">
              {cart.total_items} items
            </Badge>
          </h1>
        </div>
        <Button variant="ghost" size="sm" onClick={handleClearCart} className="text-red-600 hover:text-red-700 hover:bg-red-50 text-xs">
          <Trash2 size={13} className="mr-1" /> Clear Cart
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Items grouped by seller */}
        <div className="lg:col-span-2 space-y-6">
          {sellers.map((seller) => (
            <div key={seller.seller_id} className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-800 grid place-items-center">
                    <Store size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-stone-900">{seller.shop_name}</h3>
                    <p className="text-[11px] text-stone-500">{seller.shop_address} · {seller.vendor_type === 'cart_vendor' ? 'Street Cart' : 'Retailer'}</p>
                  </div>
                </div>
                <Badge className="bg-stone-100 text-stone-800 border-0 text-xs font-medium">
                  Subtotal: ₹{seller.subtotal}
                </Badge>
              </div>

              <div className="divide-y divide-stone-100 mt-2">
                {seller.items.map((it) => (
                  <div key={it.product_id} className="py-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-stone-900 truncate">{it.name}</div>
                      <div className="text-xs text-stone-500 mt-0.5">
                        ₹{it.price} / {it.unit || 'unit'}
                      </div>
                    </div>

                    {/* Quantity controls */}
                    <div className="flex items-center gap-2">
                      <div className="flex items-center border border-stone-200 rounded-full bg-stone-50 p-0.5">
                        <button
                          type="button"
                          onClick={() => handleUpdateQty(it.product_id, it.quantity, -1)}
                          disabled={it.quantity <= 1}
                          className="w-7 h-7 rounded-full bg-white hover:bg-stone-100 grid place-items-center text-stone-600 disabled:opacity-40 transition-colors shadow-xs"
                          aria-label="Decrease quantity"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="w-8 text-center text-xs font-semibold text-stone-800">{it.quantity}</span>
                        <button
                          type="button"
                          onClick={() => handleUpdateQty(it.product_id, it.quantity, 1)}
                          className="w-7 h-7 rounded-full bg-white hover:bg-stone-100 grid place-items-center text-stone-600 transition-colors shadow-xs"
                          aria-label="Increase quantity"
                        >
                          <Plus size={12} />
                        </button>
                      </div>

                      <div className="w-20 text-right font-semibold text-stone-900 text-sm">
                        ₹{it.line_total}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(it.product_id)}
                        className="text-stone-400 hover:text-red-600 p-1.5 rounded-full hover:bg-red-50 transition-colors"
                        aria-label="Remove item"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Multi-Seller Split Notice */}
          {sellers.length > 1 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 flex items-start gap-2.5">
              <AlertCircle size={16} className="text-amber-700 shrink-0 mt-0.5" />
              <div>
                <strong>Multi-Seller Cart:</strong> Your cart contains items from <strong>{sellers.length} different local sellers</strong>. At checkout, separate purchase requests will be generated so each shopkeeper can prepare their order accurately.
              </div>
            </div>
          )}
        </div>

        {/* Right Col: Checkout & Payment Summary */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm sticky top-20">
            <h2 className="text-base font-semibold text-stone-900 pb-3 border-b border-stone-100">
              Checkout & Billing
            </h2>

            {/* Mode selection */}
            <div className="mt-4 space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-wider text-stone-500">Checkout Mode</Label>
              <RadioGroup value={checkoutMode} onValueChange={setCheckoutMode} className="gap-2.5">
                <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${checkoutMode === 'RESERVE_AT_SHOP' ? 'border-[#0A6E3B] bg-emerald-50/50 ring-1 ring-[#0A6E3B]' : 'border-stone-200 bg-white hover:bg-stone-50'}`}>
                  <RadioGroupItem value="RESERVE_AT_SHOP" id="mode-a" className="mt-0.5" />
                  <div className="text-xs">
                    <div className="font-semibold text-stone-900 flex items-center gap-1.5">
                      <Banknote size={14} className="text-[#0A6E3B]" /> Mode A: Reserve & Pay at Shop
                    </div>
                    <p className="text-stone-500 text-[11px] mt-0.5">
                      Seller confirms inventory. You pick up and pay cash or UPI at the counter.
                    </p>
                  </div>
                </label>

                <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${checkoutMode === 'PAY_THROUGH_HYPERLOCAL' ? 'border-[#0A6E3B] bg-emerald-50/50 ring-1 ring-[#0A6E3B]' : 'border-stone-200 bg-white hover:bg-stone-50'}`}>
                  <RadioGroupItem value="PAY_THROUGH_HYPERLOCAL" id="mode-b" className="mt-0.5" />
                  <div className="text-xs">
                    <div className="font-semibold text-stone-900 flex items-center gap-1.5">
                      <CreditCard size={14} className="text-[#0A6E3B]" /> Mode B: Pay via HyperLocal
                    </div>
                    <p className="text-stone-500 text-[11px] mt-0.5">
                      Pay upfront via UPI, Card, or Net Banking. Digital invoice generated instantly.
                    </p>
                  </div>
                </label>
              </RadioGroup>
            </div>

            {/* Payment method selector for Mode B */}
            {checkoutMode === 'PAY_THROUGH_HYPERLOCAL' && (
              <div className="mt-4 pt-3 border-t border-stone-100 space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-stone-500">Payment Method</Label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('UPI')}
                    className={`p-2.5 rounded-xl border font-medium text-left transition-colors flex items-center gap-2 ${paymentMethod === 'UPI' ? 'border-[#0A6E3B] bg-emerald-50 text-emerald-900' : 'border-stone-200 text-stone-700'}`}
                  >
                    <span>⚡ UPI / QR</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('ONLINE_PAYMENT')}
                    className={`p-2.5 rounded-xl border font-medium text-left transition-colors flex items-center gap-2 ${paymentMethod === 'ONLINE_PAYMENT' ? 'border-[#0A6E3B] bg-emerald-50 text-emerald-900' : 'border-stone-200 text-stone-700'}`}
                  >
                    <span>💳 Card / NetBanking</span>
                  </button>
                </div>
              </div>
            )}

            {/* Customer notes */}
            <div className="mt-4 pt-3 border-t border-stone-100">
              <Label className="text-xs text-stone-600">Instructions / Notes (optional)</Label>
              <Input
                placeholder="e.g. Please pack ripened tomatoes"
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
                className="text-xs mt-1"
                maxLength={140}
              />
            </div>

            {/* Price breakdown */}
            <div className="mt-6 pt-4 border-t border-stone-100 space-y-2 text-xs">
              <div className="flex justify-between text-stone-600">
                <span>Items Subtotal</span>
                <span>₹{cart.subtotal}</span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>Platform Fee</span>
                <span className="text-emerald-700 font-medium">FREE</span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>Delivery / Taxes</span>
                <span>As charged by shop</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-stone-900 pt-2 border-t border-stone-200">
                <span>Total Amount</span>
                <span className="text-emerald-800 text-base">₹{cart.subtotal}</span>
              </div>
            </div>

            {/* Checkout button */}
            <Button
              onClick={handleCheckout}
              disabled={checkingOut}
              className="w-full mt-6 rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white font-semibold py-2.5 shadow-md flex items-center justify-center gap-2"
            >
              {checkingOut ? (
                <><Loader2 size={16} className="animate-spin" /> Processing Order…</>
              ) : (
                <>Place Purchase Request <ArrowRight size={16} /></>
              )}
            </Button>

            <p className="text-[10px] text-stone-400 text-center mt-3 flex items-center justify-center gap-1">
              <ShieldCheck size={12} className="text-emerald-600" />
              Direct local commerce · Protected with verified attribution
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

