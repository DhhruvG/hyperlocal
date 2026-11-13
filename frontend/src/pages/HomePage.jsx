import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useLang } from '@/lib/lang';
import { LANDING, SEARCH } from '@/constants/testIds';
import { ProductCard, VendorCard } from '@/components/cards';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Search, Megaphone, Map, Star, ArrowRight, Mic, MicOff } from 'lucide-react';

export default function HomePage() {
  const { t, lang, localizeName, localizeUnit } = useLang();
  const catLabelForLang = (c) => {
    const dict = {
      en: { vegetables: 'Vegetables', fruits: 'Fruits', groceries: 'Groceries', dairy: 'Dairy', bakery: 'Bakery', stationery: 'Stationery', clothing: 'Clothing', household: 'Household', hardware: 'Hardware', pharmacy: 'Pharmacy', flowers: 'Flowers', other: 'Other' },
      hi: { vegetables: 'सब्ज़ियाँ', fruits: 'फल', groceries: 'किराना', dairy: 'डेयरी', bakery: 'बेकरी', stationery: 'स्टेशनरी', clothing: 'कपड़े', household: 'घरेलू', hardware: 'हार्डवेयर', pharmacy: 'दवाई', flowers: 'फूल', other: 'अन्य' },
      hinglish: { vegetables: 'Sabziyan', fruits: 'Phal', groceries: 'Kirana', dairy: 'Dairy & Doodh', bakery: 'Bakery', stationery: 'Stationery', clothing: 'Kapde', household: 'Ghar ka Samaan', hardware: 'Hardware', pharmacy: 'Dawai', flowers: 'Phool', other: 'Other' },
    };
    return dict[lang]?.[c.key] || c.label;
  };
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const [stats, setStats] = useState(null);
  const [categories, setCategories] = useState([]);
  const [todayPrices, setTodayPrices] = useState([]);
  const [popular, setPopular] = useState([]);
  const [vendors, setVendors] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [s, c, t, p, v] = await Promise.all([
          api.get('/stats/overview'),
          api.get('/categories'),
          api.get('/discover/today-prices?limit=10'),
          api.get('/discover/popular?limit=8'),
          api.get('/vendors?limit=8&sort=distance'),
        ]);
        setStats(s.data); setCategories(c.data); setTodayPrices(t.data);
        setPopular(p.data); setVendors(v.data);
      } catch {}
    })();
  }, []);

  const onSearch = (e) => { e.preventDefault(); navigate(`/search?q=${encodeURIComponent(q)}`); };

  const toggleVoiceSearch = () => {
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Voice search is not supported in this browser. Try Chrome or Edge.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setListening(true);
      toast.info('Listening… speak the product name');
    };
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim() || '';
      if (transcript) {
        setQ(transcript);
        toast.success(`Searching for "${transcript}"`);
        navigate(`/search?q=${encodeURIComponent(transcript)}`);
      }
    };
    recognition.onerror = (event) => {
      setListening(false);
      if (event.error !== 'aborted') {
        toast.error(event.error === 'not-allowed' ? 'Microphone permission denied.' : 'Could not hear clearly. Please try again.');
      }
    };
    recognition.onend = () => {
      setListening(false);
    };
    recognition.start();
  };

  return (
    <div className="pb-24 md:pb-8">
      {/* HERO */}
      <section className="relative">
        <div className="max-w-7xl mx-auto px-5 md:px-8 pt-6 md:pt-10">
          <div className="rounded-2xl md:rounded-3xl bg-[#0A6E3B] text-white p-6 md:p-10 relative overflow-hidden">
            <div className="absolute -right-24 -top-24 w-64 h-64 rounded-full bg-emerald-500/25 blur-3xl" />
            <div className="absolute right-20 bottom-4 w-40 h-40 rounded-full bg-amber-400/20 blur-2xl" />
            <div className="relative z-10 max-w-2xl">
              <div className="text-[11px] uppercase tracking-[0.2em] text-emerald-100">Dehradun</div>
              <h1 className="font-display text-3xl md:text-5xl font-semibold mt-2 leading-[1.05]">LocalPrice</h1>
              <p className="text-emerald-50/90 mt-2 text-sm md:text-base">{t('tagline')}</p>

              <form onSubmit={onSearch} className="mt-6 flex items-center gap-1.5 bg-white rounded-full p-1.5 shadow-lg">
                <div className="flex items-center gap-2 px-4 flex-1 min-w-0">
                  <Search size={18} className="text-stone-500 shrink-0" />
                  <input
                    data-testid={LANDING.searchInput}
                    value={q} onChange={(e) => setQ(e.target.value)}
                    placeholder={listening ? 'Listening… speak now' : t('searchPlaceholder')}
                    className="w-full outline-none bg-transparent py-2.5 text-sm md:text-base text-stone-900 placeholder:text-stone-400"
                  />
                </div>
                <Button
                  type="button"
                  onClick={toggleVoiceSearch}
                  data-testid="landing-voice-search-btn"
                  title={listening ? 'Stop listening' : 'Voice search'}
                  aria-label={listening ? 'Stop voice search' : 'Voice search'}
                  className={`rounded-full h-11 w-11 p-0 shrink-0 transition-all ${
                    listening
                      ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse'
                      : 'bg-emerald-50 hover:bg-emerald-100 text-[#0A6E3B] border border-emerald-200'
                  }`}
                >
                  {listening ? <MicOff size={18} /> : <Mic size={18} />}
                </Button>
                <Button data-testid={LANDING.searchButton} type="submit" className="rounded-full bg-amber-500 hover:bg-amber-600 text-white h-11 px-6 shrink-0">
                  <Search size={16} />
                </Button>
              </form>

              {stats && (
                <div className="mt-5 text-xs text-emerald-100 flex flex-wrap gap-x-4 gap-y-1">
                  <span><strong className="text-white">{stats.vendor_count}</strong> {t('verifiedSellers')}</span>
                  <span>·</span>
                  <span><strong className="text-white">{stats.online_count}</strong> {t('onlineNow')}</span>
                  <span>·</span>
                  <span><strong className="text-white">{stats.product_count}</strong> {t('products')}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* QUICK ACTIONS & CONSUMER SHORTCUTS (100% Free) */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 mt-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link to="/i-need" className="rounded-2xl border-l-4 border-amber-500 bg-amber-50/60 hover:bg-amber-50 border-y border-r border-amber-100 p-5 transition-colors flex items-center gap-4 group">
            <div className="w-11 h-11 rounded-xl bg-amber-500 grid place-items-center text-white shrink-0"><Megaphone size={20} /></div>
            <div>
              <div className="font-display text-lg font-semibold text-stone-900">{t('tellSellers')}</div>
              <div className="text-xs text-stone-600 mt-0.5">{t('tellSellersDesc')}</div>
            </div>
            <ArrowRight size={18} className="ml-auto text-amber-700 opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
          <Link to="/map" className="rounded-2xl border-l-4 border-emerald-500 bg-emerald-50/60 hover:bg-emerald-50 border-y border-r border-emerald-100 p-5 transition-colors flex items-center gap-4 group">
            <div className="w-11 h-11 rounded-xl bg-emerald-600 grid place-items-center text-white shrink-0"><Map size={20} /></div>
            <div>
              <div className="font-display text-lg font-semibold text-stone-900">{t('seeMap')}</div>
              <div className="text-xs text-stone-600 mt-0.5">{t('seeMapDesc')}</div>
            </div>
            <ArrowRight size={18} className="ml-auto text-emerald-700 opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
        </div>

        {/* Fast Everyday Consumer Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/search?sort=price_asc" className="px-3.5 py-2 rounded-full bg-white border border-stone-200 hover:border-[#0A6E3B] text-xs font-medium text-stone-800 shadow-xs">
            💰 Compare Lowest Local Prices
          </Link>
          <Link to="/map" className="px-3.5 py-2 rounded-full bg-white border border-stone-200 hover:border-[#0A6E3B] text-xs font-medium text-stone-800 shadow-xs">
            🛒 Live Mobile Carts ({vendors.filter((v) => v.vendor_type === 'cart_vendor').length})
          </Link>
          <Link to="/saved" className="px-3.5 py-2 rounded-full bg-white border border-stone-200 hover:border-[#0A6E3B] text-xs font-medium text-stone-800 shadow-xs">
            🔖 Saved Products & Alerts
          </Link>
          <Link to="/orders" className="px-3.5 py-2 rounded-full bg-white border border-stone-200 hover:border-[#0A6E3B] text-xs font-medium text-stone-800 shadow-xs">
            📦 My Orders
          </Link>
          <Link to="/messages" className="px-3.5 py-2 rounded-full bg-white border border-stone-200 hover:border-[#0A6E3B] text-xs font-medium text-stone-800 shadow-xs">
            💬 Seller Messages
          </Link>
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 mt-10">
        <h2 className="font-display text-xl md:text-2xl font-semibold text-stone-900">{t('shopByCategory')}</h2>
        <div className="mt-5 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {categories.map((c) => (
            <Link
              key={c.key} to={`/search?category=${c.key}`}
              data-testid={`category-${c.key}`}
              className="rounded-2xl border border-stone-200 bg-white p-4 text-center hover:border-[#0A6E3B] transition-colors flex flex-col items-center gap-2"
            >
              <div className="text-3xl leading-none" role="img" aria-hidden="true">{c.emoji}</div>
              <div className="text-xs font-medium text-stone-700">{catLabelForLang(c)}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* TODAY'S PRICES */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 mt-10">
        <h2 className="font-display text-xl md:text-2xl font-semibold text-stone-900">{t('todaysPrices')}</h2>
        <div className="mt-4 rounded-2xl border border-stone-200 bg-white overflow-hidden">
          {todayPrices.map((p, idx) => (
            <Link
              key={p._id || idx}
              to={`/search?q=${encodeURIComponent(p.name)}`}
              className={`flex items-center justify-between px-5 py-3 text-sm hover:bg-emerald-50/40 transition-colors ${idx !== todayPrices.length - 1 ? 'border-b border-stone-100' : ''}`}
            >
              <span className="font-medium text-stone-900">{localizeName ? localizeName(p) : p.name}</span>
              <span className="text-[#0A6E3B] font-semibold">₹{p.price}<span className="text-stone-500 font-normal">/{localizeUnit ? localizeUnit(p.unit || 'unit') : (p.unit || 'unit')}</span></span>
              <span className="text-stone-500 text-xs hidden sm:inline">{p.vendor_shop}</span>
            </Link>
          ))}
          {todayPrices.length === 0 && <div className="p-6 text-stone-500 text-sm text-center">No prices yet.</div>}
        </div>
      </section>

      {/* POPULAR NEAR YOU */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 mt-10">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-xl md:text-2xl font-semibold text-stone-900">{t('popularNearYou')}</h2>
          <Link to="/search" className="text-sm text-[#0A6E3B] hover:underline">See all</Link>
        </div>
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {popular.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      {/* NEARBY RETAILERS & MOBILE CARTS */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 mt-10 space-y-8">
        <div>
          <div className="flex items-end justify-between">
            <div>
              <h2 className="font-display text-xl md:text-2xl font-semibold text-stone-900">Nearby Retailers & Shops</h2>
              <p className="text-xs text-stone-500 mt-0.5">Verified neighborhood kirana, dairy, fruit & vegetable stores</p>
            </div>
            <Link to="/map" className="text-sm text-[#0A6E3B] hover:underline">Open map</Link>
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {vendors.filter((v) => v.vendor_type !== 'cart_vendor').slice(0, 4).map((v) => <VendorCard key={v.id} vendor={v} />)}
          </div>
        </div>

        {vendors.some((v) => v.vendor_type === 'cart_vendor') && (
          <div>
            <div className="flex items-end justify-between">
              <div>
                <h2 className="font-display text-xl md:text-2xl font-semibold text-stone-900">Nearby Mobile Carts (Live)</h2>
                <p className="text-xs text-stone-500 mt-0.5">Street carts & mobile vendors selling fresh produce near your lane</p>
              </div>
              <Link to="/map" className="text-sm text-[#0A6E3B] hover:underline">Track on map</Link>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {vendors.filter((v) => v.vendor_type === 'cart_vendor').slice(0, 4).map((v) => <VendorCard key={v.id} vendor={v} />)}
            </div>
          </div>
        )}
      </section>

      {/* DISCLAIMER */}
      <div className="max-w-7xl mx-auto px-5 md:px-8 mt-14 text-xs text-stone-400 text-center">
        {t('disclaimer')}
      </div>
    </div>
  );
}
