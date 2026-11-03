import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatApiErrorDetail } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { AlertTriangle, ChevronLeft, Send, StickyNote, Sparkles, Loader2, ShieldCheck, Clock, ArrowRight, MessageSquare } from 'lucide-react';

const STATUSES = ['open', 'acknowledged', 'under_review', 'waiting_for_user', 'waiting_for_other_party', 'escalated', 'resolution_proposed', 'resolved', 'closed', 'reopened'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const STATUS_STYLE = {
  open: 'bg-blue-100 text-blue-900', acknowledged: 'bg-sky-100 text-sky-900',
  under_review: 'bg-amber-100 text-amber-900', waiting_for_user: 'bg-orange-100 text-orange-900',
  waiting_for_other_party: 'bg-orange-100 text-orange-900', escalated: 'bg-red-100 text-red-900',
  resolution_proposed: 'bg-emerald-100 text-emerald-900', resolved: 'bg-emerald-600 text-white',
  closed: 'bg-stone-500 text-white', reopened: 'bg-purple-100 text-purple-900',
};
const PRIORITY_STYLE = {
  low: 'bg-stone-100 text-stone-700', medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-900', urgent: 'bg-red-100 text-red-900 animate-pulse',
};

// ---------- List ----------
export function AdminGrievances() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [filters, setFilters] = useState({ status: 'all', priority: 'all', category: 'all', role: 'all', q: '', overdue: false });

  const load = async () => {
    const params = {};
    Object.entries(filters).forEach(([k, v]) => { if (v && v !== 'all' && v !== '' && v !== false) params[k] = v; });
    const { data } = await api.get('/admin/grievances', { params });
    setItems(data);
  };
  useEffect(() => { load(); api.get('/admin/grievances/stats').then(r => setStats(r.data)); /* eslint-disable-next-line */ }, [filters]);

  return (
    <div>
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-stone-900">Grievances</h1>
          <p className="text-stone-600 text-sm mt-1">Case management for all reported issues.</p>
        </div>
        {stats && (
          <div className="flex gap-2 flex-wrap">
            <Chip label="Total" value={stats.total} />
            <Chip label="Open" value={stats.open} tone="blue" />
            <Chip label="Urgent" value={stats.priority_urgent} tone="red" />
            <Chip label="Overdue" value={stats.overdue} tone="orange" />
            <Chip label="Resolved" value={stats.resolved} tone="green" />
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="mt-6 rounded-2xl bg-white border border-stone-200 p-4 flex flex-wrap gap-2 items-center">
        <Input placeholder="Search ID, subject, name…" value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && load()} className="w-64" />
        <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All statuses</SelectItem>{STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.priority} onValueChange={(v) => setFilters({ ...filters, priority: v })}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All priorities</SelectItem>{PRIORITIES.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.role} onValueChange={(v) => setFilters({ ...filters, role: v })}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All roles</SelectItem><SelectItem value="consumer">Consumer</SelectItem><SelectItem value="vendor">Vendor</SelectItem></SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-xs text-stone-700"><input type="checkbox" checked={filters.overdue} onChange={(e) => setFilters({ ...filters, overdue: e.target.checked })} /> Overdue only</label>
      </div>

      {/* Table */}
      <div className="mt-4 rounded-2xl bg-white border border-stone-200 overflow-x-auto">
        <Table>
          <TableHeader><TableRow className="bg-stone-50">
            <TableHead>ID</TableHead><TableHead>Complainant</TableHead><TableHead>Subject</TableHead>
            <TableHead>Category</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead>
            <TableHead>Created</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {items.map((g) => (
              <TableRow key={g.id} className="hover:bg-emerald-50/40 cursor-pointer" onClick={() => window.location.assign(`/admin/grievances/${g.id}`)}>
                <TableCell className="font-mono text-xs">{g.grievance_number}
                  {g.is_overdue && <Badge className="ml-2 bg-red-100 text-red-900 hover:bg-red-100 border-0 text-[10px]"><Clock size={10} className="mr-0.5" /> Overdue</Badge>}
                  {g.admin_unread && <span className="ml-2 w-2 h-2 rounded-full bg-[#0A6E3B] inline-block" />}
                </TableCell>
                <TableCell>
                  <div className="text-sm">{g.complainant_name}</div>
                  <div className="text-[10px] text-stone-500 capitalize">{g.complainant_role}</div>
                </TableCell>
                <TableCell className="max-w-xs truncate">{g.subject}</TableCell>
                <TableCell className="text-xs">{g.category}</TableCell>
                <TableCell><Badge className={`${PRIORITY_STYLE[g.priority]} hover:opacity-100 border-0 text-[10px] capitalize`}>{g.priority}</Badge></TableCell>
                <TableCell><Badge className={`${STATUS_STYLE[g.status]} hover:opacity-100 border-0 text-[10px] capitalize`}>{g.status.replace(/_/g, ' ')}</Badge></TableCell>
                <TableCell className="text-xs text-stone-500">{new Date(g.created_at).toLocaleDateString()}</TableCell>
                <TableCell><Link to={`/admin/grievances/${g.id}`}><Button size="sm" variant="ghost"><ArrowRight size={13} /></Button></Link></TableCell>
              </TableRow>
            ))}
            {items.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-stone-500 text-sm">No grievances match your filters.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Chip({ label, value, tone }) {
  const tones = { blue: 'bg-blue-50 text-blue-900', red: 'bg-red-50 text-red-900', orange: 'bg-orange-50 text-orange-900', green: 'bg-emerald-50 text-emerald-900' };
  return <div className={`px-3 py-2 rounded-xl text-xs ${tones[tone] || 'bg-stone-100 text-stone-900'}`}><span className="opacity-70">{label}: </span><strong>{value}</strong></div>;
}

// ---------- Detail ----------
export function AdminGrievanceDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [body, setBody] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolution, setResolution] = useState({ resolution_type: 'Information provided', summary: '' });
  const [aiSummary, setAiSummary] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiDraft, setAiDraft] = useState('');
  const [draftBusy, setDraftBusy] = useState(false);

  const load = async () => { const { data } = await api.get(`/grievances/${id}`); setData(data); };
  useEffect(() => { load(); }, [id]);

  if (!data) return <div className="text-stone-500">Loading…</div>;
  const g = data.grievance;

  const sendMsg = async (e) => {
    e.preventDefault(); if (!body.trim()) return;
    await api.post(`/grievances/${id}/messages`, { body });
    setBody(''); load();
  };
  const addNote = async () => {
    if (noteBody.length < 2) return;
    await api.post(`/admin/grievances/${id}/notes`, { note: noteBody });
    setNoteBody(''); load();
  };
  const patchGrv = async (patch, reason) => {
    await api.patch(`/admin/grievances/${id}`, { ...patch, reason });
    load();
  };
  const doResolve = async () => {
    if (resolution.summary.length < 5) { toast.error('Resolution summary is required'); return; }
    if (!window.confirm('Mark this grievance as resolved?')) return;
    await api.post(`/admin/grievances/${id}/resolve`, resolution);
    setResolveOpen(false); toast.success('Resolved'); load();
  };

  const runAI = async (prompt) => {
    setAiBusy(true); setAiSummary(null);
    try {
      const { data } = await api.post('/ai/chat-simple', {
        session_id: `admin-grv-${id}`,
        message: prompt,
        context: { grievance_id: id },
        page: `/admin/grievances/${id}`,
      });
      setAiSummary(data.reply);
    } catch { toast.error('AI unavailable'); }
    finally { setAiBusy(false); }
  };

  const draftResponse = async () => {
    setDraftBusy(true); setAiDraft('');
    try {
      const { data } = await api.post('/ai/chat-simple', {
        session_id: `admin-grv-${id}-draft`,
        message: 'Draft a polite, professional admin response to this grievance based on the case data. Keep it 3-4 sentences. Do not promise any refund. Ask for any missing info if unclear.',
        context: { grievance_id: id },
        page: `/admin/grievances/${id}`,
      });
      setAiDraft(data.reply);
    } catch { toast.error('AI unavailable'); }
    finally { setDraftBusy(false); }
  };

  return (
    <div>
      <Link to="/admin/grievances" className="text-sm text-stone-500 hover:text-[#0A6E3B] inline-flex items-center gap-1"><ChevronLeft size={14} /> All grievances</Link>

      <div className="mt-4 grid lg:grid-cols-3 gap-6">
        {/* Main */}
        <div className="lg:col-span-2 space-y-4">
          {/* Header */}
          <div className="rounded-2xl bg-white border border-stone-200 p-5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-stone-500">{g.grievance_number}</span>
              <Badge className={`${STATUS_STYLE[g.status]} hover:opacity-100 border-0 text-[10px] capitalize`}>{g.status.replace(/_/g, ' ')}</Badge>
              <Badge className={`${PRIORITY_STYLE[g.priority]} hover:opacity-100 border-0 text-[10px] capitalize`}>{g.priority}</Badge>
              <Badge variant="outline" className="text-[10px]">{g.category}</Badge>
            </div>
            <h1 className="font-display text-2xl font-semibold text-stone-900 mt-2">{g.subject}</h1>
            <p className="text-stone-700 text-sm mt-2 whitespace-pre-wrap">{g.description}</p>
            <div className="mt-4 text-xs text-stone-500 flex flex-wrap gap-x-4 gap-y-1">
              <span>By: {g.complainant_name} ({g.complainant_role})</span>
              <span>Filed: {new Date(g.created_at).toLocaleString()}</span>
              <span>Response due: {new Date(g.response_due_at).toLocaleString()}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="rounded-2xl bg-white border border-stone-200 p-4 flex flex-wrap gap-2 items-center">
            <Select value={g.status} onValueChange={(v) => patchGrv({ status: v }, `Admin changed status to ${v}`)}>
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={g.priority} onValueChange={(v) => patchGrv({ priority: v }, `Admin priority: ${v}`)}>
              <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{PRIORITIES.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => patchGrv({ status: 'escalated' }, 'Escalated by admin')}>
              <AlertTriangle size={12} className="mr-1" /> Escalate
            </Button>
            <Button size="sm" variant="outline" onClick={() => patchGrv({ status: 'waiting_for_user' }, 'Requesting more info from user')}>
              Request info
            </Button>
            <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
              <DialogTrigger asChild><Button size="sm" className="bg-[#0A6E3B] hover:bg-[#075030] text-white rounded-full"><ShieldCheck size={12} className="mr-1" /> Resolve</Button></DialogTrigger>
              <DialogContent className="bg-white">
                <DialogHeader><DialogTitle>Resolve grievance</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label className="text-xs">Resolution type</Label>
                    <Select value={resolution.resolution_type} onValueChange={(v) => setResolution({ ...resolution, resolution_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['Information provided', 'Seller contacted', 'Consumer contacted', 'Listing corrected',
                          'Price corrected', 'Product removed', 'Review moderated', 'Account warning',
                          'Account restricted', 'Seller suspended', 'Technical issue fixed',
                          'No violation found', 'Duplicate grievance', 'Other'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Summary (visible to user)</Label>
                    <Textarea value={resolution.summary} onChange={(e) => setResolution({ ...resolution, summary: e.target.value })} rows={4} required minLength={5} />
                  </div>
                </div>
                <DialogFooter><Button onClick={doResolve} className="bg-[#0A6E3B] hover:bg-[#075030] text-white rounded-full">Confirm resolve</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Conversation */}
          <div className="rounded-2xl bg-white border border-stone-200">
            <div className="p-4 border-b border-stone-100 flex items-center gap-2 text-sm font-semibold text-stone-900"><MessageSquare size={14} /> Conversation</div>
            <div className="p-4 space-y-3 max-h-[350px] overflow-y-auto bg-stone-50/40">
              {data.messages.map((m) => (
                <div key={m.id} className={`flex ${m.sender_role === 'admin' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${m.sender_role === 'admin' ? 'bg-[#0A6E3B] text-white rounded-br-sm' : 'bg-white border border-stone-200 rounded-bl-sm'}`}>
                    <div className={`text-[10px] mb-0.5 ${m.sender_role === 'admin' ? 'text-emerald-100' : 'text-stone-500'} capitalize`}>{m.sender_role} · {new Date(m.created_at).toLocaleString()}</div>
                    {m.message}
                  </div>
                </div>
              ))}
              {data.messages.length === 0 && <div className="text-center text-stone-400 text-sm py-6">No messages yet.</div>}
            </div>
            <form onSubmit={sendMsg} className="p-3 border-t border-stone-100 flex gap-2 items-end">
              <div className="flex-1">
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Reply to complainant…" rows={2} className="text-sm" />
                {aiDraft && <div className="mt-1 flex items-center gap-2 text-[10px]"><Sparkles size={10} className="text-emerald-600" /><button type="button" onClick={() => setBody(aiDraft)} className="text-emerald-700 hover:underline">Use AI draft</button></div>}
              </div>
              <Button type="submit" disabled={!body.trim()} size="icon" className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white"><Send size={14} /></Button>
            </form>
          </div>

          {/* Internal notes */}
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4">
            <div className="text-sm font-semibold text-amber-900 flex items-center gap-1.5"><StickyNote size={13} /> Internal notes <span className="text-[10px] font-normal">(admin only)</span></div>
            <div className="mt-2 space-y-2">
              {data.internal_notes?.map((n) => (
                <div key={n.id} className="rounded-lg bg-white border border-amber-200 p-2 text-xs">
                  <div className="text-amber-900 whitespace-pre-wrap">{n.note}</div>
                  <div className="text-[10px] text-stone-500 mt-1">{n.admin_name} · {new Date(n.created_at).toLocaleString()}</div>
                </div>
              ))}
              {!data.internal_notes?.length && <div className="text-xs text-amber-800/70 italic">No notes yet.</div>}
            </div>
            <div className="mt-3 flex gap-2">
              <Textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Add internal note…" rows={2} className="text-sm bg-white" />
              <Button size="sm" onClick={addNote} className="bg-amber-500 hover:bg-amber-600 text-white shrink-0">Add</Button>
            </div>
          </div>

          {/* Evidence + Timeline */}
          {data.evidence?.length > 0 && (
            <div className="rounded-2xl bg-white border border-stone-200 p-5">
              <div className="text-sm font-semibold text-stone-900 mb-3">Evidence</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {data.evidence.map((e) => (
                  <div key={e.id} className="rounded-lg border border-stone-200 bg-stone-50 p-2 text-xs">
                    <div className="truncate font-medium text-stone-700">{e.original_filename}</div>
                    <div className="text-stone-500 mt-0.5">{Math.round((e.size || 0) / 1024)} KB</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl bg-white border border-stone-200 p-5">
            <div className="text-sm font-semibold text-stone-900 mb-3">Timeline</div>
            <ol className="space-y-2">
              {data.history.map((h) => (
                <li key={h.id} className="flex items-start gap-3 text-xs">
                  <div className="w-2 h-2 rounded-full bg-[#0A6E3B] mt-1.5 shrink-0" />
                  <div>
                    <div className="text-stone-800">
                      {h.old_status ? <><span className="capitalize">{h.old_status.replace(/_/g, ' ')}</span> → </> : ''}
                      <strong className="capitalize">{h.new_status.replace(/_/g, ' ')}</strong>
                    </div>
                    {h.reason && <div className="text-stone-500">{h.reason}</div>}
                    <div className="text-stone-400">{new Date(h.created_at).toLocaleString()}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* AI Case Copilot */}
        <aside className="rounded-2xl bg-gradient-to-br from-emerald-50 via-white to-amber-50 border border-emerald-200 p-5 h-fit lg:sticky lg:top-6">
          <div className="flex items-center gap-2"><Sparkles size={16} className="text-[#0A6E3B]" /><div className="font-display font-semibold text-stone-900">AI Case Copilot</div></div>
          <p className="text-xs text-stone-600 mt-1">AI SUGGESTION — ADMIN DECISION REQUIRED</p>
          <div className="mt-4 space-y-2">
            <Button size="sm" variant="outline" onClick={() => runAI('Provide a concise case summary based on the grievance, evidence and message history. Distinguish [VERIFIED DATA] vs [USER CLAIM] vs [AI INTERPRETATION].')} disabled={aiBusy} className="w-full text-xs justify-start"><Sparkles size={12} className="mr-1.5" /> Summarize case</Button>
            <Button size="sm" variant="outline" onClick={() => runAI('Recommend concrete next investigation steps for this grievance. List 3-5 actions.')} disabled={aiBusy} className="w-full text-xs justify-start">Suggest next steps</Button>
            <Button size="sm" variant="outline" onClick={() => runAI('What information is missing to reliably investigate this case? What should we ask the complainant?')} disabled={aiBusy} className="w-full text-xs justify-start">Find missing info</Button>
            <Button size="sm" variant="outline" onClick={draftResponse} disabled={draftBusy} className="w-full text-xs justify-start">
              {draftBusy ? <><Loader2 size={12} className="mr-1 animate-spin" /> Drafting…</> : 'Draft response'}
            </Button>
          </div>
          {(aiBusy || aiSummary) && (
            <div className="mt-4 rounded-xl bg-white border border-emerald-200 p-3 text-xs text-stone-800 whitespace-pre-wrap max-h-80 overflow-y-auto">
              {aiBusy ? <div className="inline-flex items-center gap-2 text-stone-500"><Loader2 size={12} className="animate-spin" /> Thinking…</div> : aiSummary}
            </div>
          )}
          {aiDraft && (
            <div className="mt-4 rounded-xl bg-white border border-emerald-200 p-3 text-xs text-stone-800">
              <div className="font-semibold text-emerald-900 mb-1">AI-drafted response</div>
              <div className="whitespace-pre-wrap">{aiDraft}</div>
              <button onClick={() => setBody(aiDraft)} className="mt-2 text-emerald-700 hover:underline">Use in reply →</button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ---------- Knowledge Base ----------
export function AdminKnowledge() {
  const [docs, setDocs] = useState([]);
  const [editing, setEditing] = useState(null);
  const load = async () => { const { data } = await api.get('/admin/knowledge'); setDocs(data); };
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    if (editing.id) {
      await api.patch(`/admin/knowledge/${editing.id}`, editing);
    } else {
      await api.post('/admin/knowledge', editing);
    }
    setEditing(null); load(); toast.success('Saved');
  };
  const del = async (id) => {
    if (!window.confirm('Delete this article?')) return;
    await api.delete(`/admin/knowledge/${id}`); load();
  };

  return (
    <div>
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-stone-900">AI Knowledge Base</h1>
          <p className="text-stone-600 text-sm mt-1">Articles the AI Assistant uses to answer role-specific questions.</p>
        </div>
        <Button onClick={() => setEditing({ title: '', category: 'General', content: '', status: 'published' })} className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white">Add article</Button>
      </div>

      <div className="mt-6 grid md:grid-cols-2 gap-4">
        {docs.map((d) => (
          <div key={d.id} className="rounded-2xl bg-white border border-stone-200 p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-stone-500">{d.category}</div>
                <div className="font-display text-lg font-semibold text-stone-900 mt-1">{d.title}</div>
              </div>
              <Badge className={d.status === 'published' ? 'bg-emerald-100 text-emerald-900 hover:bg-emerald-100 border-0 text-[10px]' : 'bg-stone-100 text-stone-700 hover:bg-stone-100 border-0 text-[10px]'}>{d.status}</Badge>
            </div>
            <div className="text-xs text-stone-600 mt-2 line-clamp-3">{d.content}</div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing(d)}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => del(d.id)} className="text-red-600">Delete</Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="bg-white max-w-lg">
          <DialogHeader><DialogTitle>{editing?.id ? 'Edit' : 'New'} article</DialogTitle></DialogHeader>
          {editing && (
            <form onSubmit={save} className="space-y-3">
              <div><Label className="text-xs">Title</Label><Input required value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></div>
              <div><Label className="text-xs">Category</Label><Input value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} /></div>
              <div><Label className="text-xs">Content</Label><Textarea required rows={8} value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} /></div>
              <div><Label className="text-xs">Status</Label>
                <Select value={editing.status} onValueChange={(v) => setEditing({ ...editing, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="published">Published</SelectItem><SelectItem value="draft">Draft</SelectItem></SelectContent>
                </Select>
              </div>
              <DialogFooter><Button type="submit" className="bg-[#0A6E3B] hover:bg-[#075030] text-white rounded-full">Save</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
