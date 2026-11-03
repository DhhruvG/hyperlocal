import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useLang } from '@/lib/lang';
import { SEARCH } from '@/constants/testIds';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { ProductCard } from '@/components/cards';
import { toast } from 'sonner';
import {
  Search, MapPin, Loader2, Sparkles, Mic, Camera, ShoppingBag,
  Store, CheckCircle2, ArrowRight, RefreshCw, X, Bot, HelpCircle
} from 'lucide-react';

export default function ConsumerSearch() {
  const [params, setParams] = useSearchParams();
  const { t } = useLang();
  const [q, setQ] = useState(params.get('q') || '');
  const [category, setCategory] = useState(params.get('category') || 'all');
  const [categories, setCategories] = useState([]);
  const [inStock, setInStock] = useState(false);
  const [sort, setSort] = useState('distance');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => { api.get('/categories').then(r => setCategories(r.data)); }, []);

  const run = useCallback(async (opts = {}) => {
    setLoading(true); setSearched(true);
    try {
      const { data } = await api.get('/search', {
        params: {
          q: opts.q ?? q, city: 'Dehradun',
          category: opts.category ?? category,
          in_stock_only: inStock, sort,
        },
      });
      setResults(data);
      if (Array.isArray(data) && data.length > 0) {
        const queryTerm = opts.q ?? q;
        const currentCat = opts.category ?? category;
        const uniqueVendorIds = [...new Set(data.map(p => p.vendor_id).filter(Boolean))];
        uniqueVendorIds.slice(0, 5).forEach((vid) => {
          api.post('/attribution/event', {
            seller_id: vid,
            event_type: queryTerm ? 'product_search' : 'seller_impression',
            metadata: { query: queryTerm, category: currentCat }
          }).catch(() => {});
        });
      }
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, [q, category, inStock, sort]);

  useEffect(() => {
    const initialQ = params.get('q');
    const initialCat = params.get('category');
    if (initialQ || initialCat) run({ q: initialQ || '', category: initialCat || 'all' });
    // eslint-disable-next-line
  }, []);

  const onSubmit = (e) => {
    e.preventDefault();
    const next = new URLSearchParams(); if (q) next.set('q', q); if (category !== 'all') next.set('category', category);
    setParams(next); run();
  };

  // Smart Feature States
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotQuery, setCopilotQuery] = useState('');
  const [copilotReply, setCopilotReply] = useState(null);
  const [copilotLoading, setCopilotLoading] = useState(false);

  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceInput, setVoiceInput] = useState('');

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);

  const [basketOpen, setBasketOpen] = useState(false);
  const [basketInput, setBasketInput] = useState('Tomato, Milk, Bread');
  const [basketResult, setBasketResult] = useState(null);
  const [basketLoading, setBasketLoading] = useState(false);

  const handleAskCopilot = async (customQ) => {
    const queryToUse = customQ || copilotQuery || q;
    if (!queryToUse.trim()) return;
    setCopilotLoading(true);
    try {
      const res = await api.post('/ai/copilot', { query: queryToUse });
      setCopilotReply(res.data);
      if (res.data.expanded_terms && res.data.expanded_terms.length > 0) {
        toast.info(`Expanded Hindi/Hinglish search: ${res.data.expanded_terms.slice(0, 4).join(', ')}`);
      }
    } catch {
      toast.error('AI Copilot is currently offline or disabled.');
    } finally {
      setCopilotLoading(false);
    }
  };

  const handleVoiceSubmit = async (transcript) => {
    const text = transcript || voiceInput;
    if (!text.trim()) return;
    try {
      const res = await api.post('/ai/voice-search', { audio_transcript: text });
      setVoiceOpen(false);
      const searchKeyword = res.data.extracted_keywords?.[0] || text;
      setQ(searchKeyword);
      run({ q: searchKeyword });
      toast.success(`Voice query: "${text}" -> Searching "${searchKeyword}"`);
    } catch {
      setQ(text);
      run({ q: text });
      setVoiceOpen(false);
    }
  };

  const handleCameraUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCameraLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post('/ai/camera-search', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setCameraOpen(false);
      const detected = res.data.detected_object || 'Groceries';
      setQ(detected);
      run({ q: detected });
      toast.success(`Identified: "${detected}" (${Math.round(res.data.match_confidence * 100)}% match)`);
    } catch {
      toast.error('Camera product recognition failed.');
    } finally {
      setCameraLoading(false);
    }
  };

  const handleCalculateBasket = async () => {
    if (!basketInput.trim()) return;
    setBasketLoading(true);
    const items = basketInput.split(',').map(s => ({ item_name: s.trim(), quantity: 1.0 })).filter(i => i.item_name);
    try {
      const res = await api.post('/ai/cheapest-basket', {
        items,
        lat: 28.6139,
        lng: 77.2090
      });
      setBasketResult(res.data);
    } catch {
      toast.error('Could not compute cheapest basket.');
    } finally {
      setBasketLoading(false);
    }
  };

  const cheapest = results.length ? Math.min(...results.map(r => r.price)) : null;

  return (
    <div className="max-w-7xl mx-auto px-5 md:px-8 py-8 pb-24 md:pb-10">
      <div>
        <span className="chip"><MapPin size={12} /> Dehradun</span>
        <h1 className="font-display text-3xl md:text-4xl font-semibold text-stone-900 mt-3">{t('popularNearYou')}</h1>
        <p className="text-stone-600 text-sm mt-2">{t('searchPlaceholder')}</p>
      </div>

      {/* SMART AI TOOLS BAR */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setCopilotOpen(!copilotOpen)}
          className={`rounded-full text-xs h-8 gap-1.5 border-emerald-300 text-emerald-800 ${copilotOpen ? 'bg-emerald-50' : 'bg-white hover:bg-emerald-50'}`}
        >
          <Sparkles size={13} className="text-emerald-600" />
          AI Shopping Copilot
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setVoiceOpen(true)}
          className="rounded-full text-xs h-8 gap-1.5 bg-white border-stone-200 text-stone-700 hover:bg-stone-50"
        >
          <Mic size={13} className="text-stone-500" />
          Voice Search
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setCameraOpen(true)}
          className="rounded-full text-xs h-8 gap-1.5 bg-white border-stone-200 text-stone-700 hover:bg-stone-50"
        >
          <Camera size={13} className="text-stone-500" />
          Camera Search
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => { setBasketOpen(true); if (!basketResult) handleCalculateBasket(); }}
          className="rounded-full text-xs h-8 gap-1.5 bg-white border-purple-200 text-purple-800 hover:bg-purple-50"
        >
          <ShoppingBag size={13} className="text-purple-600" />
          Cheapest Basket Optimizer
        </Button>
      </div>

      {/* INLINE COPILOT DRAWER */}
      {copilotOpen && (
        <div className="mt-3 p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-900">
              <Bot size={16} className="text-emerald-600" />
              AI Copilot (Hindi, Hinglish & English Synonyms)
            </div>
            <button onClick={() => setCopilotOpen(false)} className="text-stone-400 hover:text-stone-700"><X size={14} /></button>
          </div>
          <div className="flex gap-2">
            <Input
              value={copilotQuery}
              onChange={(e) => setCopilotQuery(e.target.value)}
              placeholder="e.g. Kya taaza tamatar aur pyaaz available hai? Or: Lowest price milk near me"
              className="h-9 text-xs bg-white"
              onKeyDown={(e) => e.key === 'Enter' && handleAskCopilot()}
            />
            <Button
              size="sm"
              onClick={() => handleAskCopilot()}
              disabled={copilotLoading}
              className="h-9 px-4 bg-emerald-600 text-white hover:bg-emerald-700 text-xs shrink-0"
            >
              {copilotLoading ? <Loader2 size={13} className="animate-spin" /> : 'Ask'}
            </Button>
          </div>
          {copilotReply && (
            <div className="p-3 bg-white rounded-xl border border-emerald-100 text-xs space-y-2">
              <div className="text-stone-700 whitespace-pre-wrap">{copilotReply.copilot_reply}</div>
              {copilotReply.expanded_terms && (
                <div className="flex flex-wrap items-center gap-1 text-[11px] text-stone-500 pt-1 border-t border-stone-100">
                  <span className="font-medium">Vocabulary synonyms matched:</span>
                  {copilotReply.expanded_terms.map(t => (
                    <Badge key={t} variant="secondary" className="text-[10px] bg-stone-100 text-stone-700">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center bg-white border border-stone-200 rounded-2xl p-3 shadow-sm">
        <div className="flex-1 flex items-center gap-2 px-2">
          <Search size={18} className="text-stone-500 shrink-0" />
          <Input data-testid={SEARCH.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPlaceholder')} className="border-0 focus-visible:ring-0 shadow-none text-base" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger data-testid={SEARCH.sortSelect} className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="distance">Nearest first</SelectItem>
              <SelectItem value="price_asc">Cheapest first</SelectItem>
              <SelectItem value="price_desc">Highest first</SelectItem>
              <SelectItem value="latest">Recently updated</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 pl-2 pr-3 border-l border-stone-200 h-9">
            <Switch data-testid={SEARCH.inStockToggle} checked={inStock} onCheckedChange={setInStock} id="in-stock" />
            <Label htmlFor="in-stock" className="text-xs text-stone-600">In stock</Label>
          </div>
          <Button data-testid={SEARCH.submit} type="submit" className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white h-10 px-6">Search</Button>
        </div>
      </form>

      {/* CATEGORY PILLS */}
      <ScrollArea className="mt-5">
        <div className="flex items-center gap-2 pb-3">
          <button
            onClick={() => { setCategory('all'); run({ category: 'all' }); }}
            className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-medium border transition-colors ${category === 'all' ? 'bg-[#0A6E3B] text-white border-[#0A6E3B]' : 'bg-white text-stone-700 border-stone-200 hover:border-[#0A6E3B]'}`}
          >All</button>
          {categories.map((c) => (
            <button
              key={c.key} onClick={() => { setCategory(c.key); run({ category: c.key }); }}
              className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-medium border transition-colors ${category === c.key ? 'bg-[#0A6E3B] text-white border-[#0A6E3B]' : 'bg-white text-stone-700 border-stone-200 hover:border-[#0A6E3B]'}`}
            >{c.emoji} {c.label}</button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* VOICE SEARCH MODAL */}
      <Dialog open={voiceOpen} onOpenChange={setVoiceOpen}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-2 text-base">
              <Mic size={18} className="text-emerald-600 animate-pulse" />
              Multilingual Voice Search
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center mx-auto">
              <Mic size={30} className="animate-pulse" />
            </div>
            <p className="text-xs text-stone-500">Speak in Hindi, Hinglish, or English, or select a sample voice query below:</p>
            <div className="flex flex-col gap-2 text-left">
              {[
                'Do kilo taaza tamatar aur pyaaz',
                'Fresh Alphonso mangoes under 400',
                'Amul taaza doodh aur bread',
              ].map((phrase, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleVoiceSubmit(phrase)}
                  className="text-xs p-2 rounded-lg bg-stone-50 hover:bg-emerald-50 border border-stone-200 text-stone-800 transition-colors flex items-center justify-between"
                >
                  <span>"{phrase}"</span>
                  <ArrowRight size={12} className="text-stone-400" />
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Or type voice utterance..."
                value={voiceInput}
                onChange={(e) => setVoiceInput(e.target.value)}
                className="text-xs h-9"
                onKeyDown={(e) => e.key === 'Enter' && handleVoiceSubmit()}
              />
              <Button size="sm" onClick={() => handleVoiceSubmit()} className="bg-emerald-600 text-white text-xs h-9">
                Search
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* CAMERA SEARCH MODAL */}
      <Dialog open={cameraOpen} onOpenChange={setCameraOpen}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-2 text-base">
              <Camera size={18} className="text-blue-600" />
              Camera Product Search
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-700 grid place-items-center mx-auto">
              <Camera size={30} />
            </div>
            <p className="text-xs text-stone-500">Snap or upload a photo of a grocery item or barcode to find nearby availability:</p>
            <label className="block cursor-pointer">
              <span className="sr-only">Choose image</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleCameraUpload}
                disabled={cameraLoading}
                className="block w-full text-xs text-stone-500 file:mr-3 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </label>
            {cameraLoading && (
              <div className="flex items-center justify-center gap-2 text-xs text-blue-600">
                <Loader2 size={14} className="animate-spin" /> Recognizing object with AI...
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* CHEAPEST BASKET MODAL */}
      <Dialog open={basketOpen} onOpenChange={setBasketOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShoppingBag size={18} className="text-purple-600" />
              Smart Cheapest Grocery Basket
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs">Grocery Items (comma-separated)</Label>
              <div className="flex gap-2">
                <Input
                  value={basketInput}
                  onChange={(e) => setBasketInput(e.target.value)}
                  placeholder="e.g. Tomato, Milk, Onion, Bread"
                  className="h-9 text-xs"
                />
                <Button size="sm" onClick={handleCalculateBasket} disabled={basketLoading} className="h-9 bg-purple-700 text-white shrink-0 text-xs">
                  {basketLoading ? <Loader2 size={13} className="animate-spin" /> : 'Recalculate'}
                </Button>
              </div>
            </div>

            {basketResult && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Option A */}
                  <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge className="bg-stone-800 text-white text-[10px]">OPTION A: SINGLE STORE</Badge>
                      <span className="font-bold text-stone-900 text-sm">
                        ₹{basketResult.option_a_single_store?.total_cost || 0}
                      </span>
                    </div>
                    <div className="text-xs font-medium text-stone-700">
                      {basketResult.option_a_single_store?.vendor_name || 'Nearest Supermarket'}
                    </div>
                    <div className="text-[11px] text-stone-500">
                      {basketResult.option_a_single_store?.items_found || 0} items found in 1 visit
                    </div>
                  </div>

                  {/* Option B */}
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge className="bg-emerald-600 text-white text-[10px]">OPTION B: SPLIT SAVINGS</Badge>
                      <span className="font-bold text-emerald-800 text-sm">
                        ₹{basketResult.option_b_multi_store?.total_cost || 0}
                      </span>
                    </div>
                    <div className="text-xs font-medium text-emerald-900">
                      Split across {basketResult.option_b_multi_store?.stores_count || 1} stores
                    </div>
                    <div className="text-[11px] text-emerald-700 font-semibold">
                      Save ₹{basketResult.option_b_multi_store?.savings_vs_single || 0} vs single store
                    </div>
                  </div>
                </div>

                <div className="p-2.5 bg-stone-100 rounded-lg text-[11px] text-stone-600">
                  {basketResult.tradeoff_summary}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {loading && <div className="mt-10 flex items-center gap-2 text-stone-500 text-sm justify-center"><Loader2 size={16} className="animate-spin" /> Searching…</div>}

      {!loading && searched && results.length === 0 && (
        <div data-testid={SEARCH.emptyState} className="mt-16 text-center">
          <div className="w-16 h-16 rounded-full bg-stone-100 grid place-items-center mx-auto text-stone-400"><Search size={22} /></div>
          <div className="font-display text-xl font-semibold text-stone-900 mt-4">No matches yet</div>
          <p className="text-stone-500 text-sm mt-1">Try a broader term or a different category.</p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {results.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      )}
    </div>
  );
}
