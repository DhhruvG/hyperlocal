import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Send, CheckCircle2, ChevronLeft } from 'lucide-react';

export function MessagesInbox() {
  const { user } = useAuth();
  const [threads, setThreads] = useState([]);
  useEffect(() => { if (user) api.get('/messages/threads').then(r => setThreads(r.data)); }, [user]);

  if (!user) return (
    <div className="max-w-2xl mx-auto px-5 md:px-8 py-14 text-center pb-24 md:pb-10">
      <div className="w-16 h-16 rounded-full bg-emerald-50 grid place-items-center mx-auto text-[#0A6E3B]"><MessageSquare size={22} /></div>
      <h1 className="font-display text-2xl font-semibold text-stone-900 mt-4">Messages</h1>
      <p className="text-stone-600 text-sm mt-2">Chat with sellers and buyers.</p>
      <Link to="/auth/consumer"><Button className="mt-5 rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white">Sign in</Button></Link>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-5 md:px-8 py-8 pb-24 md:pb-10">
      <h1 className="font-display text-3xl font-semibold text-stone-900">Messages</h1>
      <div className="mt-6 rounded-2xl border border-stone-200 bg-white divide-y divide-stone-100 overflow-hidden">
        {threads.map((t) => (
          <Link key={t.thread_id} to={`/messages/${t.other_id}`} className="flex items-center gap-3 p-4 hover:bg-stone-50 transition-colors">
            <div className="w-10 h-10 rounded-full bg-emerald-50 grid place-items-center text-[#0A6E3B] font-semibold">
              {(t.other_name || '?').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-stone-900 flex items-center gap-1.5 truncate">
                {t.other_name} {t.other_verified && <CheckCircle2 size={12} className="text-emerald-600" />}
              </div>
              <div className="text-sm text-stone-500 truncate">{t.last_body}</div>
            </div>
            <div className="text-[10px] text-stone-400 shrink-0">{new Date(t.last_at).toLocaleDateString()}</div>
            {t.unread && <div className="w-2 h-2 rounded-full bg-[#0A6E3B]" />}
          </Link>
        ))}
        {threads.length === 0 && <div className="p-10 text-center text-stone-500 text-sm">No conversations yet.</div>}
      </div>
    </div>
  );
}

export function MessagesThread() {
  const { user } = useAuth();
  const { otherId } = useParams();
  const [params] = useSearchParams();
  const [thread, setThread] = useState({ messages: [], other: null });
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  const load = async () => {
    const { data } = await api.get(`/messages/thread/${otherId}`);
    setThread(data);
    setTimeout(() => { scrollRef.current && scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight }); }, 50);
  };
  useEffect(() => { if (user) load(); /* eslint-disable-next-line */ }, [otherId, user]);

  useEffect(() => {
    if (!user || !otherId) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [otherId, user]);

  const send = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      await api.post('/messages/send', { to_user_id: otherId, body, product_id: params.get('product') || null });
      setBody('');
      load();
    } finally { setSending(false); }
  };

  if (!user) return <div className="p-10 text-center text-stone-500">Sign in to chat.</div>;

  return (
    <div className="max-w-3xl mx-auto px-5 md:px-8 py-6 flex flex-col pb-24 md:pb-10" style={{ height: 'calc(100vh - 4rem)' }}>
      <Link to="/messages" className="text-sm text-stone-500 hover:text-[#0A6E3B] inline-flex items-center gap-1 mb-3"><ChevronLeft size={14} /> Inbox</Link>
      <div className="rounded-t-2xl border border-b-0 border-stone-200 bg-white px-5 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-emerald-50 grid place-items-center text-[#0A6E3B] font-semibold">
          {(thread.other?.name || '?').charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="font-medium text-stone-900 flex items-center gap-1.5">{thread.other?.name} {thread.other?.verified && <CheckCircle2 size={12} className="text-emerald-600" />}</div>
          <div className="text-xs text-stone-500 capitalize">{thread.other?.role}</div>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 border-x border-stone-200 bg-stone-50 overflow-y-auto p-4 space-y-2">
        {thread.messages.map((m) => (
          <div key={m.id} className={`flex ${m.from_user_id === user.id ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${m.from_user_id === user.id ? 'bg-[#0A6E3B] text-white rounded-br-sm' : 'bg-white text-stone-900 rounded-bl-sm border border-stone-200'}`}>
              {m.body}
              <div className={`text-[10px] mt-1 ${m.from_user_id === user.id ? 'text-emerald-100' : 'text-stone-400'}`}>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          </div>
        ))}
        {thread.messages.length === 0 && <div className="text-center text-stone-400 text-sm py-8">Say hello 👋</div>}
      </div>
      <form onSubmit={send} className="flex gap-2 border-x border-b border-stone-200 rounded-b-2xl bg-white p-3">
        <Input data-testid="chat-input" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type a message…" className="flex-1" />
        <Button data-testid="chat-send" type="submit" disabled={sending} className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white"><Send size={14} /></Button>
      </form>
    </div>
  );
}
