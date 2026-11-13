import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, formatApiErrorDetail } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ShieldCheck, Lock, Sparkles, ArrowRight } from 'lucide-react';

export default function AdminLogin() {
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user && user.role === 'admin') {
      navigate('/admin', { replace: true });
    }
  }, [user, navigate]);

  const performAdminLogin = async (loginEmail, loginPassword) => {
    setBusy(true);
    try {
      const { data } = await api.post('/auth/login?role=admin', {
        email: loginEmail.trim(),
        password: loginPassword,
      });
      localStorage.setItem('lp_token', data.token);
      setUser(data.user);
      toast.success('Welcome back, Super Admin');
      navigate('/admin');
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || 'Invalid admin credentials');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    await performAdminLogin(email, password);
  };

  const handleQuickAdminLogin = async (demoEmail, demoPassword) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    await performAdminLogin(demoEmail, demoPassword);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-stone-900 grid place-items-center px-4 py-12 relative overflow-hidden">
      {/* backdrop pattern */}
      <div className="absolute inset-0 opacity-[0.08]" style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
        backgroundSize: '18px 18px',
      }} />
      <div className="relative w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-emerald-600 grid place-items-center mx-auto shadow-lg shadow-emerald-500/30">
            <ShieldCheck size={26} className="text-white" />
          </div>
          <h1 className="font-display text-3xl font-semibold text-white mt-4">Super Admin Console</h1>
          <p className="text-stone-400 text-sm mt-1">Restricted access. Authorised staff only.</p>
        </div>
        <form onSubmit={submit} className="rounded-2xl bg-stone-800 border border-stone-700 p-6 space-y-4 shadow-xl">
          <div>
            <Label className="text-xs uppercase tracking-widest text-stone-400">Admin Email</Label>
            <Input data-testid="admin-email" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 bg-stone-900 border-stone-700 text-white placeholder:text-stone-500" placeholder="dgstartup2026@gmail.com" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-widest text-stone-400">Password</Label>
            <Input data-testid="admin-password" required type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 bg-stone-900 border-stone-700 text-white" placeholder="••••••••••••" />
          </div>
          <Button data-testid="admin-submit" disabled={busy} type="submit" className="w-full rounded-full bg-emerald-600 hover:bg-emerald-500 text-white h-11 font-medium">
            <Lock size={14} className="mr-2" /> {busy ? 'Verifying…' : 'Sign in to Admin Console'}
          </Button>

          {/* 1-Click Super Admin Access */}
          <div className="pt-4 border-t border-stone-700 space-y-2.5">
            <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
              <Sparkles size={13} /> 1-Click Super Admin Access:
            </div>
            <button
              type="button"
              data-testid="admin-one-click-primary"
              disabled={busy}
              onClick={() => handleQuickAdminLogin('dgstartup2026@gmail.com', 'Dgadmin@startup2026')}
              className="w-full p-3 text-left rounded-xl border border-emerald-500/40 bg-emerald-950/50 hover:bg-emerald-900/60 transition-all flex items-center justify-between group"
            >
              <div>
                <div className="text-xs font-semibold text-white">🛡️ Primary Super Admin (Dhhruv Gupta)</div>
                <div className="text-[11px] text-emerald-300 font-mono mt-0.5">dgstartup2026@gmail.com · Dgadmin@startup2026</div>
              </div>
              <ArrowRight size={15} className="text-emerald-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
            </button>
            <button
              type="button"
              data-testid="admin-one-click-demo"
              disabled={busy}
              onClick={() => handleQuickAdminLogin('admin@localprice.in', 'Admin@1234')}
              className="w-full p-2.5 text-left rounded-xl border border-stone-700 bg-stone-900/70 hover:bg-stone-900 transition-all flex items-center justify-between group"
            >
              <div>
                <div className="text-xs font-medium text-stone-200">⚡ Demo Super Admin</div>
                <div className="text-[11px] text-stone-400 font-mono mt-0.5">admin@localprice.in · Admin@1234</div>
              </div>
              <ArrowRight size={14} className="text-stone-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
            </button>
          </div>

          <div className="flex items-center justify-between text-[11px] text-stone-400 pt-2">
            <span>All admin actions are logged.</span>
            <Link to="/" className="text-emerald-400 hover:underline">← Back to Storefront</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
