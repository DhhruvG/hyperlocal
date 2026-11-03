import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { CONSUMER_AUTH } from '@/constants/testIds';
import { useAuth } from '@/lib/auth';
import { formatApiErrorDetail } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { ShoppingBasket, MapPin } from 'lucide-react';

export default function ConsumerAuth() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { loginConsumer, registerConsumer, user } = useAuth();
  const [tab, setTab] = useState(params.get('mode') === 'signup' ? 'signup' : 'login');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' });

  useEffect(() => {
    if (user && user.role === 'consumer') navigate('/search');
  }, [user, navigate]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submitLogin = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      await loginConsumer(form.email, form.password);
      toast.success('Welcome back!');
      navigate('/search');
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setLoading(false); }
  };

  const submitSignup = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      await registerConsumer({ name: form.name, email: form.email, password: form.password, phone: form.phone });
      toast.success('Account created — happy shopping!');
      navigate('/search');
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-5xl mx-auto px-5 md:px-8 py-14 grid md:grid-cols-5 gap-8">
      <div className="md:col-span-2">
        <span className="chip"><ShoppingBasket size={12} /> Shopper account</span>
        <h1 className="font-display text-4xl font-semibold text-stone-900 mt-4 leading-tight">Shop smart. <br/>Save daily.</h1>
        <p className="mt-4 text-stone-600 text-sm leading-relaxed">Sign up to save your favourite shops, get quick access to today's best prices, and track daily updates from vendors in your area.</p>
        <div className="mt-6 text-xs text-stone-500 flex items-center gap-1.5"><MapPin size={12} /> Currently live in Dehradun</div>
        <div className="mt-8 text-sm text-stone-600">Are you a shop or cart vendor? <Link to="/auth/vendor" className="text-[#0A6E3B] font-medium hover:underline">List your business →</Link></div>
        <div className="mt-3 text-xs text-stone-500">Platform administrator? <Link to="/admin/login" className="text-emerald-700 font-medium hover:underline">Admin console →</Link></div>
      </div>

      <div className="md:col-span-3">
        <div className="rounded-2xl border border-stone-200 bg-white p-6 md:p-8 shadow-sm">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="login" data-testid={CONSUMER_AUTH.tabLogin}>Log in</TabsTrigger>
              <TabsTrigger value="signup" data-testid={CONSUMER_AUTH.tabSignup}>Sign up</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={submitLogin} className="space-y-4 mt-6">
                <Field label="Email"><Input data-testid={CONSUMER_AUTH.emailInput} type="email" required value={form.email} onChange={set('email')} /></Field>
                <Field label="Password"><Input data-testid={CONSUMER_AUTH.passwordInput} type="password" required value={form.password} onChange={set('password')} /></Field>
                <Button data-testid={CONSUMER_AUTH.submitLogin} disabled={loading} type="submit" className="w-full rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white">{loading ? 'Signing in…' : 'Log in'}</Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={submitSignup} className="space-y-4 mt-6">
                <Field label="Full name"><Input data-testid={CONSUMER_AUTH.nameInput} required value={form.name} onChange={set('name')} /></Field>
                <Field label="Email"><Input data-testid={CONSUMER_AUTH.emailInput} type="email" required value={form.email} onChange={set('email')} /></Field>
                <Field label="Password (min 6)"><Input data-testid={CONSUMER_AUTH.passwordInput} type="password" required minLength={6} value={form.password} onChange={set('password')} /></Field>
                <Field label="Phone (optional)"><Input data-testid={CONSUMER_AUTH.phoneInput} value={form.phone} onChange={set('phone')} /></Field>
                <Button data-testid={CONSUMER_AUTH.submitSignup} disabled={loading} type="submit" className="w-full rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white">{loading ? 'Creating…' : 'Create account'}</Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-widest text-stone-500">{label}</Label>
      {children}
    </div>
  );
}
