import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, formatApiErrorDetail } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLang } from '@/lib/lang';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ProductCard } from '@/components/cards';
import { toast } from 'sonner';
import { MapPin, Star, CheckCircle2, Phone, Clock, MessageSquare, Navigation, Store, ChevronLeft } from 'lucide-react';

export default function VendorProfilePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t } = useLang();
  const [vendor, setVendor] = useState(null);
  const [products, setProducts] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [myRating, setMyRating] = useState(5);
  const [myComment, setMyComment] = useState('');

  const load = async () => {
    const { data } = await api.get(`/vendors/${id}`);
    setVendor(data.vendor); setProducts(data.products); setReviews(data.reviews);
  };
  useEffect(() => {
    load();
    if (id) {
      api.post('/attribution/event', {
        seller_id: id,
        event_type: 'seller_profile_view'
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (vendor?.lat && vendor?.lng && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          const R = 6371e3;
          const φ1 = latitude * Math.PI / 180;
          const φ2 = vendor.lat * Math.PI / 180;
          const Δφ = (vendor.lat - latitude) * Math.PI / 180;
          const Δλ = (vendor.lng - longitude) * Math.PI / 180;
          const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                    Math.cos(φ1) * Math.cos(φ2) *
                    Math.sin(Δλ/2) * Math.sin(Δλ/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const dist = R * c;
          if (dist <= 60) {
            api.post('/attribution/event', {
              seller_id: vendor.id,
              event_type: 'location_visit_signal',
              metadata: {
                distance_meters: Math.round(dist),
                accuracy_meters: Math.round(accuracy || 0)
              }
            }).catch(() => {});
          }
        },
        () => {},
        { timeout: 8000, maximumAge: 60000 }
      );
    }
  }, [vendor]);

  const submitReview = async (e) => {
    e.preventDefault();
    if (!user) { toast.info('Sign in to review'); return; }
    if (user.role !== 'consumer') { toast.error('Only shoppers can review'); return; }
    try {
      await api.post(`/vendors/${id}/reviews`, { rating: myRating, comment: myComment });
      toast.success('Thanks for the review!');
      setMyComment('');
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  if (!vendor) return <div className="p-10 text-center text-stone-500">Loading…</div>;

  const isCart = vendor.vendor_type === 'cart_vendor';

  const onDirectionsClick = () => {
    api.post('/attribution/event', {
      seller_id: vendor.id,
      event_type: 'directions_clicked'
    }).catch(() => {});

    // Launch HyperLocal navigation trip session
    api.post('/attribution/trip/start', {
      seller_id: vendor.id,
      destination_lat: vendor.lat,
      destination_lng: vendor.lng,
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

  const onChatClick = () => {
    api.post('/attribution/event', {
      seller_id: vendor.id,
      event_type: 'contact_seller',
      metadata: { channel: 'chat' }
    }).catch(() => {});
  };

  const onCallClick = () => {
    api.post('/attribution/event', {
      seller_id: vendor.id,
      event_type: 'contact_seller',
      metadata: { channel: 'call' }
    }).catch(() => {});
  };

  return (
    <div className="max-w-7xl mx-auto px-5 md:px-8 py-6 pb-24 md:pb-10">
      <Link to="/" className="text-sm text-stone-500 hover:text-[#0A6E3B] inline-flex items-center gap-1 mb-4"><ChevronLeft size={14} /> Back</Link>

      <div className="rounded-2xl bg-white border border-stone-200 p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <Badge variant="outline" className="border-stone-300 text-xs">{isCart ? <><Store size={11} className="mr-1" /> {t('cart')}</> : <><Store size={11} className="mr-1" /> {t('shop')}</>}</Badge>
              {vendor.is_verified && <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white border-0 text-xs"><CheckCircle2 size={11} className="mr-1" /> {t('verified')}</Badge>}
              {vendor.is_pro && <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 border-0 text-xs">Pro</Badge>}
              {isCart && vendor.is_online && <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 border-0 text-xs animate-pulse">● {t('onlineNow')}</Badge>}
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-semibold text-stone-900">{vendor.shop_name}</h1>
            <div className="flex items-center gap-3 mt-2 text-stone-600 text-sm flex-wrap">
              <span className="inline-flex items-center gap-1"><Star size={14} fill="#F59E0B" strokeWidth={0} /> <strong className="text-stone-900">{vendor.avg_rating || '—'}</strong> ({vendor.review_count})</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1"><MapPin size={13} /> {vendor.shop_address} · {vendor.distance_label}</span>
              {!isCart && vendor.opening_hours && <><span>·</span><span className="inline-flex items-center gap-1"><Clock size={13} /> {vendor.opening_hours}</span></>}
              <span>·</span>
              <span>{vendor.product_count} {t('products').toLowerCase()}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={user ? `/messages/${vendor.id}` : '/auth/consumer'} onClick={onChatClick}><Button variant="outline" className="rounded-full"><MessageSquare size={14} className="mr-1.5" /> {t('chat')}</Button></Link>
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${vendor.lat},${vendor.lng}`} target="_blank" rel="noopener noreferrer" onClick={onDirectionsClick}>
              <Button className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white"><Navigation size={14} className="mr-1.5" /> {t('directions')}</Button>
            </a>
            {vendor.phone && <a href={`tel:${vendor.phone}`} onClick={onCallClick}><Button variant="outline" className="rounded-full"><Phone size={14} className="mr-1.5" /> Call</Button></a>}
          </div>
        </div>
      </div>

      {/* Products */}
      <section className="mt-8">
        <h2 className="font-display text-xl md:text-2xl font-semibold text-stone-900">Products</h2>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {products.map((p) => <ProductCard key={p.id} product={{ ...p, vendor_shop: vendor.shop_name, vendor_type: vendor.vendor_type }} showSave={false} />)}
        </div>
        {products.length === 0 && <div className="mt-6 text-stone-500 text-sm text-center">No products listed yet.</div>}
      </section>

      {/* Reviews */}
      <section className="mt-10 grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 rounded-2xl bg-white border border-stone-200 p-6">
          <h2 className="font-display text-lg font-semibold text-stone-900">Reviews</h2>
          {reviews.length === 0 ? <div className="text-stone-500 text-sm mt-3">No reviews yet.</div> : (
            <div className="mt-4 divide-y divide-stone-100">
              {reviews.map((r) => (
                <div key={r.id} className="py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-stone-900">{r.consumer_name || 'Shopper'}</span>
                    <span className="inline-flex items-center gap-0.5 text-amber-600"><Star size={12} fill="#F59E0B" strokeWidth={0} /> {r.rating}</span>
                    <span className="text-stone-400 text-xs ml-auto">{new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                  {r.comment && <div className="text-stone-600 text-sm mt-1">{r.comment}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-2xl bg-white border border-stone-200 p-6">
          <h2 className="font-display text-lg font-semibold text-stone-900">Leave a review</h2>
          <form onSubmit={submitReview} className="mt-4 space-y-3">
            <div className="flex items-center gap-1">
              {[1,2,3,4,5].map((n) => (
                <button key={n} type="button" onClick={() => setMyRating(n)} className="p-1" data-testid={`rating-${n}`}>
                  <Star size={22} fill={n <= myRating ? '#F59E0B' : 'none'} stroke={n <= myRating ? '#F59E0B' : '#a8a29e'} strokeWidth={1.5} />
                </button>
              ))}
            </div>
            <Textarea value={myComment} onChange={(e) => setMyComment(e.target.value)} placeholder="Optional comment…" rows={3} />
            <Button type="submit" className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white w-full">Submit</Button>
          </form>
        </div>
      </section>
    </div>
  );
}
