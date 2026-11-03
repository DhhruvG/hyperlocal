import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom';
import { VENDOR_AUTH } from '@/constants/testIds';
import { useAuth } from '@/lib/auth';
import { formatApiErrorDetail } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Store, MapPin, Sparkles, AlertCircle, ArrowRight } from 'lucide-react';

export default function VendorAuth() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { loginVendor, registerVendor, user } = useAuth();
  const [tab, setTab] = useState(params.get('mode') === 'signup' ? 'signup' : 'login');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', shop_name: '', shop_address: '', vendor_type: 'retailer' });

  useEffect(() => {
    if (user && user.role === 'vendor') navigate('/vendor/dashboard');
  }, [user, navigate]);

  const location = useLocation();

  const handleDemoLogin = async (demoEmail, demoPassword, shopName) => {
    setForm(f => ({ ...f, email: demoEmail, password: demoPassword }));
    setLoading(true);
    try {
      await loginVendor(demoEmail, demoPassword);
      toast.success(`Welcome to ${shopName}!`);
      navigate('/vendor/dashboard');
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target ? e.target.value : e });

  const submitLogin = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      await loginVendor(form.email, form.password);
      toast.success('Welcome back!');
      navigate('/vendor/dashboard');
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setLoading(false); }
  };

  const submitSignup = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      await registerVendor({
        name: form.name, email: form.email, password: form.password, phone: form.phone,
        shop_name: form.shop_name, shop_address: form.shop_address, vendor_type: form.vendor_type,
      });
      toast.success('Your 30-day free trial has started!');
      navigate('/vendor/dashboard');
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-5xl mx-auto px-5 md:px-8 py-14 grid md:grid-cols-5 gap-8">
      <div className="md:col-span-2">
        <span className="chip chip-amber"><Store size={12} /> Vendor account</span>
        <h1 className="font-display text-4xl font-semibold text-stone-900 mt-4 leading-tight">Reach more shoppers in your gully.</h1>
        <p className="mt-4 text-stone-600 text-sm leading-relaxed">Whether you run a kirana, general store, or a cart — list your products, set daily prices, and get discovered. 30 days on us, no card needed.</p>
        <ul className="mt-6 space-y-2 text-sm text-stone-700">
          <li>• Unlimited products during trial</li>
          <li>• Toggle availability per item</li>
          <li>• Upgrade later for analytics, featured & multi-branch</li>
        </ul>
        <div className="mt-6 text-xs text-stone-500 flex items-center gap-1.5"><MapPin size={12} /> Onboarding vendors in Dehradun</div>
        <div className="mt-8 text-sm text-stone-600">Just here to shop? <Link to="/auth/consumer" className="text-[#0A6E3B] font-medium hover:underline">Shopper login →</Link></div>
        <div className="mt-3 text-xs text-stone-500">Platform administrator? <Link to="/admin/login" className="text-emerald-700 font-medium hover:underline">Admin console →</Link></div>
      </div>

      <div className="md:col-span-3">
        {user && user.role !== 'vendor' && (
          <div className="mb-4 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start gap-2.5 shadow-sm">
            <AlertCircle size={16} className="text-amber-700 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-amber-950">Active Session Mismatch</div>
              <div>You are currently signed in as <strong>{user.email}</strong> ({user.role}). Sign in with a vendor account below to open the Vendor Panel.</div>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-stone-200 bg-white p-6 md:p-8 shadow-sm">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="login" data-testid={VENDOR_AUTH.tabLogin}>Log in</TabsTrigger>
              <TabsTrigger value="signup" data-testid={VENDOR_AUTH.tabSignup}>Sign up</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={submitLogin} className="space-y-4 mt-6">
                <Field label="Email"><Input data-testid={VENDOR_AUTH.emailInput} type="text" placeholder="vendor@hyperlocal.com" required value={form.email} onChange={set('email')} /></Field>
                <Field label="Password"><Input data-testid={VENDOR_AUTH.passwordInput} type="password" required value={form.password} onChange={set('password')} /></Field>
                <Button data-testid={VENDOR_AUTH.submitLogin} disabled={loading} type="submit" className="w-full rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white font-medium">{loading ? 'Signing in…' : 'Log in'}</Button>
              </form>

              {/* 1-Click Demo Vendor Login */}
              <div className="mt-6 pt-5 border-t border-stone-100">
                <div className="text-xs font-semibold text-stone-700 flex items-center gap-1.5 mb-2.5">
                  <Sparkles size={14} className="text-amber-600" />
                  Instant Demo Access (1-Click Login):
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleDemoLogin('vendor@hyperlocal.com', 'demo1234', 'Gupta Dairy Bhandar')}
                    className="p-3 text-left rounded-xl border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-100/60 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-emerald-950">🏪 Retailer Demo</span>
                      <ArrowRight size={13} className="text-emerald-700 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <div className="text-[11px] text-emerald-800 font-medium mt-0.5">Gupta Dairy Bhandar</div>
                    <div className="text-[10px] text-emerald-600 mt-1 font-mono">vendor@hyperlocal.com</div>
                  </button>

                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleDemoLogin('cart.vendor@hyperlocal.com', 'demo1234', 'Munna Vegetable Cart')}
                    className="p-3 text-left rounded-xl border border-amber-200 bg-amber-50/60 hover:bg-amber-100/60 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-amber-950">🛒 Street Cart Demo</span>
                      <ArrowRight size={13} className="text-amber-700 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <div className="text-[11px] text-amber-800 font-medium mt-0.5">Munna Vegetable Cart</div>
                    <div className="text-[10px] text-amber-600 mt-1 font-mono">cart.vendor@hyperlocal.com</div>
                  </button>
                </div>
                <div className="text-[10px] text-stone-400 mt-2 text-center">Default Demo Password: <code className="bg-stone-100 px-1 py-0.5 rounded text-stone-700">demo1234</code></div>
              </div>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={submitSignup} className="space-y-4 mt-6">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Your name"><Input data-testid={VENDOR_AUTH.nameInput} required value={form.name} onChange={set('name')} /></Field>
                  <Field label="Phone">
                    <Input data-testid={VENDOR_AUTH.phoneInput} required value={form.phone} onChange={set('phone')} />
                  </Field>
                </div>
                <Field label="Email"><Input data-testid={VENDOR_AUTH.emailInput} type="email" required value={form.email} onChange={set('email')} /></Field>
                <Field label="Password (min 6)"><Input data-testid={VENDOR_AUTH.passwordInput} type="password" required minLength={6} value={form.password} onChange={set('password')} /></Field>
                <Field label="Shop / cart name"><Input data-testid={VENDOR_AUTH.shopNameInput} required value={form.shop_name} onChange={set('shop_name')} /></Field>
                <Field label="Address / area in Dehradun"><Input data-testid={VENDOR_AUTH.shopAddressInput} required value={form.shop_address} onChange={set('shop_address')} placeholder="e.g., Rajpur Road, near clock tower" /></Field>
                <Field label="Vendor type">
                  <Select value={form.vendor_type} onValueChange={(v) => setForm({ ...form, vendor_type: v })}>
                    <SelectTrigger data-testid={VENDOR_AUTH.vendorTypeSelect}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="retailer">Retailer / Shop</SelectItem>
                      <SelectItem value="cart_vendor">Cart Vendor</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Button data-testid={VENDOR_AUTH.submitSignup} disabled={loading} type="submit" className="w-full rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white">{loading ? 'Creating…' : 'Start 30-day free trial'}</Button>
                <div className="text-[11px] text-stone-500 text-center">No card required. Cancel anytime.</div>
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
