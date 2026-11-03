import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatApiErrorDetail } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ShieldCheck, Lock } from 'lucide-react';

export default function AdminLogin() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const { data } = await api.post('/auth/login?role=admin', { email, password });
      localStorage.setItem('lp_token', data.token);
      setUser(data.user);
      toast.success('Welcome back, admin');
      navigate('/admin');
    } catch (err) {
      // never leak whether the user exists — the backend returns 404 on any mismatch
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || 'Access denied');
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-stone-900 grid place-items-center px-4 py-16 relative overflow-hidden">
      {/* backdrop pattern */}
      <div className="absolute inset-0 opacity-[0.08]" style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
        backgroundSize: '18px 18px',
      }} />
      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-emerald-600 grid place-items-center mx-auto shadow-lg shadow-emerald-500/30">
            <ShieldCheck size={26} className="text-white" />
          </div>
          <h1 className="font-display text-3xl font-semibold text-white mt-4">Admin console</h1>
          <p className="text-stone-400 text-sm mt-1">Restricted access. Authorised staff only.</p>
        </div>
        <form onSubmit={submit} className="rounded-2xl bg-stone-800 border border-stone-700 p-6 space-y-4 shadow-xl">
          <div>
            <Label className="text-xs uppercase tracking-widest text-stone-400">Email</Label>
            <Input data-testid="admin-email" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 bg-stone-900 border-stone-700 text-white placeholder:text-stone-500" placeholder="admin@localprice" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-widest text-stone-400">Password</Label>
            <Input data-testid="admin-password" required type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 bg-stone-900 border-stone-700 text-white" />
          </div>
          <Button data-testid="admin-submit" disabled={busy} type="submit" className="w-full rounded-full bg-emerald-600 hover:bg-emerald-500 text-white h-11">
            <Lock size={14} className="mr-2" /> {busy ? 'Verifying…' : 'Sign in'}
          </Button>
          <div className="text-[10px] text-stone-500 text-center pt-2">All admin actions are logged.</div>
        </form>
      </div>
    </div>
  );
}
