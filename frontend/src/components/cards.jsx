import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { MapPin, Star, MessageSquare, Navigation, Bookmark, CheckCircle2, Zap, Bell, BellRing, ShoppingBag } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLang } from '@/lib/lang';
import { toast } from 'sonner';

function hoursAgo(iso) {
  if (!iso) return null;
  const h = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 3600000));
  return h;
}

function directionsUrl(p) {
  if (p?.vendor_lat && p?.vendor_lng)
    return `https://www.google.com/maps/dir/?api=1&destination=${p.vendor_lat},${p.vendor_lng}`;
  const q = encodeURIComponent(`${p.vendor_shop || ''} ${p.vendor_address || ''} Dehradun`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export function ProductCard({ product: p, showSave = true, saved = false, onSave }) {
  const { user } = useAuth();
  const { t, lang, localizeName, localizeUnit } = useLang();
  const h = hoursAgo(p.updated_at);
  const displayName = localizeName ? localizeName(p) : p.name;
  const displayUnit = localizeUnit ? localizeUnit(p.unit || 'unit') : (p.unit || 'unit');

  const [alertModal, setAlertModal] = useState(false);
  const [targetPrice, setTargetPrice] = useState(p?.price ? Math.max(1, Math.round(p.price * 0.9)) : '');
  const [alertSubmitting, setAlertSubmitting] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);

  const trackClick = () => {
    api.post(`/products/${p.id}/click`).catch(() => {});
    if (p.vendor_id) {
      api.post('/attribution/event', {
        seller_id: p.vendor_id,
        event_type: 'product_view',
        product_id: p.id,
        metadata: { product_name: p.name, price: p.price }
      }).catch(() => {});
    }
  };

  const trackDirections = () => {
    if (p.vendor_id) {
      api.post('/attribution/event', {
        seller_id: p.vendor_id,
        event_type: 'directions_clicked',
        product_id: p.id,
        metadata: { product_name: p.name }
      }).catch(() => {});

      // Launch HyperLocal navigation trip session
      api.post('/attribution/trip/start', {
        seller_id: p.vendor_id,
        destination_lat: p.vendor_lat,
        destination_lng: p.vendor_lng,
      }).then(r => {
        if (r.data?.trip_id && typeof navigator !== 'undefined' && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(pos => {
            api.post('/attribution/trip/ping', {
              trip_id: r.data.trip_id,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            }).catch(() => {});
          }, () => {}, { timeout: 6000 });
        }
      }).catch(() => {});
    }
  };

  const handlePriceAlert = async (e) => {
    e.preventDefault();
    if (!user) {
      toast.info('Sign in as shopper to set price alerts');
      return;
    }
    setAlertSubmitting(true);
    try {
      await api.post('/alerts/price', {
        product_id: p.id,
        target_price: parseFloat(targetPrice),
      });
      toast.success(`Price drop alert set for ₹${targetPrice}! We'll notify you.`);
      setAlertModal(false);
    } catch {
      toast.error('Failed to set price alert');
    } finally {
      setAlertSubmitting(false);
    }
  };

  const handleAvailabilityAlert = async () => {
    if (!user) {
      toast.info('Sign in as shopper to get back-in-stock alerts');
      return;
    }
    try {
      await api.post('/alerts/availability', { product_id: p.id });
      toast.success(`Alert set! We will notify you when ${p.name} is back in stock.`);
    } catch {
      toast.error('Failed to set availability alert');
    }
  };

  const trackChat = () => {
    if (p.vendor_id) {
      api.post('/attribution/event', {
        seller_id: p.vendor_id,
        event_type: 'contact_seller',
        product_id: p.id,
        metadata: { channel: 'chat' }
      }).catch(() => {});
    }
  };

  const handleAddToCart = async (e) => {
    e?.stopPropagation?.();
    if (!user) {
      toast.info('Please sign in as shopper to add items to cart');
      return;
    }
    setAddingToCart(true);
    try {
      await api.post('/cart/items', {
        product_id: p.id,
        quantity: 1,
      });
      if (p.vendor_id) {
        api.post('/attribution/event', {
          seller_id: p.vendor_id,
          event_type: 'add_to_cart',
          product_id: p.id,
          metadata: { product_name: p.name, price: p.price, quantity: 1 }
        }).catch(() => {});
      }
      window.dispatchEvent(new Event('cart_updated'));
      toast.success(`Added ${p.name} to cart!`, {
        action: {
          label: 'View Cart',
          onClick: () => { window.location.href = '/cart'; },
        },
      });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not add to cart');
    } finally {
      setAddingToCart(false);
    }
  };

  const chatLink = user
    ? `/messages/${p.vendor_id}?product=${p.id}`
    : '/auth/consumer';

  return (
    <div className={`rounded-2xl border ${p.is_featured ? 'border-amber-300' : 'border-stone-200'} bg-white p-5 flex flex-col card-hover`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold text-stone-900 leading-tight truncate" title={p.name}>{displayName}</h3>
          {lang !== 'en' && p.name_en && displayName !== p.name_en && (
            <div className="text-[11px] text-stone-400 truncate">{p.name_en}</div>
          )}
          <div className="mt-2 text-2xl font-display font-semibold text-[#0A6E3B]">
            ₹{p.price}<span className="text-xs text-stone-500 font-normal"> / {displayUnit}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              if (!user) { toast.info('Sign in to set price alerts'); return; }
              setAlertModal(true);
            }}
            className="p-1.5 rounded-full text-stone-400 hover:text-amber-600 transition-colors"
            title="Set Price Alert"
            aria-label="Set Price Alert"
          >
            <Bell size={15} />
          </button>
          {showSave && (
            <button
              data-testid={`save-toggle-${p.id}`}
              onClick={async () => {
                if (!user) { toast.info('Sign up to save products'); return; }
                try {
                  await api.post(`/saved/toggle?product_id=${p.id}`);
                  onSave && onSave(p.id);
                } catch { toast.error('Could not save'); }
              }}
              className={`p-1.5 rounded-full transition-colors ${saved ? 'text-[#0A6E3B] bg-emerald-50' : 'text-stone-400 hover:text-[#0A6E3B]'}`}
              aria-label="Save"
            >
              <Bookmark size={16} fill={saved ? '#0A6E3B' : 'none'} />
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge className={`${p.in_stock ? 'bg-emerald-100 text-emerald-900 hover:bg-emerald-100' : 'bg-red-100 text-red-900 hover:bg-red-100'} border-0 text-[10px]`}>
          {p.in_stock ? t('available') : t('outOfStock')}
        </Badge>
        {!p.in_stock && (
          <button
            type="button"
            onClick={handleAvailabilityAlert}
            className="text-[10px] text-amber-700 hover:text-amber-800 underline font-medium ml-1"
          >
            Notify when back
          </button>
        )}
        <Badge variant="outline" className="text-[10px] border-stone-300">{p.vendor_type === 'cart_vendor' ? t('cart') : t('shop')}</Badge>
        {p.vendor_is_pro && <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] border-0"><CheckCircle2 size={9} className="mr-0.5" /> {t('verified')}</Badge>}
        {p.is_featured && <Badge className="bg-amber-400 hover:bg-amber-400 text-amber-950 text-[10px] border-0"><Zap size={9} className="mr-0.5" /> Featured</Badge>}
      </div>

      <Link to={`/vendors/${p.vendor_id}`} onClick={trackClick} className="mt-3 pt-3 border-t border-stone-100 text-sm hover:text-[#0A6E3B] transition-colors">
        <div className="font-medium text-stone-900 truncate">{p.vendor_shop || p.vendor_name}</div>
        <div className="flex items-center gap-2 text-xs text-stone-500 mt-0.5">
          {p.distance_label && <span className="inline-flex items-center gap-0.5"><MapPin size={10} /> {p.distance_label}</span>}
          {h && <span>· {t('updated')} {h} {t('hAgo')}</span>}
        </div>
      </Link>

      <div className="mt-3">
        <Button
          size="sm"
          onClick={handleAddToCart}
          disabled={!p.in_stock || addingToCart}
          className="w-full rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white text-xs font-medium shadow-sm transition-all flex items-center justify-center gap-1.5 h-8"
        >
          <ShoppingBag size={13} /> {addingToCart ? 'Adding…' : 'Add to Cart'}
        </Button>
      </div>

      <div className="mt-2 flex gap-1.5">
        <Link to={`/vendors/${p.vendor_id}`} onClick={trackClick} className="flex-1">
          <Button size="sm" variant="outline" className="w-full text-xs rounded-full h-8">{t('view')}</Button>
        </Link>
        <Link to={chatLink} onClick={trackChat} className="flex-1">
          <Button size="sm" variant="outline" className="w-full text-xs rounded-full h-8"><MessageSquare size={12} className="mr-1" /> {t('chat')}</Button>
        </Link>
        <a href={directionsUrl(p)} target="_blank" rel="noopener noreferrer" onClick={trackDirections} className="flex-1">
          <Button size="sm" variant="outline" className="w-full text-xs rounded-full h-8"><Navigation size={12} className="mr-1" /> {t('directions')}</Button>
        </a>
      </div>

      {/* Price Alert Modal */}
      <Dialog open={alertModal} onOpenChange={setAlertModal}>
        <DialogContent className="bg-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-lg flex items-center gap-1.5">
              <BellRing size={16} className="text-amber-600" />
              Set Price Alert
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Get notified immediately when {p.name} drops to your target price.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePriceAlert} className="space-y-3 py-1">
            <div>
              <div className="text-xs text-stone-500 mb-1">Current Price: <strong>₹{p.price}</strong></div>
              <Label className="text-xs">Notify me when price drops to (₹)</Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                required
                className="mt-1"
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setAlertModal(false)} className="rounded-full text-xs">
                Cancel
              </Button>
              <Button type="submit" disabled={alertSubmitting} className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white text-xs">
                {alertSubmitting ? 'Setting Alert...' : 'Set Alert'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function VendorCard({ vendor: v }) {
  const { t } = useLang();
  const isCart = v.vendor_type === 'cart_vendor';

  const trackProfileView = () => {
    api.post('/attribution/event', {
      seller_id: v.id,
      event_type: 'seller_profile_view',
      metadata: { shop_name: v.shop_name }
    }).catch(() => {});
  };

  const trackDirections = () => {
    api.post('/attribution/event', {
      seller_id: v.id,
      event_type: 'directions_clicked',
      metadata: { shop_name: v.shop_name }
    }).catch(() => {});

    // Launch HyperLocal navigation trip session
    api.post('/attribution/trip/start', {
      seller_id: v.id,
      destination_lat: v.lat,
      destination_lng: v.lng,
    }).then(r => {
      if (r.data?.trip_id && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
          api.post('/attribution/trip/ping', {
            trip_id: r.data.trip_id,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          }).catch(() => {});
        }, () => {}, { timeout: 6000 });
      }
    }).catch(() => {});
  };

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 card-hover">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/vendors/${v.id}`} onClick={trackProfileView} className="font-display font-semibold text-stone-900 hover:text-[#0A6E3B] block truncate">
            {v.shop_name}
          </Link>
          <div className="mt-1 flex items-center gap-2 text-xs text-stone-500 flex-wrap">
            <Badge variant="outline" className="border-stone-300 text-[10px]">{isCart ? t('cart') : t('shop')}</Badge>
            {v.is_verified && <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100 border-0 text-[10px]"><CheckCircle2 size={9} className="mr-0.5" /> {t('verified')}</Badge>}
            {isCart && v.is_online && <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 border-0 text-[10px] animate-pulse">● {t('onlineNow')}</Badge>}
          </div>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <div className="inline-flex items-center gap-0.5 font-semibold text-stone-900 text-sm"><Star size={12} fill="#F59E0B" strokeWidth={0} /> {v.avg_rating || '—'}</div>
          <div className="text-[10px] text-stone-500">({v.review_count})</div>
        </div>
      </div>
      <div className="mt-3 text-sm text-stone-600 flex items-center gap-1.5"><MapPin size={12} /> {v.shop_address} · {v.distance_label}</div>
      <div className="text-xs text-stone-500 mt-1">{v.product_count} {t('products').toLowerCase()}</div>
      {!isCart && v.opening_hours && <div className="text-xs text-stone-500 mt-1">{v.opening_hours}</div>}
      <div className="mt-4 flex gap-2">
        <Link to={`/vendors/${v.id}`} onClick={trackProfileView} className="flex-1"><Button size="sm" variant="outline" className="w-full text-xs rounded-full">{t('view')}</Button></Link>
        <a href={`https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lng}`} target="_blank" rel="noopener noreferrer" onClick={trackDirections} className="flex-1">
          <Button size="sm" variant="outline" className="w-full text-xs rounded-full"><Navigation size={12} className="mr-1" /> {t('directions')}</Button>
        </a>
      </div>
    </div>
  );
}
