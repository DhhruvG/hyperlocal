import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, formatApiErrorDetail } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Store, CheckCircle2, QrCode, ShoppingBag, Sparkles, ArrowRight, MapPin } from 'lucide-react';

export default function VendorQRPage() {
  const { vendorId } = useParams();
  const { user } = useAuth();
  const [vendor, setVendor] = useState(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sessionId, setSessionId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/attribution/qr/${vendorId}`);
        setVendor(data);
      } catch (e) {
        toast.error('Seller not found');
      } finally {
        setLoading(false);
      }
    })();
  }, [vendorId]);

  const handleCheckIn = async () => {
    setSubmitting(true);
    try {
      const { data } = await api.post('/attribution/qr-checkin', {
        seller_id: vendorId,
        event_type: 'qr_checkin',
      });
      setSessionId(data.session_id);
      setCheckedIn(true);
      toast.success('Checked in successfully! Visit verified.');
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmPurchase = async (e) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Enter a valid purchase amount');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/attribution/confirm-visit-customer', {
        session_id: sessionId || `HL-QR-${Date.now()}`,
        visited: true,
        purchased: true,
        exact_amount: parseFloat(amount),
      });
      toast.success('Purchase confirmed! Thank you for supporting local businesses.');
      setShowPurchaseForm(false);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-stone-500">Loading store details…</div>;
  }

  if (!vendor) {
    return (
      <div className="max-w-md mx-auto p-8 text-center">
        <Store size={36} className="mx-auto text-stone-400 mb-3" />
        <h2 className="font-display text-xl font-semibold text-stone-900">Seller Not Found</h2>
        <p className="text-sm text-stone-600 mt-2">The QR code you scanned does not correspond to an active seller.</p>
        <Link to="/" className="mt-4 inline-block">
          <Button variant="outline" className="rounded-full">Go to Marketplace</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-5 py-10">
      <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm text-center">
        <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-[#0A6E3B] grid place-items-center mx-auto mb-4">
          <Store size={26} />
        </div>

        <div className="flex items-center justify-center gap-1.5 mb-1">
          <h1 className="font-display text-2xl font-bold text-stone-900">{vendor.shop_name}</h1>
          {vendor.is_verified && <CheckCircle2 size={16} className="text-emerald-600" />}
        </div>
        <p className="text-stone-500 text-xs flex items-center justify-center gap-1">
          <MapPin size={11} /> {vendor.shop_address}
        </p>

        <div className="mt-3 flex items-center justify-center gap-1.5">
          <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{vendor.vendor_type}</Badge>
          {vendor.is_online && <Badge className="bg-amber-100 text-amber-900 border-0 text-[10px]">● Online now</Badge>}
        </div>

        <div className="mt-6 border-t border-stone-100 pt-6">
          {!checkedIn ? (
            <div className="space-y-3">
              <Button
                onClick={handleCheckIn}
                disabled={submitting}
                className="w-full rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white py-6"
              >
                <QrCode size={16} className="mr-2" /> Check In to Store
              </Button>
              <div className="text-[11px] text-stone-500">
                Checking in confirms your physical visit and earns you HyperLocal points.
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-900 text-sm flex items-center justify-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-600" />
                <span className="font-medium">Visit Verified via QR</span>
              </div>

              {!showPurchaseForm ? (
                <Button
                  onClick={() => setShowPurchaseForm(true)}
                  variant="outline"
                  className="w-full rounded-full border-stone-300 py-5"
                >
                  <ShoppingBag size={14} className="mr-2 text-[#0A6E3B]" /> Confirm a Purchase
                </Button>
              ) : (
                <form onSubmit={handleConfirmPurchase} className="space-y-3 text-left">
                  <div className="text-xs font-semibold text-stone-700">Enter purchase amount (₹):</div>
                  <Input
                    type="number"
                    min="1"
                    placeholder="e.g. 240"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="rounded-xl"
                    required
                  />
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white"
                  >
                    Submit Purchase
                  </Button>
                </form>
              )}
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-stone-100">
            <Link to={`/vendors/${vendorId}`}>
              <Button variant="ghost" className="w-full rounded-full text-stone-600 text-xs">
                View Store Profile & Products <ArrowRight size={13} className="ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

