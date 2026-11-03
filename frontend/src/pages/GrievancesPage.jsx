import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, formatApiErrorDetail, API_BASE } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { LifeBuoy, Plus, Sparkles, Loader2, ArrowRight } from 'lucide-react';

const STATUS_STYLE = {
  open: 'bg-blue-100 text-blue-900',
  acknowledged: 'bg-sky-100 text-sky-900',
  under_review: 'bg-amber-100 text-amber-900',
  waiting_for_user: 'bg-orange-100 text-orange-900',
  waiting_for_other_party: 'bg-orange-100 text-orange-900',
  escalated: 'bg-red-100 text-red-900',
  resolution_proposed: 'bg-emerald-100 text-emerald-900',
  resolved: 'bg-emerald-600 text-white',
  closed: 'bg-stone-500 text-white',
  reopened: 'bg-purple-100 text-purple-900',
};
const PRIORITY_STYLE = {
  low: 'bg-stone-100 text-stone-700',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-900',
  urgent: 'bg-red-100 text-red-900 animate-pulse',
};

export default function GrievancesPage() {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ category: '', subcategory: '', subject: '', description: '', priority: 'medium' });
  const [dialog, setDialog] = useState(false);
  const [triaging, setTriaging] = useState(false);
  const [triageResult, setTriageResult] = useState(null);
  const [aiSuggestedPriority, setAiSuggestedPriority] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await api.get('/grievances/mine');
    setList(data);
  };
  useEffect(() => {
    if (!user) return;
    api.get('/grievances/categories').then(r => setCategories(r.data.categories));
    load();
  }, [user]);

  const triage = async () => {
    if (!form.description || form.description.length < 15) { toast.info('Add a bit more detail so AI can suggest a category'); return; }
    setTriaging(true);
    try {
      const { data } = await api.post('/ai/triage', { description: form.description, subject: form.subject, role: user?.role });
      setTriageResult(data);
      setAiSuggestedPriority(data.priority);
      setForm(f => ({ ...f, category: data.category || f.category, priority: data.priority || f.priority, subject: f.subject || data.subject || '' }));
    } catch { toast.error('AI unavailable — please pick manually'); }
    finally { setTriaging(false); }
  };

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const { data } = await api.post('/grievances', { ...form, ai_suggested_priority: aiSuggestedPriority });
      toast.success(`Grievance ${data.grievance_number} submitted`);
      setDialog(false);
      setForm({ category: '', subcategory: '', subject: '', description: '', priority: 'medium' });
      setTriageResult(null); setAiSuggestedPriority(null);
      load();
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  if (!user) return (
    <div className="max-w-2xl mx-auto px-5 md:px-8 py-14 text-center pb-24 md:pb-10">
      <div className="w-16 h-16 rounded-full bg-emerald-50 grid place-items-center mx-auto text-[#0A6E3B]"><LifeBuoy size={22} /></div>
      <h1 className="font-display text-2xl font-semibold text-stone-900 mt-4">Help & Grievances</h1>
      <p className="text-stone-600 text-sm mt-2">Sign in to file a grievance or track your existing ones.</p>
      <Link to="/auth/consumer"><Button className="mt-5 rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white">Sign in</Button></Link>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-5 md:px-8 py-8 pb-24 md:pb-10">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <span className="chip"><LifeBuoy size={12} /> Support</span>
          <h1 className="font-display text-3xl md:text-4xl font-semibold text-stone-900 mt-3">Help & Grievances</h1>
          <p className="text-stone-600 text-sm mt-1">Every grievance is tracked with a unique ID. Our admin usually responds within 24–48 hours.</p>
        </div>
        <Dialog open={dialog} onOpenChange={setDialog}>
          <DialogTrigger asChild>
            <Button data-testid="new-grievance-btn" className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white"><Plus size={16} className="mr-1.5" /> New grievance</Button>
          </DialogTrigger>
          <DialogContent className="bg-white max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Report a problem</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <Label className="text-xs uppercase tracking-widest text-stone-500">Describe the issue</Label>
                <Textarea data-testid="grv-description" required minLength={10} rows={4} value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="What happened? Include shop name, product, date/time if you can." />
                <div className="mt-2 flex justify-end">
                  <Button type="button" size="sm" variant="outline" onClick={triage} disabled={triaging} className="text-xs">
                    {triaging ? <><Loader2 size={12} className="mr-1 animate-spin" /> Thinking…</> : <><Sparkles size={12} className="mr-1" /> AI-suggest category</>}
                  </Button>
                </div>
              </div>
              {triageResult && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs">
                  <div className="font-semibold text-emerald-900">AI Suggestion — you can edit before submitting</div>
                  <div className="mt-1 text-emerald-800">Category: <strong>{triageResult.category}</strong> · Priority: <strong>{triageResult.priority}</strong></div>
                  <div className="text-emerald-700 italic">{triageResult.reasoning}</div>
                </div>
              )}
              <div>
                <Label className="text-xs uppercase tracking-widest text-stone-500">Subject</Label>
                <Input data-testid="grv-subject" required minLength={3} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Short title" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs uppercase tracking-widest text-stone-500">Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger data-testid="grv-category"><SelectValue placeholder="Choose…" /></SelectTrigger>
                    <SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-widest text-stone-500">Priority</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button data-testid="grv-submit" type="submit" disabled={saving || !form.category} className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white">
                  {saving ? 'Submitting…' : 'Submit grievance'}
                </Button>
              </DialogFooter>
              <div className="text-[10px] text-stone-500">Evidence like screenshots can be uploaded after submission from the grievance detail page.</div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-8 space-y-3">
        {list.map((g) => (
          <Link key={g.id} to={`/grievances/${g.id}`} className="block rounded-2xl bg-white border border-stone-200 p-5 hover:border-[#0A6E3B] transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[10px] text-stone-500">{g.grievance_number}</span>
                  <Badge className={`${STATUS_STYLE[g.status] || 'bg-stone-100 text-stone-700'} hover:opacity-100 border-0 text-[10px] capitalize`}>{g.status.replace(/_/g, ' ')}</Badge>
                  <Badge className={`${PRIORITY_STYLE[g.priority] || ''} hover:opacity-100 border-0 text-[10px] capitalize`}>{g.priority}</Badge>
                  {g.user_unread && <span className="text-[10px] font-semibold text-emerald-700">● New reply</span>}
                </div>
                <div className="font-display text-lg font-semibold text-stone-900 mt-1">{g.subject}</div>
                <div className="text-xs text-stone-500 mt-1">Category: {g.category} · {new Date(g.created_at).toLocaleDateString()}</div>
              </div>
              <ArrowRight size={16} className="text-stone-400 mt-1 shrink-0" />
            </div>
          </Link>
        ))}
        {list.length === 0 && (
          <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center text-stone-500 text-sm">
            No grievances yet. Click "New grievance" to report an issue.
          </div>
        )}
      </div>
    </div>
  );
}
