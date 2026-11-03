import React from 'react';
import { Link } from 'react-router-dom';
import { LANDING } from '@/constants/testIds';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Store, ShoppingBasket, TrendingUp, MapPin, Zap, ArrowRight } from 'lucide-react';

const HERO_IMG = 'https://images.unsplash.com/photo-1779861656578-47975f2a5f84?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzZ8MHwxfHNlYXJjaHwxfHxmcmVzaCUyMHByb2R1Y2UlMjBncm9jZXJ5JTIwbG9jYWwlMjBzaG9wJTIwaW5kaWF8ZW58MHx8fHwxNzg5MDQ5MDEyfDA&ixlib=rb-4.1.0&q=85';
const CART_IMG = 'https://images.unsplash.com/photo-1788620644598-58fe1354bf2a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAxODF8MHwxfHNlYXJjaHwzfHxpbmRpYW4lMjBzdHJlZXQlMjB2ZW5kb3IlMjBtYXJrZXR8ZW58MHx8fHwxNzg5MDQ5MDE5fDA&ixlib=rb-4.1.0&q=85';
const PRODUCE_IMG = 'https://images.unsplash.com/photo-1723158694712-d528f378577a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzZ8MHwxfHNlYXJjaHwyfHxmcmVzaCUyMHByb2R1Y2UlMjBncm9jZXJ5JTIwbG9jYWwlMjBzaG9wJTIwaW5kaWF8ZW58MHx8fHwxNzg5MDQ5MDEyfDA&ixlib=rb-4.1.0&q=85';

export default function LandingPage() {
  const [q, setQ] = React.useState('');

  return (
    <div>
      {/* HERO */}
      <section className="hero-mesh relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-5 md:px-8 pt-16 pb-20 md:pt-24 md:pb-28 grid md:grid-cols-12 gap-10 items-center">
          <div className="md:col-span-7">
            <span className="chip mb-6"><MapPin size={12} /> Serving Dehradun · Hyperlocal</span>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold text-stone-900 leading-[1.02]">
              Compare local prices <br/>before you step out.
            </h1>
            <p className="mt-5 text-stone-600 text-base md:text-lg max-w-xl leading-relaxed">
              A hyperlocal marketplace where nearby shops and cart vendors update their daily prices, and shoppers find the best deal in seconds — no more calling three stores.
            </p>

            {/* Search bar */}
            <form
              className="mt-8 flex items-center gap-2 max-w-xl bg-white rounded-full border border-stone-200 pl-5 pr-1.5 py-1.5 shadow-sm"
              onSubmit={(e) => { e.preventDefault(); window.location.href = `/search?q=${encodeURIComponent(q)}`; }}
            >
              <Search size={18} className="text-stone-500" />
              <input
                data-testid={LANDING.searchInput}
                value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Try 'tomato', 'atta', 'onions'…"
                className="flex-1 outline-none bg-transparent py-2 text-sm placeholder:text-stone-400"
              />
              <Button data-testid={LANDING.searchButton} type="submit" className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white h-10 px-5">
                Compare
              </Button>
            </form>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/auth/vendor?mode=signup">
                <Button data-testid={LANDING.vendorCta} variant="outline" className="rounded-full border-stone-300 hover:border-[#0A6E3B] hover:text-[#0A6E3B]">
                  <Store size={15} className="mr-1.5" /> List your shop free for 30 days
                </Button>
              </Link>
              <Link to="/auth/consumer?mode=signup">
                <Button data-testid={LANDING.consumerCta} variant="ghost" className="rounded-full hover:bg-emerald-50 hover:text-[#0A6E3B]">
                  <ShoppingBasket size={15} className="mr-1.5" /> I'm a shopper <ArrowRight size={14} className="ml-1" />
                </Button>
              </Link>
            </div>

            <div className="mt-10 flex items-center gap-6 text-xs text-stone-500">
              <div><span className="text-stone-900 font-semibold">₹0</span> for shoppers, always</div>
              <div className="w-px h-4 bg-stone-300" />
              <div>Retailers & cart vendors welcome</div>
            </div>
          </div>

          {/* Hero art */}
          <div className="md:col-span-5 relative">
            <div className="relative rounded-2xl overflow-hidden border border-stone-200 shadow-lg">
              <img src={HERO_IMG} alt="Local shop in Dehradun" className="w-full h-[420px] object-cover" />
              <div className="absolute bottom-3 left-3 right-3 bg-white/95 backdrop-blur rounded-xl p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 grid place-items-center text-[#0A6E3B]"><Zap size={18} /></div>
                <div className="text-xs">
                  <div className="font-semibold text-stone-900">Tomato · 1kg</div>
                  <div className="text-stone-500">Cheapest today: <span className="text-[#0A6E3B] font-semibold">₹28</span> at Sharma Kirana</div>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-6 -left-6 hidden md:block w-32 h-32 rounded-2xl overflow-hidden border-4 border-white shadow-lg">
              <img src={CART_IMG} alt="Cart vendor" className="w-full h-full object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 py-20">
        <div className="flex items-end justify-between mb-10">
          <div>
            <span className="eyebrow text-[#0A6E3B]">How it works</span>
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-stone-900 mt-2">Two sides. One neighbourhood.</h2>
          </div>
          <Link to="/search" className="text-sm text-[#0A6E3B] hover:underline hidden md:inline-flex items-center">Start comparing <ArrowRight size={14} className="ml-1" /></Link>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-stone-200 bg-white p-6 md:p-8 card-hover">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-[#0A6E3B] grid place-items-center mb-4"><ShoppingBasket size={20} /></div>
            <h3 className="font-display text-xl font-semibold text-stone-900">For shoppers</h3>
            <p className="text-stone-600 text-sm mt-2 leading-relaxed">Search any product. See every nearby vendor with today's price, availability and shop details. Free forever.</p>
            <ul className="mt-5 space-y-2 text-sm text-stone-700">
              <li className="flex gap-2"><span className="text-[#0A6E3B]">•</span> Live prices from local shops and cart vendors</li>
              <li className="flex gap-2"><span className="text-[#0A6E3B]">•</span> In-stock filter and cheapest-first sorting</li>
              <li className="flex gap-2"><span className="text-[#0A6E3B]">•</span> Zero fees, zero delivery</li>
            </ul>
            <Link to="/auth/consumer?mode=signup"><Button data-testid={LANDING.heroCta} className="mt-6 rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white">Start shopping</Button></Link>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-6 md:p-8 card-hover">
            <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 grid place-items-center mb-4"><Store size={20} /></div>
            <div className="flex items-center gap-2 mb-1"><h3 className="font-display text-xl font-semibold text-stone-900">For vendors</h3><Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 border-0">30-day free trial</Badge></div>
            <p className="text-stone-600 text-sm mt-2 leading-relaxed">Add products, update daily prices in seconds, and reach every shopper in your neighbourhood. Cart vendors welcome.</p>
            <ul className="mt-5 space-y-2 text-sm text-stone-700">
              <li className="flex gap-2"><span className="text-amber-600">•</span> Unlimited products during trial (15 after)</li>
              <li className="flex gap-2"><span className="text-amber-600">•</span> One-tap availability toggle per product</li>
              <li className="flex gap-2"><span className="text-amber-600">•</span> Analytics, priority placement & branches on Pro</li>
            </ul>
            <Link to="/auth/vendor?mode=signup"><Button variant="outline" className="mt-6 rounded-full border-amber-500 text-amber-800 hover:bg-amber-50">Claim your listing</Button></Link>
          </div>
        </div>
      </section>

      {/* WHY IT MATTERS */}
      <section className="bg-white border-t border-stone-100">
        <div className="max-w-7xl mx-auto px-5 md:px-8 py-20 grid md:grid-cols-12 gap-10 items-center">
          <div className="md:col-span-6 order-2 md:order-1">
            <span className="eyebrow text-[#0A6E3B]">Built for Dehradun</span>
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-stone-900 mt-2 leading-tight">Save 15–40% on every grocery run.</h2>
            <p className="mt-4 text-stone-600 leading-relaxed">Prices in the local market change daily. Cart vendors often beat retail shops by ₹5–15/kg, but you'd never know without a hyperlocal compare. LocalPrice makes that comparison free and instant.</p>

            <div className="mt-8 grid grid-cols-2 gap-6">
              <Stat label="avg savings / basket" value="₹184" />
              <Stat label="vendors onboarding weekly" value="120+" />
              <Stat label="products tracked" value="3,400" />
              <Stat label="response time" value="< 1s" />
            </div>
          </div>
          <div className="md:col-span-6 order-1 md:order-2">
            <div className="rounded-2xl overflow-hidden border border-stone-200 shadow-sm">
              <img src={PRODUCE_IMG} alt="Fresh produce" className="w-full h-[380px] object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* PRICING TEASER */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 py-20">
        <div className="rounded-2xl border border-stone-200 bg-gradient-to-br from-emerald-50 via-white to-amber-50 p-8 md:p-12 text-center">
          <span className="chip chip-amber inline-flex"><TrendingUp size={12} /> Vendor Pro</span>
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-stone-900 mt-4">₹199/mo or ₹1,499/yr after your free trial</h2>
          <p className="mt-3 text-stone-600 max-w-xl mx-auto text-sm md:text-base">Unlimited listings, priority placement, per-product analytics, featured cards, and multi-branch — everything you need to outsell the shop next door.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/auth/vendor?mode=signup"><Button className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white">Start 30-day trial</Button></Link>
            <Link to="/vendor/pricing"><Button variant="ghost" className="rounded-full">See all Pro perks</Button></Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-stone-100 bg-white">
        <div className="max-w-7xl mx-auto px-5 md:px-8 py-8 flex flex-col md:flex-row items-center justify-between text-xs text-stone-500 gap-3">
          <div>© {new Date().getFullYear()} LocalPrice · Made in Dehradun</div>
          <div className="flex gap-4">
            <Link to="/search" className="hover:text-[#0A6E3B]">Compare</Link>
            <Link to="/auth/vendor" className="hover:text-[#0A6E3B]">Vendor login</Link>
            <Link to="/vendor/pricing" className="hover:text-[#0A6E3B]">Pricing</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="font-display text-3xl font-semibold text-[#0A6E3B]">{value}</div>
      <div className="eyebrow text-stone-500 mt-1">{label}</div>
    </div>
  );
}
