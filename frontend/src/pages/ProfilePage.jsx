import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, formatApiErrorDetail } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { User, Store, LogOut, Rocket, CheckCircle2, MapPin, LifeBuoy } from 'lucide-react';

export default function ProfilePage() {
  const { user, logout, refresh } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    shop_name: user?.shop_name || '',
    shop_address: user?.shop_address || '',
    phone: user?.phone || '',
    opening_hours: user?.opening_hours || '',
    is_online: user?.is_online || false,
  });
  const [saving, setSaving] = useState(false);

  if (!user) return (
    <div className="max-w-2xl mx-auto px-5 md:px-8 py-14 text-center pb-24 md:pb-10">
      <div className="w-16 h-16 rounded-full bg-emerald-50 grid place-items-center mx-auto text-[#0A6E3B]"><User size={22} /></div>
      <h1 className="font-display text-2xl font-semibold text-stone-900 mt-4">Sign in</h1>
      <p className="text-stone-600 text-sm mt-2">Access your profile, saved items, and requests.</p>
      <div className="mt-5 flex gap-2 justify-center">
        <Link to="/auth/consumer"><Button variant="outline" className="rounded-full">Shopper</Button></Link>
        <Link to="/auth/vendor"><Button className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white">Vendor</Button></Link>
      </div>
    </div>
  );

  const isVendor = user.role === 'vendor';

  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await api.patch('/vendor/profile', form);
      toast.success('Profile updated');
      refresh();
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-3xl mx-auto px-5 md:px-8 py-8 pb-24 md:pb-10">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-emerald-50 grid place-items-center text-[#0A6E3B] text-2xl font-semibold">
          {(user.name || '?').charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-stone-900">{user.name}</h1>
          <div className="text-sm text-stone-500">{user.email}</div>
          <div className="mt-1 flex items-center gap-1.5">
            {isVendor ? <Badge variant="outline" className="border-stone-300 text-xs"><Store size={11} className="mr-1" /> Vendor</Badge> : <Badge variant="outline" className="border-stone-300 text-xs">Shopper</Badge>}
            {isVendor && user.is_verified && <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white border-0 text-xs"><CheckCircle2 size={10} className="mr-1" /> Verified</Badge>}
            {isVendor && user.is_pro && <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 border-0 text-xs">Pro</Badge>}
          </div>
        </div>
      </div>

      {isVendor && (
        <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-6">
          <h2 className="font-display text-lg font-semibold text-stone-900">Shop profile</h2>
          <form onSubmit={save} className="mt-4 grid md:grid-cols-2 gap-4">
            <div><Label className="text-xs uppercase tracking-widest text-stone-500">Shop name</Label><Input value={form.shop_name} onChange={(e) => setForm({ ...form, shop_name: e.target.value })} /></div>
            <div><Label className="text-xs uppercase tracking-widest text-stone-500">Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="md:col-span-2"><Label className="text-xs uppercase tracking-widest text-stone-500">Address</Label><Input value={form.shop_address} onChange={(e) => setForm({ ...form, shop_address: e.target.value })} /></div>
            <div><Label className="text-xs uppercase tracking-widest text-stone-500">Opening hours</Label><Input value={form.opening_hours} onChange={(e) => setForm({ ...form, opening_hours: e.target.value })} placeholder="8:00 AM - 9:00 PM" /></div>
            {user.vendor_type === 'cart_vendor' && (
              <div className="flex items-end justify-between rounded-xl bg-amber-50 border border-amber-200 p-3">
                <div><Label className="text-xs uppercase tracking-widest text-stone-500">I'm online now</Label><div className="text-xs text-stone-600 mt-0.5">Show shoppers your cart is active</div></div>
                <Switch checked={form.is_online} onCheckedChange={(v) => setForm({ ...form, is_online: v })} />
              </div>
            )}
            <div className="md:col-span-2 flex justify-end gap-2">
              <Button type="submit" disabled={saving} className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white">{saving ? 'Saving…' : 'Save profile'}</Button>
            </div>
          </form>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-stone-900">Location</h2>
        <div className="mt-2 text-sm text-stone-600 flex items-center gap-1.5"><MapPin size={14} /> Dehradun{user.lat ? ` · ${user.lat.toFixed(3)}, ${user.lng.toFixed(3)}` : ''}</div>
      </div>

      <div className="mt-6 grid md:grid-cols-2 gap-3">
        <Link to="/grievances"><Button variant="outline" className="w-full rounded-full h-11"><LifeBuoy size={15} className="mr-1.5" /> Help & Grievances</Button></Link>
        {user.role === 'admin' && (
          <Link to="/admin"><Button className="w-full rounded-full h-11 bg-emerald-700 hover:bg-emerald-800 text-white font-medium"><Store size={15} className="mr-1.5" /> Open Admin Console</Button></Link>
        )}
        {isVendor && !user.is_pro && (
          <Link to="/vendor/pricing"><Button variant="outline" className="w-full rounded-full h-11"><Rocket size={15} className="mr-1.5" /> Upgrade to Pro</Button></Link>
        )}
        <Button variant="outline" onClick={async () => { await logout(); navigate('/'); }} className="w-full rounded-full h-11 text-red-700 border-red-200 hover:bg-red-50 hover:text-red-800">
          <LogOut size={15} className="mr-1.5" /> Log out
        </Button>
      </div>
    </div>
  );
}
