import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatApiErrorDetail } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Building2, Lock } from 'lucide-react';

export default function VendorBranches() {
  const { user } = useAuth();
  const [branches, setBranches] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState({ branch_name: '', address: '' });
  const [saving, setSaving] = useState(false);
  const isPro = user?.is_pro;

  const load = async () => {
    try { const { data } = await api.get('/vendor/branches'); setBranches(data); } catch {}
  };
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await api.post('/vendor/branches', form);
      toast.success('Branch added');
      setForm({ branch_name: '', address: '' }); setDialog(false); load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('Remove branch?')) return;
    await api.delete(`/vendor/branches/${id}`); load();
  };

  return (
    <div className="max-w-5xl mx-auto px-5 md:px-8 py-10">
      <div className="flex items-end justify-between">
        <div>
          <span className="chip chip-amber">Branches</span>
          <h1 className="font-display text-3xl md:text-4xl font-semibold text-stone-900 mt-3">Manage your outlets</h1>
          <p className="text-stone-600 text-sm mt-1">Add multiple branches under one account. Each branch appears independently in searches.</p>
        </div>
        {isPro ? (
          <Dialog open={dialog} onOpenChange={setDialog}>
            <DialogTrigger asChild>
              <Button className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white"><Plus size={16} className="mr-1.5" /> Add branch</Button>
            </DialogTrigger>
            <DialogContent className="bg-white">
              <DialogHeader><DialogTitle>Add a branch</DialogTitle></DialogHeader>
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-1.5"><Label className="text-xs uppercase tracking-widest text-stone-500">Branch name</Label><Input required value={form.branch_name} onChange={(e) => setForm({ ...form, branch_name: e.target.value })} /></div>
                <div className="space-y-1.5"><Label className="text-xs uppercase tracking-widest text-stone-500">Address</Label><Input required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setDialog(false)}>Cancel</Button>
                  <Button disabled={saving} type="submit" className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white">{saving ? 'Saving…' : 'Add branch'}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      {!isPro ? (
        <div className="mt-10 rounded-2xl border border-amber-300 bg-amber-50 p-10 text-center">
          <div className="w-14 h-14 rounded-full bg-white grid place-items-center mx-auto text-amber-700"><Lock size={22} /></div>
          <div className="font-display text-xl font-semibold text-stone-900 mt-4">Multi-branch is a Pro feature</div>
          <p className="text-stone-600 mt-2 max-w-md mx-auto text-sm">Upgrade to list each of your outlets separately with its own inventory.</p>
          <Link to="/vendor/pricing"><Button className="mt-5 rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white">Upgrade to Pro</Button></Link>
        </div>
      ) : (
        <div className="mt-8 grid md:grid-cols-2 gap-4">
          {branches.map((b) => (
            <div key={b.id} className="rounded-2xl border border-stone-200 bg-white p-5 flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 grid place-items-center text-[#0A6E3B]"><Building2 size={18} /></div>
                <div>
                  <div className="font-display text-lg font-semibold text-stone-900">{b.branch_name}</div>
                  <div className="text-stone-500 text-sm">{b.address}</div>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => remove(b.id)} className="text-red-600"><Trash2 size={15} /></Button>
            </div>
          ))}
          {branches.length === 0 && <div className="col-span-2 text-center py-10 text-stone-500 text-sm">No branches yet.</div>}
        </div>
      )}
    </div>
  );
}
