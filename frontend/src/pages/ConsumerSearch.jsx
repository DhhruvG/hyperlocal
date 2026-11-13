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

  // Smart Shopping Lists & Sponsored Campaigns
  const [sponsoredAds, setSponsoredAds] = useState([]);
  const [listsOpen, setListsOpen] = useState(false);
  const [shoppingLists, setShoppingLists] = useState([]);
  const [newListName, setNewListName] = useState('');
  const [newListTemplate, setNewListTemplate] = useState('MONTHLY_RATION');
  const [newListItemsText, setNewListItemsText] = useState('Rice 5kg, Atta 10kg, Toor Dal 2kg');
  const [listOptimizingId, setListOptimizingId] = useState(null);
  const [listOptimizationResult, setListOptimizationResult] = useState(null);

  useEffect(() => {
    api.get('/campaigns/sponsored', { params: { category } })
      .then(r => setSponsoredAds(r.data || []))
      .catch(() => {});
  }, [category]);

  const loadShoppingLists = async () => {
    try {
      const res = await api.get('/shopping-lists');
      setShoppingLists(res.data || []);
    } catch {
      setShoppingLists([]);
    }
  };

  const handleCreateShoppingList = async (e) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    const parsedItems = newListItemsText
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => ({ item_name: s, quantity: 1, unit: 'unit' }));
    try {
      await api.post('/shopping-lists', {
        name: newListName.trim(),
        template_type: newListTemplate,
        items: parsedItems,
      });
      toast.success('Smart Shopping List created!');
      setNewListName('');
      loadShoppingLists();
    } catch {
      toast.error('Please sign in as a shopper to save persistent Shopping Lists.');
    }
  };

  const handleOptimizeSavedList = async (listId) => {
    setListOptimizingId(listId);
    try {
      const res = await api.post(`/shopping-lists/${listId}/optimize`);
      setListOptimizationResult(res.data);
      toast.success(`Optimized "${res.data.list_name}" across nearby stores!`);
    } catch {
      toast.error('Could not optimize shopping list.');
    } finally {
      setListOptimizingId(null);
    }
  };

  const handleConvertBasketToCart = async (modeKey, itemsList) => {
    if (!itemsList || itemsList.length === 0) {
      toast.error('No matched in-stock items to add.');
      return;
    }
    try {
      const res = await api.post('/basket/convert-to-cart', {
        mode: modeKey,
        items: itemsList,
      });
      window.dispatchEvent(new Event('cart_updated'));
      toast.success(`Added ${res.data.added_items_count} optimized item(s) to your cart!`);
      setBasketOpen(false);
    } catch {
      toast.error('Please sign in as a shopper to convert basket to cart.');
    }
  };

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
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => { setListsOpen(true); loadShoppingLists(); }}
          className="rounded-full text-xs h-8 gap-1.5 bg-white border-amber-300 text-amber-900 hover:bg-amber-50"
          data-testid="open-smart-shopping-lists"
        >
          <CheckCircle2 size={13} className="text-amber-600" />
          Smart Shopping Lists
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
              <SelectItem value="price_asc">Cheapest first (Freshness weighted)</SelectItem>
              <SelectItem value="confidence">Highest inventory confidence</SelectItem>
              <SelectItem value="price_desc">Highest first</SelectItem>
              <SelectItem value="latest">Recently updated</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 pl-2 pr-3 border-l border-stone-200 h-9">
            <Switch data-testid={SEARCH.inStockToggle} checked={inStock} onCheckedChange={setInStock} id="in-stock" />
            <Label htmlFor="in-stock" className="text-xs text-stone-600">In stock</Label>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setVoiceOpen(true)}
            data-testid="search-bar-voice-btn"
            title="Voice search"
            aria-label="Voice search"
            className="rounded-full h-10 w-10 p-0 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-[#0A6E3B] shrink-0"
          >
            <Mic size={16} />
          </Button>
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* CHEAPEST (Multi-Store Split) */}
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <Badge className="bg-emerald-600 text-white text-[10px]">CHEAPEST (SPLIT)</Badge>
                        <span className="font-bold text-emerald-900 text-sm">
                          ₹{basketResult.modes?.CHEAPEST?.total_cost ?? basketResult.option_b_multi_store?.total_cost ?? 0}
                        </span>
                      </div>
                      <div className="text-xs font-medium text-emerald-950 mt-1">
                        Split across {basketResult.modes?.CHEAPEST?.stores_required ?? basketResult.option_b_multi_store?.stores_count ?? 1} store(s)
                      </div>
                      <div className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                        Save ₹{basketResult.modes?.CHEAPEST?.potential_savings ?? basketResult.option_b_multi_store?.savings_vs_single ?? 0}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleConvertBasketToCart('CHEAPEST', basketResult.modes?.CHEAPEST?.items || basketResult.option_b_multi_store?.items || [])}
                      className="w-full h-7 text-[11px] rounded-full bg-emerald-700 hover:bg-emerald-800 text-white"
                    >
                      Convert Cheapest to Cart
                    </Button>
                  </div>

                  {/* CONVENIENT (Single Store) */}
                  <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <Badge className="bg-stone-800 text-white text-[10px]">CONVENIENT (1 STOP)</Badge>
                        <span className="font-bold text-stone-900 text-sm">
                          ₹{basketResult.modes?.CONVENIENT?.total_cost ?? basketResult.option_a_single_store?.total_cost ?? 0}
                        </span>
                      </div>
                      <div className="text-xs font-medium text-stone-800 mt-1 truncate">
                        {basketResult.modes?.CONVENIENT?.vendor_shop || basketResult.option_a_single_store?.vendor_name || 'Best Single Store'}
                      </div>
                      <div className="text-[11px] text-stone-500 mt-0.5">
                        {basketResult.modes?.CONVENIENT?.items_found ?? basketResult.option_a_single_store?.items_found ?? 0} items · Avg Confidence {basketResult.modes?.CONVENIENT?.avg_confidence_score ?? 85}%
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleConvertBasketToCart('CONVENIENT', basketResult.modes?.CONVENIENT?.items || basketResult.option_a_single_store?.items || [])}
                      className="w-full h-7 text-[11px] rounded-full border-stone-300"
                    >
                      Convert 1-Stop to Cart
                    </Button>
                  </div>

                  {/* NEAREST */}
                  <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl space-y-2 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <Badge className="bg-blue-700 text-white text-[10px]">NEAREST STORES</Badge>
                        <span className="font-bold text-blue-950 text-sm">
                          ₹{basketResult.modes?.NEAREST?.total_cost ?? basketResult.option_a_single_store?.total_cost ?? 0}
                        </span>
                      </div>
                      <div className="text-xs font-medium text-blue-900 mt-1">
                        Closest available stock ({basketResult.modes?.NEAREST?.stores_required ?? 1} stop)
                      </div>
                      <div className="text-[11px] text-blue-700 mt-0.5">
                        Minimizes walking/driving distance
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleConvertBasketToCart('NEAREST', basketResult.modes?.NEAREST?.items || [])}
                      className="w-full h-7 text-[11px] rounded-full border-blue-300 text-blue-900"
                    >
                      Convert Nearest to Cart
                    </Button>
                  </div>
                </div>

                {basketResult.missing_products?.length > 0 && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900">
                    <strong>Missing in local stock:</strong> {basketResult.missing_products.join(', ')}
                  </div>
                )}

                <div className="p-2.5 bg-stone-100 rounded-lg text-[11px] text-stone-600">
                  {basketResult.tradeoff_summary}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* SMART SHOPPING LISTS MODAL */}
      <Dialog open={listsOpen} onOpenChange={setListsOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 size={18} className="text-amber-600" />
              Persistent Smart Shopping Lists
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-xs">
            <form onSubmit={handleCreateShoppingList} className="p-3.5 bg-stone-50 border border-stone-200 rounded-xl space-y-2.5">
              <div className="font-semibold text-stone-900">Create Reusable Household List</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input
                  placeholder="List Name (e.g. Monthly Ration)"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  required
                  className="h-8 text-xs bg-white"
                />
                <Select value={newListTemplate} onValueChange={setNewListTemplate}>
                  <SelectTrigger className="h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY_RATION">Monthly Ration</SelectItem>
                    <SelectItem value="WEEKLY_VEGETABLES">Weekly Vegetables</SelectItem>
                    <SelectItem value="DAILY_ESSENTIALS">Daily Milk & Bread</SelectItem>
                    <SelectItem value="FESTIVAL">Festival List</SelectItem>
                    <SelectItem value="CUSTOM">Custom List</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Items (comma-separated, e.g. Tomato, Milk, Bread)"
                  value={newListItemsText}
                  onChange={(e) => setNewListItemsText(e.target.value)}
                  className="h-8 text-xs bg-white"
                />
                <Button type="submit" size="sm" className="h-8 bg-[#0A6E3B] text-white text-xs shrink-0">
                  Save List
                </Button>
              </div>
            </form>

            <div className="space-y-2">
              {shoppingLists.length === 0 ? (
                <div className="text-center py-6 text-stone-400">
                  No saved shopping lists yet. Create one above to track prices and optimize baskets in 1 click.
                </div>
              ) : (
                shoppingLists.map((sl) => (
                  <div key={sl.id} className="p-3 border border-stone-200 rounded-xl flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-stone-900 flex items-center gap-2">
                        {sl.name}
                        <Badge variant="outline" className="text-[10px]">{sl.template_type}</Badge>
                      </div>
                      <div className="text-stone-500 text-[11px] mt-0.5">
                        {(sl.items || []).map(i => i.item_name).join(', ') || 'Empty list'}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={listOptimizingId === sl.id}
                      onClick={() => handleOptimizeSavedList(sl.id)}
                      className="rounded-full text-xs h-7 border-emerald-300 text-emerald-800"
                    >
                      {listOptimizingId === sl.id ? 'Optimizing…' : 'Optimize Basket'}
                    </Button>
                  </div>
                ))
              )}
            </div>

            {listOptimizationResult && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                <div className="font-semibold text-emerald-950">
                  Optimization for "{listOptimizationResult.list_name}":
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 bg-white rounded-lg border border-emerald-100">
                    <div className="text-[10px] text-stone-500">Cheapest Split</div>
                    <div className="font-bold text-sm text-emerald-800">₹{listOptimizationResult.estimated_total_cheapest}</div>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-emerald-100">
                    <div className="text-[10px] text-stone-500">1-Stop Convenient</div>
                    <div className="font-bold text-sm text-stone-900">₹{listOptimizationResult.estimated_total_convenient}</div>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-emerald-100">
                    <div className="text-[10px] text-stone-500">Potential Savings</div>
                    <div className="font-bold text-sm text-emerald-700">₹{listOptimizationResult.potential_savings}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* SPONSORED PROMOTIONS STRIP (Clearly separated from organic ranking) */}
      {sponsoredAds.length > 0 && (
        <div className="mt-6 p-4 rounded-2xl bg-amber-50/50 border border-amber-200/80">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
              <Badge className="bg-amber-200 text-amber-950 border-0 text-[10px]">SPONSORED</Badge>
              <span>Neighborhood Featured Merchant Promotions</span>
            </div>
            <span className="text-[10px] text-stone-400">Organic results below are ranked independently</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {sponsoredAds.map((ad) => (
              <div
                key={ad.campaign_id}
                onClick={() => {
                  api.post(`/campaigns/${ad.campaign_id}/event?event_type=CLICK`).catch(() => {});
                  window.location.href = `/vendors/${ad.vendor_id}`;
                }}
                className="p-3 rounded-xl bg-white border border-amber-200 hover:border-amber-400 cursor-pointer transition-all flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-stone-900 truncate">{ad.title}</div>
                  <div className="text-[11px] text-stone-500 truncate">{ad.vendor_shop}</div>
                  {ad.offer_headline && <div className="text-[10px] text-emerald-700 font-medium mt-0.5">{ad.offer_headline}</div>}
                </div>
                {ad.price && <div className="font-bold text-sm text-[#0A6E3B] shrink-0">₹{ad.price}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

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
