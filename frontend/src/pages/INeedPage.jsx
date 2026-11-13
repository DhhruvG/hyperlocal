import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatApiErrorDetail } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Megaphone, Plus, Store, CheckCircle2 } from 'lucide-react';

export default function INeedPage() {
  const { user } = useAuth();
  const isVendor = user?.role === 'vendor';
  const [tab, setTab] = useState(isVendor ? 'open' : 'my');
  const [myRequests, setMyRequests] = useState([]);
  const [openRequests, setOpenRequests] = useState([]);
  const [categories, setCategories] = useState([]);
  const [leadEntitlement, setLeadEntitlement] = useState(null);
  const [form, setForm] = useState({
    item: '',
    quantity: '',
    category: 'other',
    note: '',
    target_price: '',
    required_by: 'today',
    radius_km: '3',
    fulfillment_preference: 'pickup',
  });
  const [replyState, setReplyState] = useState({});
  const [dialog, setDialog] = useState(false);

  useEffect(() => { api.get('/categories').then(r => setCategories(r.data)); }, []);

  const load = async () => {
    if (isVendor) {
      const { data } = await api.get('/requests/open');
      setOpenRequests(data);
      api.get('/vendor/leads/entitlement').then(r => setLeadEntitlement(r.data)).catch(() => {});
    } else if (user) {
      const { data } = await api.get('/requests/my');
      setMyRequests(data);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/requests', {
        ...form,
        target_price: form.target_price ? parseFloat(form.target_price) : undefined,
        radius_km: form.radius_km ? parseFloat(form.radius_km) : 3.0,
      });
      setForm({
        item: '',
        quantity: '',
        category: 'other',
        note: '',
        target_price: '',
        required_by: 'today',
        radius_km: '3',
        fulfillment_preference: 'pickup',
      });
      setDialog(false);
      toast.success('Request broadcast to nearby sellers!');
      load();
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message); }
  };

  const sendReply = async (reqId) => {
    const s = replyState[reqId] || {};
    if (!s.price) { toast.error('Enter a price'); return; }
    try {
      await api.post(`/requests/${reqId}/reply`, {
        price: parseFloat(s.price),
        note: s.note,
        available_quantity: s.available_quantity || undefined,
        pickup_time: s.pickup_time || 'Immediate',
        offer_expiry: s.offer_expiry || '24 hours',
      });
      toast.success('Structured offer sent to buyer!');
      setReplyState({ ...replyState, [reqId]: { price: '', note: '', available_quantity: '', pickup_time: 'Immediate' } });
      load();
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message); }
  };

  return (
    <div className="max-w-4xl mx-auto px-5 md:px-8 py-8 pb-24 md:pb-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <span className="chip chip-amber"><Megaphone size={12} /> I need</span>
          <h1 className="font-display text-3xl md:text-4xl font-semibold text-stone-900 mt-3">Tell sellers what you need</h1>
          <p className="text-stone-600 text-sm mt-1">Post a request. Nearby sellers reply with today's price.</p>
        </div>
        {!isVendor && user && (
          <Dialog open={dialog} onOpenChange={setDialog}>
            <DialogTrigger asChild>
              <Button data-testid="ineed-post-button" className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white"><Plus size={16} className="mr-1.5" /> Post request</Button>
            </DialogTrigger>
            <DialogContent className="bg-white">
              <DialogHeader><DialogTitle>Post a request</DialogTitle></DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <div><Label className="text-xs uppercase tracking-widest text-stone-500">What</Label><Input data-testid="ineed-item" required value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} placeholder="e.g., Tomato" /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs uppercase tracking-widest text-stone-500">Quantity</Label><Input value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="e.g., 5 kg" /></div>
                  <div><Label className="text-xs uppercase tracking-widest text-stone-500">Target Price (₹ Optional)</Label><Input type="number" value={form.target_price} onChange={(e) => setForm({ ...form, target_price: e.target.value })} placeholder="e.g., 150" /></div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div><Label className="text-xs uppercase tracking-widest text-stone-500">Required By</Label>
                    <Select value={form.required_by} onValueChange={(v) => setForm({ ...form, required_by: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="now">Now (Urgent)</SelectItem>
                        <SelectItem value="today">Today</SelectItem>
                        <SelectItem value="tomorrow">Tomorrow</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs uppercase tracking-widest text-stone-500">Radius</Label>
                    <Select value={form.radius_km} onValueChange={(v) => setForm({ ...form, radius_km: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 km</SelectItem>
                        <SelectItem value="3">3 km</SelectItem>
                        <SelectItem value="5">5 km</SelectItem>
                        <SelectItem value="10">10 km</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs uppercase tracking-widest text-stone-500">Fulfillment</Label>
                    <Select value={form.fulfillment_preference} onValueChange={(v) => setForm({ ...form, fulfillment_preference: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pickup">Store Pickup</SelectItem>
                        <SelectItem value="delivery">Local Delivery</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label className="text-xs uppercase tracking-widest text-stone-500">Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{categories.map(c => <SelectItem key={c.key} value={c.key}>{c.emoji} {c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs uppercase tracking-widest text-stone-500">Note (optional)</Label><Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} /></div>
                <DialogFooter><Button data-testid="ineed-submit" type="submit" className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white">Broadcast Request</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {!user && (
        <div className="mt-10 rounded-2xl border border-stone-200 bg-white p-8 text-center">
          <div className="text-stone-700">Sign in as a shopper to post requests, or as a vendor to reply.</div>
          <div className="mt-4 flex gap-2 justify-center">
            <Link to="/auth/consumer"><Button variant="outline" className="rounded-full">Shopper login</Button></Link>
            <Link to="/auth/vendor"><Button className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white">Vendor login</Button></Link>
          </div>
        </div>
      )}

      {isVendor && (
        <div className="mt-8">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-display text-lg font-semibold text-stone-900">Open buyer requests</h2>
            {leadEntitlement && (
              <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-900 text-xs">
                Plan: {leadEntitlement.plan_code} · {leadEntitlement.leads_remaining_this_month} / {leadEntitlement.monthly_lead_limit} Monthly Lead Credits Remaining
              </Badge>
            )}
          </div>
          <div className="mt-4 space-y-4">
            {openRequests.map((r) => (
              <RequestCard key={r.id} r={r} isVendor
                state={replyState[r.id] || {}}
                setState={(s) => setReplyState({ ...replyState, [r.id]: s })}
                onSend={() => sendReply(r.id)}
                onRefresh={load}
              />
            ))}
            {openRequests.length === 0 && <div className="text-stone-500 text-sm">No open requests right now.</div>}
          </div>
        </div>
      )}

      {!isVendor && user && (
        <div className="mt-8">
          <h2 className="font-display text-lg font-semibold text-stone-900">Your requests</h2>
          <div className="mt-4 space-y-4">
            {myRequests.map((r) => <RequestCard key={r.id} r={r} onRefresh={load} />)}
            {myRequests.length === 0 && <div className="text-stone-500 text-sm">Nothing yet. Post your first request to get vendor prices.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function RequestCard({ r, isVendor, state, setState, onSend, onRefresh }) {
  const [replies, setReplies] = useState(null);
  const [showReplies, setShow] = useState(false);
  const loadReplies = async () => {
    const { data } = await api.get(`/requests/${r.id}/replies`);
    setReplies(data); setShow(true);
  };
  const acceptOffer = async (replyId) => {
    try {
      await api.post(`/requests/${r.id}/replies/${replyId}/accept`);
      toast.success('Offer accepted! Seller has been notified.');
      await loadReplies();
      onRefresh && onRefresh();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display text-lg font-semibold text-stone-900">{r.item}</span>
            <Badge variant="outline" className="text-[10px] uppercase">{r.lifecycle_state || r.status}</Badge>
            {r.required_by && <Badge className="bg-amber-100 text-amber-900 border-0 text-[10px]">Need: {r.required_by}</Badge>}
            {r.fulfillment_preference && <Badge variant="outline" className="text-[10px]">{r.fulfillment_preference}</Badge>}
          </div>
          <div className="text-sm text-stone-600 mt-0.5">
            {r.quantity && <span>Qty: {r.quantity} · </span>}
            {r.target_price && <span>Target: ₹{r.target_price} · </span>}
            {r.radius_km && <span>Radius: {r.radius_km} km · </span>}
            {r.category && <span>Category: {r.category} · </span>}
            <span className="text-stone-400">{new Date(r.created_at).toLocaleString()}</span>
          </div>
          {r.note && <div className="text-sm text-stone-600 mt-2">"{r.note}"</div>}
        </div>
        <div className="text-right">
          {typeof r.reply_count === 'number' && <Badge variant="outline" className="border-stone-300">{r.reply_count} replies</Badge>}
        </div>
      </div>

      {isVendor && (
        <>
          {r.replied_by_me ? (
            <div className="mt-4 text-xs text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 size={12} /> You've replied</div>
          ) : (
            <div className="mt-4 flex flex-col md:flex-row gap-2 md:items-end pt-3 border-t border-stone-100">
              <div className="md:w-28"><Label className="text-[10px] uppercase tracking-widest text-stone-500">Your price (₹)</Label><Input data-testid={`reply-price-${r.id}`} type="number" value={state.price || ''} onChange={(e) => setState({ ...state, price: e.target.value })} placeholder="0" /></div>
              <div className="md:w-32"><Label className="text-[10px] uppercase tracking-widest text-stone-500">Pickup Time</Label><Input value={state.pickup_time || ''} onChange={(e) => setState({ ...state, pickup_time: e.target.value })} placeholder="Immediate / 15m" /></div>
              <div className="flex-1"><Label className="text-[10px] uppercase tracking-widest text-stone-500">Note / Availability</Label><Input value={state.note || ''} onChange={(e) => setState({ ...state, note: e.target.value })} placeholder="e.g., Fresh stock ready" /></div>
              <Button data-testid={`reply-send-${r.id}`} onClick={onSend} className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white">Send Offer</Button>
            </div>
          )}
        </>
      )}

      {!isVendor && (
        <div className="mt-3">
          <button onClick={loadReplies} className="text-sm text-[#0A6E3B] hover:underline">
            {showReplies ? 'Refresh replies' : `See replies${r.reply_count ? ` (${r.reply_count})` : ''}`}
          </button>
          {showReplies && replies && (
            <div className="mt-3 space-y-2">
              {replies.length === 0 ? <div className="text-stone-500 text-sm">No replies yet.</div> :
                replies.map((rep) => (
                  <div key={rep.id} className="rounded-lg border border-stone-200 bg-stone-50 p-3 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <Link to={`/vendors/${rep.vendor_id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-900 hover:text-[#0A6E3B]">
                        <Store size={12} /> {rep.vendor_shop}
                        {rep.vendor_verified && <CheckCircle2 size={11} className="text-emerald-600" />}
                      </Link>
                      {rep.pickup_time && <span className="ml-2 text-[11px] text-stone-500">· Ready: {rep.pickup_time}</span>}
                      {rep.note && <div className="text-xs text-stone-600 mt-1">"{rep.note}"</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="font-semibold text-[#0A6E3B] text-base">₹{rep.price}</div>
                      {rep.status === 'ACCEPTED' || r.accepted_reply_id === rep.id ? (
                        <Badge className="bg-emerald-600 text-white border-0 text-[10px]">Offer Accepted</Badge>
                      ) : (
                        <Button size="sm" onClick={() => acceptOffer(rep.id)} className="h-7 text-xs rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white">
                          Accept Offer
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
