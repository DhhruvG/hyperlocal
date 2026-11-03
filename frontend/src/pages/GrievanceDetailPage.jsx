import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatApiErrorDetail, API_BASE } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ChevronLeft, Send, Paperclip, RefreshCw, Star, ThumbsUp, ThumbsDown } from 'lucide-react';

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

export default function GrievanceDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenOpen, setReopenOpen] = useState(false);
  const fileRef = useRef(null);
  const bottomRef = useRef(null);

  const load = async () => {
    const { data } = await api.get(`/grievances/${id}`);
    setData(data);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [id]);

  if (!data) return <div className="p-10 text-center text-stone-500">Loading…</div>;
  const g = data.grievance;

  const send = async (e) => {
    e.preventDefault(); if (!body.trim() || sending) return;
    setSending(true);
    try {
      await api.post(`/grievances/${id}/messages`, { body });
      setBody(''); load();
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
    finally { setSending(false); }
  };

  const upload = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast.error('Max 5MB'); return; }
    const form = new FormData(); form.append('file', f);
    setUploading(true);
    try {
      await api.post(`/grievances/${id}/evidence`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Evidence uploaded');
      load();
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const reopen = async () => {
    if (reopenReason.length < 5) { toast.error('Please explain the reason'); return; }
    await api.post(`/grievances/${id}/reopen`, { reason: reopenReason });
    setReopenReason(''); setReopenOpen(false); toast.success('Grievance reopened'); load();
  };

  const submitFeedback = async (satisfied) => {
    await api.post(`/grievances/${id}/feedback`, { satisfied });
    toast.success('Thanks for your feedback!'); load();
  };

  const canReopen = ['resolved', 'closed'].includes(g.status) && g.complainant_user_id === user?.id;

  return (
    <div className="max-w-4xl mx-auto px-5 md:px-8 py-6 pb-24 md:pb-10">
      <Link to="/grievances" className="text-sm text-stone-500 hover:text-[#0A6E3B] inline-flex items-center gap-1"><ChevronLeft size={14} /> My grievances</Link>

      <div className="mt-4 rounded-2xl bg-white border border-stone-200 p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-stone-500">{g.grievance_number}</span>
              <Badge className={`${STATUS_STYLE[g.status] || 'bg-stone-100'} hover:opacity-100 border-0 text-[10px] capitalize`}>{g.status.replace(/_/g, ' ')}</Badge>
              <Badge variant="outline" className="text-[10px] capitalize border-stone-300">{g.priority}</Badge>
              <Badge variant="outline" className="text-[10px] border-stone-300">{g.category}</Badge>
            </div>
            <h1 className="font-display text-2xl font-semibold text-stone-900 mt-2">{g.subject}</h1>
            <p className="text-stone-600 text-sm mt-2 whitespace-pre-wrap">{g.description}</p>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-stone-500">Filed</div>
            <div className="text-sm text-stone-700">{new Date(g.created_at).toLocaleString()}</div>
            {canReopen && (
              <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
                <DialogTrigger asChild><Button size="sm" variant="outline" className="mt-3 rounded-full"><RefreshCw size={12} className="mr-1" /> Reopen</Button></DialogTrigger>
                <DialogContent className="bg-white"><DialogHeader><DialogTitle>Reopen grievance</DialogTitle></DialogHeader>
                  <Textarea value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} placeholder="Why are you reopening?" rows={4} minLength={5} />
                  <DialogFooter><Button onClick={reopen} className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white">Reopen</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      </div>

      {/* Resolution + Feedback */}
      {data.resolution && (
        <div className="mt-4 rounded-2xl bg-emerald-50 border border-emerald-200 p-5">
          <div className="text-[10px] uppercase tracking-widest text-emerald-700">Resolution</div>
          <div className="font-semibold text-emerald-900 mt-1">{data.resolution.resolution_type}</div>
          <p className="text-sm text-emerald-800 mt-1">{data.resolution.summary}</p>
          {!data.feedback && g.status === 'resolved' && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className="text-emerald-800">Was your issue resolved?</span>
              <Button size="sm" variant="outline" onClick={() => submitFeedback(true)} className="rounded-full"><ThumbsUp size={12} /></Button>
              <Button size="sm" variant="outline" onClick={() => submitFeedback(false)} className="rounded-full"><ThumbsDown size={12} /></Button>
            </div>
          )}
          {data.feedback && (
            <div className="mt-2 text-xs text-emerald-800">You said: {data.feedback.satisfied ? '👍 Resolved' : '👎 Not resolved'}</div>
          )}
        </div>
      )}

      {/* Conversation */}
      <div className="mt-6 rounded-2xl bg-white border border-stone-200">
        <div className="p-4 border-b border-stone-100">
          <div className="text-sm font-semibold text-stone-900">Conversation with admin</div>
        </div>
        <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto bg-stone-50/40">
          {data.messages.map((m) => (
            <div key={m.id} className={`flex ${m.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${m.sender_id === user?.id ? 'bg-[#0A6E3B] text-white rounded-br-sm' : 'bg-white border border-stone-200 rounded-bl-sm'}`}>
                <div className={`text-[10px] mb-0.5 ${m.sender_id === user?.id ? 'text-emerald-100' : 'text-stone-500'} capitalize`}>{m.sender_role} · {new Date(m.created_at).toLocaleString()}</div>
                {m.message}
              </div>
            </div>
          ))}
          {data.messages.length === 0 && <div className="text-center text-stone-400 text-sm py-8">No messages yet.</div>}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={send} className="p-3 border-t border-stone-100 flex gap-2 items-center">
          <input type="file" ref={fileRef} onChange={upload} accept="image/jpeg,image/png,image/webp,application/pdf,text/plain" className="hidden" />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="p-2 text-stone-500 hover:text-[#0A6E3B]" title="Attach evidence">
            <Paperclip size={16} />
          </button>
          <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Reply to admin…" />
          <Button data-testid="grv-msg-send" type="submit" disabled={sending || !body.trim()} size="icon" className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white shrink-0"><Send size={14} /></Button>
        </form>
      </div>

      {/* Evidence */}
      {data.evidence?.length > 0 && (
        <div className="mt-6 rounded-2xl bg-white border border-stone-200 p-5">
          <div className="text-sm font-semibold text-stone-900 mb-3">Evidence</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {data.evidence.map((e) => (
              <div key={e.id} className="rounded-lg border border-stone-200 bg-stone-50 p-2 text-xs">
                <div className="truncate font-medium text-stone-700">{e.original_filename}</div>
                <div className="text-stone-500 mt-0.5">{Math.round((e.size || 0) / 1024)} KB · {e.content_type}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="mt-6 rounded-2xl bg-white border border-stone-200 p-5">
        <div className="text-sm font-semibold text-stone-900 mb-3">Status history</div>
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
  );
}
