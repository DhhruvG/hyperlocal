import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ProductCard } from '@/components/cards';
import { Button } from '@/components/ui/button';
import { Bookmark } from 'lucide-react';

export default function SavedPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    api.get('/saved').then((r) => setItems(r.data)).finally(() => setLoading(false));
  }, [user]);

  if (!user) return (
    <div className="max-w-2xl mx-auto px-5 md:px-8 py-14 text-center pb-24 md:pb-10">
      <div className="w-16 h-16 rounded-full bg-emerald-50 grid place-items-center mx-auto text-[#0A6E3B]"><Bookmark size={22} /></div>
      <h1 className="font-display text-2xl font-semibold text-stone-900 mt-4">Save products for later</h1>
      <p className="text-stone-600 text-sm mt-2">Sign in to bookmark prices and revisit them anytime.</p>
      <Link to="/auth/consumer"><Button className="mt-5 rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white">Sign in</Button></Link>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-5 md:px-8 py-8 pb-24 md:pb-10">
      <h1 className="font-display text-3xl font-semibold text-stone-900">Saved products</h1>
      <p className="text-stone-600 text-sm mt-1">Your bookmarked prices, all in one place.</p>
      {loading && <div className="mt-8 text-stone-500 text-sm">Loading…</div>}
      {!loading && items.length === 0 && (
        <div className="mt-10 text-center rounded-2xl border border-stone-200 bg-white p-10">
          <div className="text-stone-500 text-sm">Nothing saved yet. Tap the <Bookmark size={14} className="inline" /> icon on any product to save it.</div>
        </div>
      )}
      {items.length > 0 && (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((p) => <ProductCard key={p.id} product={p} saved onSave={(id) => setItems(items.filter(x => x.id !== id))} />)}
        </div>
      )}
    </div>
  );
}
