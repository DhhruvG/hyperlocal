import React, { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { api, formatApiErrorDetail } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import {
  LayoutDashboard, Users, Store, Package, Star, MessageSquare, Megaphone, CreditCard,
  LogOut, Search, Trash2, ShieldCheck, Plus, Rocket, CheckCircle2, Ban, Pencil,
  LifeBuoy, BookOpen, Wallet, TrendingUp, Lock, Unlock, UserCheck, CheckSquare,
  Square, RefreshCw, AlertCircle, FileText, ArrowRight, X, ExternalLink, Eye, User, Scale,
  Cpu, Bot, Sliders, Sparkles, Mic
} from 'lucide-react';
import ErrorBoundary from '@/components/ErrorBoundary';

// ---------------- Layout ----------------
export function AdminLayout() {
  const { user, loading, logout, refresh } = useAuth();
  const navigate = useNavigate();

  // Global search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchFilter, setSearchFilter] = useState('all'); // 'all' | 'users' | 'products' | 'grievances' | 'attribution_sessions' | 'orders'
  const [profileUserId, setProfileUserId] = useState(null);

  if (loading) return <div className="min-h-screen grid place-items-center text-stone-500">Loading…</div>;
  if (!user || user.role !== 'admin') return <Navigate to="/admin/login" replace />;

  const items = [
    { to: '/admin', end: true, icon: LayoutDashboard, label: 'Overview' },
    { to: '/admin/ai-control-center', icon: Sliders, label: 'AI Control Center' },
    { to: '/admin/voice-inventory', icon: Mic, label: 'AI Voice Inventory' },
    { to: '/admin/smart-features', icon: Cpu, label: 'Smart Features' },
    { to: '/admin/ai-playground', icon: Bot, label: 'AI Playground' },
    { to: '/admin/attribution', icon: TrendingUp, label: 'Attribution & Impact' },
    { to: '/admin/audit-logs', icon: ShieldCheck, label: 'Audit Logs' },
    { to: '/admin/grievances', icon: LifeBuoy, label: 'Grievances' },
    { to: '/admin/vendors', icon: Store, label: 'Vendors' },
    { to: '/admin/consumers', icon: Users, label: 'Consumers' },
    { to: '/admin/products', icon: Package, label: 'Products' },
    { to: '/admin/reviews', icon: Star, label: 'Reviews' },
    { to: '/admin/messages', icon: MessageSquare, label: 'Messages' },
    { to: '/admin/requests', icon: Megaphone, label: '"I need" requests' },
    { to: '/admin/orders', icon: CreditCard, label: 'Subscription Orders' },
    { to: '/admin/billing', icon: FileText, label: 'Billing & Checkout' },
    { to: '/admin/payments', icon: Wallet, label: 'Payment settings' },
    { to: '/admin/ai-knowledge', icon: Sparkles, label: 'AI Knowledge & RAG' },
    { to: '/admin/knowledge', icon: BookOpen, label: 'Legacy KB Docs' },
  ];

  const handleGlobalSearch = async (e) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setSearchOpen(true);
    try {
      const res = await api.get('/admin/global-search', { params: { q: searchQuery.trim(), limit: 20 } });
      setSearchResults(res.data);
    } catch {
      toast.error('Global search query failed');
    } finally {
      setSearchLoading(false);
    }
  };

  const hasAdminPrevToken = !!localStorage.getItem('admin_prev_token');
  let impersonatedUser = null;
  try {
    const impersonatedUserJson = localStorage.getItem('impersonated_user');
    if (impersonatedUserJson) impersonatedUser = JSON.parse(impersonatedUserJson);
  } catch {
    localStorage.removeItem('impersonated_user');
  }

  const handleExitImpersonation = async () => {
    const prevToken = localStorage.getItem('admin_prev_token');
    if (prevToken) {
      localStorage.setItem('lp_token', prevToken);
      localStorage.removeItem('admin_prev_token');
      localStorage.removeItem('impersonated_user');
      toast.success('Exited impersonation mode. Restored Super Admin session.');
      await refresh();
      navigate('/admin');
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 md:grid md:grid-cols-[240px_1fr]">
      <aside className="hidden md:flex flex-col bg-stone-900 text-stone-100 min-h-screen sticky top-0">
        <div className="p-5 border-b border-stone-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 grid place-items-center"><ShieldCheck size={16} className="text-white" /></div>
            <div>
              <div className="font-display font-semibold text-sm">Super Admin</div>
              <div className="text-[10px] text-stone-400 truncate max-w-[160px]">{user.email}</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {items.map(({ to, end, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={end} data-testid={`admin-nav-${label.toLowerCase().replace(/[^a-z]/g, '-')}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-emerald-600 text-white font-medium' : 'text-stone-300 hover:bg-stone-800'}`
              }
            >
              <Icon size={16} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-stone-800 space-y-1">
          <Link to="/" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-stone-400 hover:bg-stone-800">
            <Store size={16} /> Open storefront
          </Link>
          <button
            data-testid="admin-logout"
            onClick={async () => { await logout(); navigate('/admin/login'); }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-stone-400 hover:bg-stone-800"
          >
            <LogOut size={16} /> Log out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden bg-stone-900 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2"><ShieldCheck size={18} /><span className="font-semibold">Super Admin</span></div>
        <button onClick={async () => { await logout(); navigate('/admin/login'); }} className="text-xs text-stone-300">Sign out</button>
      </div>

      <div className="min-w-0 flex flex-col min-h-screen">
        {/* Top Header with Global Search */}
        <header className="bg-white border-b border-stone-200 px-5 md:px-8 py-3 flex items-center justify-between gap-4 sticky top-0 z-30 shadow-xs">
          <form onSubmit={handleGlobalSearch} className="flex-1 max-w-xl relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Super Admin Global Search: users, products, sessions, grievances, orders..."
              className="pl-9 pr-24 py-1.5 h-9 rounded-full bg-stone-50 border-stone-200 text-xs focus:bg-white focus:border-emerald-600"
            />
            <Button
              type="submit"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-3 rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white text-[11px]"
            >
              Search
            </Button>
          </form>

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden lg:inline-flex items-center gap-1.5 text-xs text-stone-500 bg-stone-100 px-2.5 py-1 rounded-full">
              <ShieldCheck size={12} className="text-emerald-700" />
              Role: Super Admin (Audited)
            </span>
          </div>
        </header>

        {/* Impersonation alert banner */}
        {hasAdminPrevToken && (
          <div className="bg-purple-900 text-white px-6 py-2.5 flex items-center justify-between text-xs shadow-md border-b border-purple-800">
            <div className="flex items-center gap-2.5">
              <UserCheck size={16} className="text-purple-300 shrink-0" />
              <span>
                <strong>Admin Impersonation Mode:</strong> Currently acting as{' '}
                <strong>{impersonatedUser?.name || impersonatedUser?.shop_name || 'User'}</strong> ({impersonatedUser?.role}).
                All actions are cryptographically associated with your admin identity.
              </span>
            </div>
            <Button size="sm" onClick={handleExitImpersonation} className="bg-white text-purple-900 hover:bg-purple-100 rounded-full text-xs h-7 shrink-0 font-medium">
              Exit Impersonation
            </Button>
          </div>
        )}

        {/* Mobile tabs */}
        <nav className="md:hidden bg-white border-b border-stone-200 overflow-x-auto flex px-2 py-2 gap-1">
          {items.map(({ to, end, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs ${isActive ? 'bg-[#0A6E3B] text-white' : 'bg-stone-100 text-stone-700'}`}>
              <Icon size={13} /> {label}
            </NavLink>
          ))}
        </nav>

        <main className="p-5 md:p-8 flex-1">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* GLOBAL SEARCH RESULTS MODAL */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="bg-white max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-lg flex items-center justify-between">
              <span>Super Admin Global Search</span>
              {searchResults && (
                <Badge variant="outline" className="text-xs">
                  {searchResults.total_matches} results for &ldquo;{searchResults.query}&rdquo;
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {searchLoading ? (
            <div className="py-12 text-center text-stone-400 text-xs">Searching all collections...</div>
          ) : !searchResults ? (
            <div className="py-8 text-center text-stone-400 text-xs">Type a query in the search bar above.</div>
          ) : (
            <div className="space-y-4">
              {/* Category Filter Pills */}
              <div className="flex gap-1.5 border-b border-stone-200 pb-2 text-xs overflow-x-auto">
                {[
                  { id: 'all', label: `All (${searchResults.total_matches})` },
                  { id: 'users', label: `Users (${searchResults.results?.users?.length || 0})` },
                  { id: 'products', label: `Products (${searchResults.results?.products?.length || 0})` },
                  { id: 'grievances', label: `Grievances (${searchResults.results?.grievances?.length || 0})` },
                  { id: 'sessions', label: `Attribution (${searchResults.results?.attribution_sessions?.length || 0})` },
                  { id: 'orders', label: `Orders (${searchResults.results?.orders?.length || 0})` },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setSearchFilter(t.id)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      searchFilter === t.id ? 'bg-[#0A6E3B] text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Users Results (Masked PII) */}
              {(searchFilter === 'all' || searchFilter === 'users') && searchResults.results?.users?.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                    <Users size={13} /> Users ({searchResults.results.users.length})
                  </div>
                  <div className="divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden bg-white">
                    {searchResults.results.users.map(u => (
                      <div key={u.id} className="p-3 flex items-center justify-between gap-3 text-xs hover:bg-stone-50">
                        <div>
                          <div className="font-semibold text-stone-900 flex items-center gap-2">
                            {u.name || u.shop_name}
                            <Badge variant="outline" className="text-[10px] uppercase">{u.role}</Badge>
                            {u.is_verified && <Badge className="bg-emerald-100 text-emerald-900 border-0 text-[10px]">Verified</Badge>}
                          </div>
                          <div className="text-stone-500 font-mono text-[11px] mt-0.5">
                            {u.email} · {u.phone || 'No phone'} · {u.city || 'Dehradun'}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setSearchOpen(false); setProfileUserId(u.id); }}
                          className="rounded-full text-xs h-7 border-stone-300 hover:border-[#0A6E3B]"
                        >
                          <Eye size={12} className="mr-1" /> View Profile
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Products Results */}
              {(searchFilter === 'all' || searchFilter === 'products') && searchResults.results?.products?.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                    <Package size={13} /> Products ({searchResults.results.products.length})
                  </div>
                  <div className="divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden bg-white">
                    {searchResults.results.products.map(p => (
                      <div key={p.id} className="p-3 flex items-center justify-between gap-3 text-xs hover:bg-stone-50">
                        <div>
                          <div className="font-semibold text-stone-900">{p.name}</div>
                          <div className="text-stone-500 text-[11px] mt-0.5">
                            Category: {p.category} · Price: ₹{p.price} / {p.unit}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={p.in_stock ? 'bg-emerald-100 text-emerald-900 border-0 text-[10px]' : 'bg-stone-100 text-stone-600 border-0 text-[10px]'}>
                            {p.in_stock ? 'In Stock' : 'Out of Stock'}
                          </Badge>
                          <Link to="/admin/products" onClick={() => setSearchOpen(false)} className="text-[#0A6E3B] hover:underline text-[11px]">
                            Manage
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Grievances Results */}
              {(searchFilter === 'all' || searchFilter === 'grievances') && searchResults.results?.grievances?.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                    <LifeBuoy size={13} /> Grievances ({searchResults.results.grievances.length})
                  </div>
                  <div className="divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden bg-white">
                    {searchResults.results.grievances.map(g => (
                      <div key={g.id} className="p-3 flex items-center justify-between gap-3 text-xs hover:bg-stone-50">
                        <div>
                          <div className="font-semibold text-stone-900 flex items-center gap-2">
                            <span className="font-mono text-[11px] text-stone-500">{g.grievance_number}</span>
                            <span>{g.subject}</span>
                          </div>
                          <div className="text-stone-500 text-[11px] mt-0.5 line-clamp-1">{g.description}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] uppercase">{g.status}</Badge>
                          <Link to={`/admin/grievances/${g.id}`} onClick={() => setSearchOpen(false)} className="text-[#0A6E3B] hover:underline text-[11px]">
                            Inspect
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Attribution Sessions Results */}
              {(searchFilter === 'all' || searchFilter === 'sessions') && searchResults.results?.attribution_sessions?.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                    <TrendingUp size={13} /> Attribution Sessions ({searchResults.results.attribution_sessions.length})
                  </div>
                  <div className="divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden bg-white">
                    {searchResults.results.attribution_sessions.map(s => (
                      <div key={s.id} className="p-3 flex items-center justify-between gap-3 text-xs hover:bg-stone-50">
                        <div>
                          <div className="font-mono font-medium text-stone-900">{s.session_id}</div>
                          <div className="text-stone-500 text-[11px] mt-0.5">
                            Intent: {s.intent_level} · Type: {s.session_type || 'retail_visit'}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-stone-100 text-stone-800 border-0 text-[10px] uppercase">{s.attribution_status}</Badge>
                          <Link to="/admin/attribution" onClick={() => setSearchOpen(false)} className="text-[#0A6E3B] hover:underline text-[11px]">
                            Attribution Panel
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Orders Results */}
              {(searchFilter === 'all' || searchFilter === 'orders') && searchResults.results?.orders?.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                    <CreditCard size={13} /> Orders ({searchResults.results.orders.length})
                  </div>
                  <div className="divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden bg-white">
                    {searchResults.results.orders.map(o => (
                      <div key={o.id} className="p-3 flex items-center justify-between gap-3 text-xs hover:bg-stone-50">
                        <div>
                          <div className="font-mono font-medium text-stone-900">{o.order_id || o.id}</div>
                          <div className="text-stone-500 text-[11px] mt-0.5">
                            Plan: {o.plan || 'Standard'} · ₹{((o.amount || 0) / 100).toFixed(2)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={o.status === 'paid' ? 'bg-emerald-100 text-emerald-900 border-0 text-[10px]' : 'text-[10px]'}>{o.status}</Badge>
                          <Link to="/admin/orders" onClick={() => setSearchOpen(false)} className="text-[#0A6E3B] hover:underline text-[11px]">
                            Orders Panel
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Standalone User Profile Modal triggered from search */}
      <UserProfileModal
        userId={profileUserId}
        open={!!profileUserId}
        onOpenChange={(v) => !v && setProfileUserId(null)}
      />
    </div>
  );
}

// ---------------- Overview ----------------
export function AdminOverview() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  useEffect(() => {
    api.get('/admin/stats').then(r => setStats(r.data)).catch(() => {});
  }, []);

  const cards = stats ? [
    { label: 'Smart AI Features', value: '45 Active', icon: Cpu, tint: 'bg-emerald-50 text-emerald-800', sub: '3 Tiers · Master Switch ON', link: '/admin/smart-features' },
    { label: 'Consumers', value: stats.consumer_count, icon: Users, tint: 'bg-emerald-50 text-emerald-800' },
    { label: 'Vendors', value: stats.vendor_count, icon: Store, tint: 'bg-amber-50 text-amber-800', sub: `${stats.verified_vendor_count} verified · ${stats.pro_vendor_count} Pro` },
    { label: 'Products', value: stats.product_count, icon: Package, tint: 'bg-blue-50 text-blue-800', sub: `${stats.in_stock_product_count} in stock` },
    { label: 'Reviews', value: stats.review_count, icon: Star, tint: 'bg-yellow-50 text-yellow-800' },
    { label: 'Messages', value: stats.message_count, icon: MessageSquare, tint: 'bg-violet-50 text-violet-800' },
    { label: '"I need" requests', value: stats.request_count, icon: Megaphone, tint: 'bg-rose-50 text-rose-800', sub: `${stats.open_request_count} open` },
    { label: 'Orders', value: stats.order_count, icon: CreditCard, tint: 'bg-teal-50 text-teal-800', sub: `${stats.paid_order_count} paid` },
    { label: 'Online carts', value: stats.online_cart_count, icon: Store, tint: 'bg-orange-50 text-orange-800' },
  ] : [];

  return (
    <div>
      <h1 className="font-display text-2xl md:text-3xl font-semibold text-stone-900">Overview</h1>
      <p className="text-stone-600 text-sm mt-1">Health of the LocalPrice marketplace at a glance.</p>
      <div className="mt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} onClick={() => c.link && navigate(c.link)} className={`rounded-2xl bg-white border border-stone-200 p-5 ${c.link ? 'cursor-pointer hover:border-emerald-500 hover:shadow-sm transition-all' : ''}`}>
            <div className="flex items-center justify-between">
              <div className="eyebrow text-stone-500">{c.label}</div>
              <div className={`w-8 h-8 rounded-lg grid place-items-center ${c.tint}`}><c.icon size={15} /></div>
            </div>
            <div className="font-display text-3xl font-semibold text-stone-900 mt-2">{c.value}</div>
            {c.sub && <div className="text-xs text-stone-500 mt-0.5">{c.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- Vendors ----------------
export function AdminVendors() {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', shop_name: '', shop_address: '', vendor_type: 'retailer', is_verified: true, grant_pro: false });

  const [editingVendor, setEditingVendor] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [userProfileId, setUserProfileId] = useState(null);

  const load = async () => {
    const { data } = await api.get('/admin/users', { params: { role: 'vendor', q, limit: 200 } });
    setUsers(data);
  };
  useEffect(() => { load(); }, []);
  const search = (e) => { e.preventDefault(); load(); };

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === users.length) setSelectedIds([]);
    else setSelectedIds(users.map(u => u.id));
  };

  const handleBulkAction = async (action) => {
    if (!selectedIds.length) return;
    try {
      await api.post('/admin/bulk-action', { entity: 'vendors', action, ids: selectedIds });
      toast.success(`Bulk ${action} applied to ${selectedIds.length} vendors`);
      setSelectedIds([]);
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const toggle = async (id, field, val) => {
    try {
      await api.patch(`/admin/users/${id}`, { [field]: val });
      setUsers(users.map(u => u.id === id ? { ...u, [field]: val } : u));
    } catch { toast.error('Update failed'); }
  };

  const grantPro = async (id, plan) => {
    try {
      await api.post('/admin/grant-pro', { vendor_id: id, plan });
      toast.success(`Pro granted (${plan})`);
      load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const revokePro = async (id) => {
    try { await api.post('/admin/revoke-pro', { vendor_id: id, plan: 'monthly' }); load(); toast.success('Pro revoked'); }
    catch { toast.error('Failed'); }
  };

  const del = async (id) => {
    if (!window.confirm('Delete this vendor and ALL their products/reviews/messages? This cannot be undone.')) return;
    try { await api.delete(`/admin/users/${id}`); setUsers(users.filter(u => u.id !== id)); toast.success('Vendor removed'); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/vendors', form);
      toast.success('Vendor created');
      setForm({ name: '', email: '', password: '', phone: '', shop_name: '', shop_address: '', vendor_type: 'retailer', is_verified: true, grant_pro: false });
      setDialog(false); load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const saveVendor = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.patch(`/admin/users/${editingVendor.id}`, {
        name: editingVendor.name,
        email: editingVendor.email,
        phone: editingVendor.phone,
        shop_name: editingVendor.shop_name,
        shop_address: editingVendor.shop_address,
        city: editingVendor.city,
        vendor_type: editingVendor.vendor_type,
        opening_hours: editingVendor.opening_hours,
        lat: editingVendor.lat ? parseFloat(editingVendor.lat) : undefined,
        lng: editingVendor.lng ? parseFloat(editingVendor.lng) : undefined,
      });
      setUsers(users.map(u => u.id === data.id ? { ...u, ...data } : u));
      setEditingVendor(null);
      toast.success('Vendor updated successfully');
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  return (
    <div>
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-stone-900">Vendors</h1>
          <p className="text-stone-600 text-sm mt-1">Add, edit, verify, upgrade to Pro, or remove any vendor.</p>
        </div>
        <div className="flex gap-2">
          <form onSubmit={search} className="flex gap-2">
            <Input data-testid="vendors-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / email / shop" className="w-64" />
            <Button variant="outline" type="submit"><Search size={14} /></Button>
          </form>
          <Dialog open={dialog} onOpenChange={setDialog}>
            <DialogTrigger asChild><Button data-testid="add-vendor-btn" className="bg-[#0A6E3B] hover:bg-[#075030] text-white rounded-full"><Plus size={14} className="mr-1" /> Add vendor</Button></DialogTrigger>
            <DialogContent className="bg-white max-w-lg">
              <DialogHeader><DialogTitle>Add a new vendor</DialogTitle></DialogHeader>
              <form onSubmit={create} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Name</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                  <div><Label className="text-xs">Phone</Label><Input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                </div>
                <div><Label className="text-xs">Email</Label><Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div><Label className="text-xs">Password</Label><Input required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
                <div><Label className="text-xs">Shop name</Label><Input required value={form.shop_name} onChange={(e) => setForm({ ...form, shop_name: e.target.value })} /></div>
                <div><Label className="text-xs">Shop address</Label><Input required value={form.shop_address} onChange={(e) => setForm({ ...form, shop_address: e.target.value })} /></div>
                <div><Label className="text-xs">Vendor type</Label>
                  <Select value={form.vendor_type} onValueChange={(v) => setForm({ ...form, vendor_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="retailer">Retailer</SelectItem><SelectItem value="cart_vendor">Cart vendor</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 rounded-lg bg-stone-50 border border-stone-200 p-2 text-sm"><input type="checkbox" checked={form.is_verified} onChange={(e) => setForm({ ...form, is_verified: e.target.checked })} /> Verified</label>
                  <label className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 p-2 text-sm"><input type="checkbox" checked={form.grant_pro} onChange={(e) => setForm({ ...form, grant_pro: e.target.checked })} /> Grant Pro</label>
                </div>
                <DialogFooter><Button type="submit" className="bg-[#0A6E3B] hover:bg-[#075030] text-white rounded-full">Create vendor</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="mt-4 p-3.5 bg-stone-900 text-white rounded-2xl flex items-center justify-between text-xs shadow-lg">
          <div className="flex items-center gap-2">
            <CheckSquare size={16} className="text-emerald-400" />
            <span><strong>{selectedIds.length}</strong> vendors selected</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => handleBulkAction('verify')} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-xs h-7 px-3">
              Bulk Verify
            </Button>
            <Button size="sm" onClick={() => handleBulkAction('unverify')} className="bg-stone-700 hover:bg-stone-600 text-white rounded-full text-xs h-7 px-3">
              Bulk Unverify
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])} className="text-stone-400 hover:text-white text-xs h-7">
              Clear Selection
            </Button>
          </div>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-stone-200 bg-white overflow-x-auto">
        <Table>
          <TableHeader><TableRow className="bg-stone-50">
            <TableHead className="w-8">
              <input
                type="checkbox"
                checked={selectedIds.length === users.length && users.length > 0}
                onChange={toggleSelectAll}
                className="rounded border-stone-300"
              />
            </TableHead>
            <TableHead>Shop</TableHead><TableHead>Type</TableHead><TableHead>Owner</TableHead>
            <TableHead>Products</TableHead><TableHead>Verified</TableHead><TableHead>Online</TableHead>
            <TableHead>Pro</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} className={selectedIds.includes(u.id) ? 'bg-emerald-50/40' : ''}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(u.id)}
                    onChange={() => toggleSelect(u.id)}
                    className="rounded border-stone-300"
                  />
                </TableCell>
                <TableCell>
                  <div className="font-medium text-stone-900">{u.shop_name}</div>
                  <div className="text-xs text-stone-500">{u.shop_address}</div>
                </TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">{u.vendor_type}</Badge></TableCell>
                <TableCell><div className="text-sm">{u.name}</div><div className="text-xs text-stone-500">{u.email}</div></TableCell>
                <TableCell className="text-sm">{u.product_count || 0}</TableCell>
                <TableCell><Switch data-testid={`verify-${u.id}`} checked={!!u.is_verified} onCheckedChange={(v) => toggle(u.id, 'is_verified', v)} /></TableCell>
                <TableCell><Switch checked={!!u.is_online} onCheckedChange={(v) => toggle(u.id, 'is_online', v)} /></TableCell>
                <TableCell>{u.is_pro
                  ? <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white border-0">Pro</Badge>
                  : <Badge variant="outline">—</Badge>}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => setUserProfileId(u.id)} title="View full profile with audited reveal"><User size={13} /></Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingVendor({ ...u })} title="Edit vendor"><Pencil size={13} /></Button>
                  {u.is_pro
                    ? <Button size="sm" variant="ghost" onClick={() => revokePro(u.id)} title="Revoke Pro"><Ban size={13} /></Button>
                    : <Button size="sm" variant="ghost" onClick={() => grantPro(u.id, 'monthly')} title="Grant Pro (monthly)"><Rocket size={13} /></Button>}
                  <Button data-testid={`delete-vendor-${u.id}`} size="sm" variant="ghost" onClick={() => del(u.id)} className="text-red-600"><Trash2 size={13} /></Button>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-8 text-stone-500 text-sm">No vendors found.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <UserProfileModal
        userId={userProfileId}
        open={!!userProfileId}
        onOpenChange={(v) => !v && setUserProfileId(null)}
      />

      {/* Edit Vendor Dialog */}
      <Dialog open={!!editingVendor} onOpenChange={(v) => !v && setEditingVendor(null)}>
        <DialogContent className="bg-white max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Vendor</DialogTitle></DialogHeader>
          {editingVendor && (
            <form onSubmit={saveVendor} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Owner Name</Label><Input value={editingVendor.name || ''} onChange={(e) => setEditingVendor({ ...editingVendor, name: e.target.value })} required /></div>
                <div><Label className="text-xs">Phone</Label><Input value={editingVendor.phone || ''} onChange={(e) => setEditingVendor({ ...editingVendor, phone: e.target.value })} required /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Email</Label><Input type="email" value={editingVendor.email || ''} onChange={(e) => setEditingVendor({ ...editingVendor, email: e.target.value })} required /></div>
                <div><Label className="text-xs">City</Label><Input value={editingVendor.city || 'Dehradun'} onChange={(e) => setEditingVendor({ ...editingVendor, city: e.target.value })} /></div>
              </div>
              <div><Label className="text-xs">Shop Name</Label><Input value={editingVendor.shop_name || ''} onChange={(e) => setEditingVendor({ ...editingVendor, shop_name: e.target.value })} required /></div>
              <div><Label className="text-xs">Shop Address</Label><Input value={editingVendor.shop_address || ''} onChange={(e) => setEditingVendor({ ...editingVendor, shop_address: e.target.value })} required /></div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Vendor Type</Label>
                  <Select value={editingVendor.vendor_type || 'retailer'} onValueChange={(v) => setEditingVendor({ ...editingVendor, vendor_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="retailer">Retailer</SelectItem><SelectItem value="cart_vendor">Cart Vendor</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Opening Hours</Label><Input value={editingVendor.opening_hours || ''} onChange={(e) => setEditingVendor({ ...editingVendor, opening_hours: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Latitude</Label><Input type="number" step="0.0001" value={editingVendor.lat || ''} onChange={(e) => setEditingVendor({ ...editingVendor, lat: e.target.value })} /></div>
                <div><Label className="text-xs">Longitude</Label><Input type="number" step="0.0001" value={editingVendor.lng || ''} onChange={(e) => setEditingVendor({ ...editingVendor, lng: e.target.value })} /></div>
              </div>
              <DialogFooter className="pt-2"><Button type="submit" className="bg-[#0A6E3B] hover:bg-[#075030] text-white rounded-full">Save Changes</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------- Consumers ----------------
export function AdminConsumers() {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');
  const [editingConsumer, setEditingConsumer] = useState(null);
  const [userProfileId, setUserProfileId] = useState(null);

  const load = async () => {
    const { data } = await api.get('/admin/users', { params: { role: 'consumer', q, limit: 200 } });
    setUsers(data);
  };
  useEffect(() => { load(); }, []);

  const del = async (id) => {
    if (!window.confirm('Delete this consumer and their saved items / messages / requests?')) return;
    await api.delete(`/admin/users/${id}`); load(); toast.success('Consumer removed');
  };

  const saveConsumer = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.patch(`/admin/users/${editingConsumer.id}`, {
        name: editingConsumer.name,
        email: editingConsumer.email,
        phone: editingConsumer.phone,
        city: editingConsumer.city,
      });
      setUsers(users.map(u => u.id === data.id ? { ...u, ...data } : u));
      setEditingConsumer(null);
      toast.success('Consumer updated');
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  return (
    <div>
      <h1 className="font-display text-2xl md:text-3xl font-semibold text-stone-900">Consumers</h1>
      <p className="text-stone-600 text-sm mt-1">Manage shoppers, edit profile information, or remove accounts.</p>
      <form onSubmit={(e) => { e.preventDefault(); load(); }} className="mt-5 flex gap-2 max-w-md">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" />
        <Button variant="outline" type="submit"><Search size={14} /></Button>
      </form>
      <div className="mt-5 rounded-2xl border border-stone-200 bg-white overflow-x-auto">
        <Table>
          <TableHeader><TableRow className="bg-stone-50"><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Phone</TableHead><TableHead>City</TableHead><TableHead>Joined</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium text-stone-900">{u.name}</TableCell>
                <TableCell className="text-sm text-stone-600">{u.email}</TableCell>
                <TableCell className="text-sm text-stone-600">{u.phone || '—'}</TableCell>
                <TableCell className="text-sm text-stone-600">{u.city || 'Dehradun'}</TableCell>
                <TableCell className="text-xs text-stone-500">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => setUserProfileId(u.id)} title="View full profile with audited reveal"><User size={13} /></Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingConsumer({ ...u })} title="Edit consumer"><Pencil size={13} /></Button>
                  <Button size="sm" variant="ghost" onClick={() => del(u.id)} className="text-red-600"><Trash2 size={13} /></Button>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-stone-500 text-sm">No consumers found.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <UserProfileModal
        userId={userProfileId}
        open={!!userProfileId}
        onOpenChange={(v) => !v && setUserProfileId(null)}
      />

      {/* Edit Consumer Dialog */}
      <Dialog open={!!editingConsumer} onOpenChange={(v) => !v && setEditingConsumer(null)}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader><DialogTitle>Edit Consumer</DialogTitle></DialogHeader>
          {editingConsumer && (
            <form onSubmit={saveConsumer} className="space-y-3">
              <div><Label className="text-xs">Name</Label><Input value={editingConsumer.name || ''} onChange={(e) => setEditingConsumer({ ...editingConsumer, name: e.target.value })} required /></div>
              <div><Label className="text-xs">Email</Label><Input type="email" value={editingConsumer.email || ''} onChange={(e) => setEditingConsumer({ ...editingConsumer, email: e.target.value })} required /></div>
              <div><Label className="text-xs">Phone</Label><Input value={editingConsumer.phone || ''} onChange={(e) => setEditingConsumer({ ...editingConsumer, phone: e.target.value })} /></div>
              <div><Label className="text-xs">City</Label><Input value={editingConsumer.city || 'Dehradun'} onChange={(e) => setEditingConsumer({ ...editingConsumer, city: e.target.value })} /></div>
              <DialogFooter className="pt-2"><Button type="submit" className="bg-[#0A6E3B] hover:bg-[#075030] text-white rounded-full">Save Changes</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------- Products ----------------
export function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

  const load = async () => {
    const { data } = await api.get('/admin/products', { params: { q, limit: 300 } });
    setProducts(data);
  };
  useEffect(() => { load(); }, []);

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === products.length) setSelectedIds([]);
    else setSelectedIds(products.map(p => p.id));
  };

  const handleBulkAction = async (action) => {
    if (!selectedIds.length) return;
    try {
      await api.post('/admin/bulk-action', { entity: 'products', action, ids: selectedIds });
      toast.success(`Bulk action (${action}) applied to ${selectedIds.length} products`);
      setSelectedIds([]);
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const del = async (id) => {
    if (!window.confirm('Delete this product?')) return;
    await api.delete(`/admin/products/${id}`); setProducts(products.filter(p => p.id !== id)); toast.success('Deleted');
  };

  const save = async (e) => {
    e.preventDefault();
    const { data } = await api.patch(`/admin/products/${editing.id}`, {
      name: editing.name, price: parseFloat(editing.price), unit: editing.unit,
      category: editing.category, in_stock: editing.in_stock, is_featured: editing.is_featured,
    });
    setProducts(products.map(p => p.id === data.id ? data : p));
    setEditing(null); toast.success('Updated');
  };

  const toggleStock = async (p) => {
    const { data } = await api.patch(`/admin/products/${p.id}`, { in_stock: !p.in_stock });
    setProducts(products.map(x => x.id === p.id ? data : x));
  };

  return (
    <div>
      <h1 className="font-display text-2xl md:text-3xl font-semibold text-stone-900">Products</h1>
      <form onSubmit={(e) => { e.preventDefault(); load(); }} className="mt-5 flex gap-2 max-w-md">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product name" />
        <Button variant="outline" type="submit"><Search size={14} /></Button>
      </form>

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="mt-4 p-3.5 bg-stone-900 text-white rounded-2xl flex items-center justify-between text-xs shadow-lg">
          <div className="flex items-center gap-2">
            <CheckSquare size={16} className="text-emerald-400" />
            <span><strong>{selectedIds.length}</strong> products selected</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => handleBulkAction('activate')} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-xs h-7 px-3">
              Set In Stock
            </Button>
            <Button size="sm" onClick={() => handleBulkAction('deactivate')} className="bg-stone-700 hover:bg-stone-600 text-white rounded-full text-xs h-7 px-3">
              Set Out of Stock
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])} className="text-stone-400 hover:text-white text-xs h-7">
              Clear Selection
            </Button>
          </div>
        </div>
      )}

      <div className="mt-5 rounded-2xl border border-stone-200 bg-white overflow-x-auto">
        <Table>
          <TableHeader><TableRow className="bg-stone-50">
            <TableHead className="w-8">
              <input
                type="checkbox"
                checked={selectedIds.length === products.length && products.length > 0}
                onChange={toggleSelectAll}
                className="rounded border-stone-300"
              />
            </TableHead>
            <TableHead>Name</TableHead><TableHead>Vendor</TableHead><TableHead>Price</TableHead><TableHead>Category</TableHead><TableHead>Stock</TableHead><TableHead>Featured</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {products.map((p) => (
              <TableRow key={p.id} className={selectedIds.includes(p.id) ? 'bg-emerald-50/40' : ''}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(p.id)}
                    onChange={() => toggleSelect(p.id)}
                    className="rounded border-stone-300"
                  />
                </TableCell>
                <TableCell className="font-medium text-stone-900">{p.name}</TableCell>
                <TableCell className="text-sm text-stone-600">{p.vendor_shop}</TableCell>
                <TableCell className="font-semibold text-[#0A6E3B]">₹{p.price}<span className="text-xs text-stone-500">/{p.unit || '-'}</span></TableCell>
                <TableCell className="text-xs uppercase tracking-wider text-stone-500">{p.category || 'other'}</TableCell>
                <TableCell><Switch checked={!!p.in_stock} onCheckedChange={() => toggleStock(p)} /></TableCell>
                <TableCell>{p.is_featured ? <CheckCircle2 size={14} className="text-amber-600" /> : <span className="text-stone-300">—</span>}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ ...p })}><Pencil size={13} /></Button>
                  <Button size="sm" variant="ghost" onClick={() => del(p.id)} className="text-red-600"><Trash2 size={13} /></Button>
                </TableCell>
              </TableRow>
            ))}
            {products.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-stone-500 text-sm">No products.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="bg-white">
          <DialogHeader><DialogTitle>Edit product</DialogTitle></DialogHeader>
          {editing && (
            <form onSubmit={save} className="space-y-3">
              <div><Label className="text-xs">Name</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Price (₹)</Label><Input type="number" step="0.01" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} /></div>
                <div><Label className="text-xs">Unit</Label><Input value={editing.unit || ''} onChange={(e) => setEditing({ ...editing, unit: e.target.value })} /></div>
              </div>
              <div><Label className="text-xs">Category</Label><Input value={editing.category || ''} onChange={(e) => setEditing({ ...editing, category: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 rounded-lg bg-stone-50 border border-stone-200 p-2 text-sm"><input type="checkbox" checked={!!editing.in_stock} onChange={(e) => setEditing({ ...editing, in_stock: e.target.checked })} /> In stock</label>
                <label className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 p-2 text-sm"><input type="checkbox" checked={!!editing.is_featured} onChange={(e) => setEditing({ ...editing, is_featured: e.target.checked })} /> Featured</label>
              </div>
              <DialogFooter><Button type="submit" className="bg-[#0A6E3B] hover:bg-[#075030] text-white rounded-full">Save</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------- Reviews / Messages / Requests / Orders ----------------
export function AdminReviews() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = async () => { const { data } = await api.get('/admin/reviews'); setItems(data); };
  useEffect(() => { load(); }, []);

  const del = async (id) => {
    if (!window.confirm('Delete this review?')) return;
    await api.delete(`/admin/reviews/${id}`); setItems(items.filter(x => x.id !== id)); toast.success('Deleted');
  };

  const save = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.patch(`/admin/reviews/${editing.id}`, {
        rating: parseInt(editing.rating),
        comment: editing.comment,
        consumer_name: editing.consumer_name,
      });
      setItems(items.map(x => x.id === data.id ? data : x));
      setEditing(null); toast.success('Review updated');
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  return (
    <div>
      <h1 className="font-display text-2xl md:text-3xl font-semibold text-stone-900">Reviews</h1>
      <p className="text-stone-600 text-sm mt-1">Review ratings and comments left by shoppers.</p>
      <div className="mt-5 rounded-2xl border border-stone-200 bg-white overflow-x-auto">
        <Table>
          <TableHeader><TableRow className="bg-stone-50">
            <TableHead>Consumer</TableHead><TableHead>Rating</TableHead><TableHead>Vendor ID</TableHead><TableHead>Comment</TableHead><TableHead>When</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {items.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.consumer_name || 'Shopper'}</TableCell>
                <TableCell><span className="inline-flex items-center gap-1 text-amber-600 font-semibold"><Star size={11} fill="#F59E0B" strokeWidth={0} /> {r.rating}</span></TableCell>
                <TableCell className="text-xs text-stone-500 font-mono">{r.vendor_id}</TableCell>
                <TableCell className="text-sm text-stone-700 max-w-sm">{r.comment || '—'}</TableCell>
                <TableCell className="text-xs text-stone-500">{new Date(r.created_at).toLocaleString()}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ ...r })} title="Edit review"><Pencil size={13} /></Button>
                  <Button size="sm" variant="ghost" onClick={() => del(r.id)} className="text-red-600"><Trash2 size={13} /></Button>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-stone-500 text-sm">No reviews.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader><DialogTitle>Edit Review</DialogTitle></DialogHeader>
          {editing && (
            <form onSubmit={save} className="space-y-3">
              <div><Label className="text-xs">Consumer Name</Label><Input value={editing.consumer_name || ''} onChange={(e) => setEditing({ ...editing, consumer_name: e.target.value })} /></div>
              <div><Label className="text-xs">Rating (1-5)</Label><Input type="number" min="1" max="5" value={editing.rating || 5} onChange={(e) => setEditing({ ...editing, rating: e.target.value })} required /></div>
              <div><Label className="text-xs">Comment</Label><Input value={editing.comment || ''} onChange={(e) => setEditing({ ...editing, comment: e.target.value })} /></div>
              <DialogFooter className="pt-2"><Button type="submit" className="bg-[#0A6E3B] hover:bg-[#075030] text-white rounded-full">Save Changes</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AdminMessages() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = async () => { const { data } = await api.get('/admin/messages'); setItems(data); };
  useEffect(() => { load(); }, []);

  const del = async (id) => {
    if (!window.confirm('Delete this message?')) return;
    await api.delete(`/admin/messages/${id}`); setItems(items.filter(x => x.id !== id)); toast.success('Deleted');
  };

  const save = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.patch(`/admin/messages/${editing.id}`, {
        body: editing.body,
        read: !!editing.read,
      });
      setItems(items.map(x => x.id === data.id ? data : x));
      setEditing(null); toast.success('Message updated');
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  return (
    <div>
      <h1 className="font-display text-2xl md:text-3xl font-semibold text-stone-900">Messages</h1>
      <p className="text-stone-600 text-sm mt-1">Direct chat messages exchanged between shoppers and sellers.</p>
      <div className="mt-5 rounded-2xl border border-stone-200 bg-white overflow-x-auto">
        <Table>
          <TableHeader><TableRow className="bg-stone-50">
            <TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Message</TableHead><TableHead>Read</TableHead><TableHead>When</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {items.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="text-xs text-stone-500 font-mono">{m.from_user_id}</TableCell>
                <TableCell className="text-xs text-stone-500 font-mono">{m.to_user_id}</TableCell>
                <TableCell className="text-sm max-w-sm truncate">{m.body}</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">{m.read ? 'Read' : 'Unread'}</Badge></TableCell>
                <TableCell className="text-xs text-stone-500">{new Date(m.created_at).toLocaleString()}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ ...m })} title="Edit message"><Pencil size={13} /></Button>
                  <Button size="sm" variant="ghost" onClick={() => del(m.id)} className="text-red-600"><Trash2 size={13} /></Button>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-stone-500 text-sm">No messages.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader><DialogTitle>Edit Message</DialogTitle></DialogHeader>
          {editing && (
            <form onSubmit={save} className="space-y-3">
              <div><Label className="text-xs">Message Body</Label><Input value={editing.body || ''} onChange={(e) => setEditing({ ...editing, body: e.target.value })} required /></div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-stone-50 border border-stone-200">
                <Label className="text-xs">Mark as read</Label>
                <Switch checked={!!editing.read} onCheckedChange={(v) => setEditing({ ...editing, read: v })} />
              </div>
              <DialogFooter className="pt-2"><Button type="submit" className="bg-[#0A6E3B] hover:bg-[#075030] text-white rounded-full">Save Changes</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AdminRequests() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = async () => { const { data } = await api.get('/admin/requests'); setItems(data); };
  useEffect(() => { load(); }, []);

  const del = async (id) => {
    if (!window.confirm('Delete this request?')) return;
    await api.delete(`/admin/requests/${id}`); setItems(items.filter(x => x.id !== id)); toast.success('Deleted');
  };

  const save = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.patch(`/admin/requests/${editing.id}`, {
        item: editing.item,
        quantity: editing.quantity,
        category: editing.category,
        note: editing.note,
        status: editing.status,
      });
      setItems(items.map(x => x.id === data.id ? data : x));
      setEditing(null); toast.success('Request updated');
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  return (
    <div>
      <h1 className="font-display text-2xl md:text-3xl font-semibold text-stone-900">"I need" requests</h1>
      <p className="text-stone-600 text-sm mt-1">Consumer demand posts and broadcast requests.</p>
      <div className="mt-5 rounded-2xl border border-stone-200 bg-white overflow-x-auto">
        <Table>
          <TableHeader><TableRow className="bg-stone-50">
            <TableHead>Consumer</TableHead><TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead>Category</TableHead><TableHead>Replies</TableHead><TableHead>Status</TableHead><TableHead>When</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {items.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.consumer_name || 'Consumer'}</TableCell>
                <TableCell className="font-semibold text-stone-900">{r.item}</TableCell>
                <TableCell className="text-xs">{r.quantity || '—'}</TableCell>
                <TableCell className="text-xs uppercase text-stone-500">{r.category || 'other'}</TableCell>
                <TableCell className="text-xs font-semibold">{r.reply_count || 0}</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">{r.status}</Badge></TableCell>
                <TableCell className="text-xs text-stone-500">{new Date(r.created_at).toLocaleString()}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ ...r })} title="Edit request"><Pencil size={13} /></Button>
                  <Button size="sm" variant="ghost" onClick={() => del(r.id)} className="text-red-600"><Trash2 size={13} /></Button>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-stone-500 text-sm">No requests.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader><DialogTitle>Edit Request</DialogTitle></DialogHeader>
          {editing && (
            <form onSubmit={save} className="space-y-3">
              <div><Label className="text-xs">Item Name</Label><Input value={editing.item || ''} onChange={(e) => setEditing({ ...editing, item: e.target.value })} required /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Quantity</Label><Input value={editing.quantity || ''} onChange={(e) => setEditing({ ...editing, quantity: e.target.value })} /></div>
                <div><Label className="text-xs">Category</Label><Input value={editing.category || ''} onChange={(e) => setEditing({ ...editing, category: e.target.value })} /></div>
              </div>
              <div><Label className="text-xs">Note</Label><Input value={editing.note || ''} onChange={(e) => setEditing({ ...editing, note: e.target.value })} /></div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={editing.status || 'open'} onValueChange={(v) => setEditing({ ...editing, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="matched">Matched</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter className="pt-2"><Button type="submit" className="bg-[#0A6E3B] hover:bg-[#075030] text-white rounded-full">Save Changes</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AdminOrders() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = async () => { const { data } = await api.get('/admin/orders'); setItems(data); };
  useEffect(() => { load(); }, []);

  const del = async (id) => {
    if (!window.confirm('Delete this order?')) return;
    await api.delete(`/admin/orders/${id}`); setItems(items.filter(x => x.id !== id)); toast.success('Deleted');
  };

  const approveOrder = async (id) => {
    try {
      const { data } = await api.post(`/admin/orders/${id}/approve`);
      setItems(items.map(x => x.id === data.id ? data : x));
      toast.success('Order approved & Vendor Pro activated!');
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  const rejectOrder = async (id) => {
    try {
      const { data } = await api.post(`/admin/orders/${id}/reject`);
      setItems(items.map(x => x.id === data.id ? data : x));
      toast.success('Order marked failed/rejected');
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  const save = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.patch(`/admin/orders/${editing.id}`, {
        status: editing.status,
        plan: editing.plan,
        tier: editing.tier,
        amount: Math.round(parseFloat(editing.amount_rupees) * 100),
        utr_number: editing.utr_number || '',
        upi_id: editing.upi_id || '',
        payment_method: editing.payment_method || 'upi_qr',
        notes: editing.notes || '',
      });
      setItems(items.map(x => x.id === data.id ? data : x));
      setEditing(null); toast.success('Order updated');
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-stone-900">Subscription & UPI Orders</h1>
          <p className="text-stone-600 text-sm mt-1">Vendor & retailer subscription payments via UPI QR (8955745543@yapl) and Razorpay.</p>
        </div>
        <Link to="/admin/payments">
          <Button variant="outline" size="sm" className="rounded-full text-xs">
            <Wallet size={13} className="mr-1.5" /> Configure UPI QR & Payment Settings
          </Button>
        </Link>
      </div>
      <div className="mt-5 rounded-2xl border border-stone-200 bg-white overflow-x-auto">
        <Table>
          <TableHeader><TableRow className="bg-stone-50">
            <TableHead>Order ID</TableHead><TableHead>Vendor / Shop</TableHead><TableHead>Plan</TableHead><TableHead>Amount</TableHead><TableHead>Method & UTR</TableHead><TableHead>Status</TableHead><TableHead>When</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {items.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-mono text-xs">{o.order_id}</TableCell>
                <TableCell>
                  <div className="text-xs font-semibold text-stone-900">{o.shop_name || o.vendor_name || 'Vendor'}</div>
                  <div className="text-[10px] text-stone-500 font-mono">{o.user_id}</div>
                </TableCell>
                <TableCell><Badge variant="outline" className="text-xs">{o.plan} ({o.tier || 'retailer'})</Badge></TableCell>
                <TableCell className="font-semibold">₹{(((o.amount || 0) / 100) || 0).toFixed(2)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Badge className={o.payment_method === 'upi_qr' ? 'bg-emerald-100 text-emerald-900 border-0 text-[10px]' : 'bg-stone-100 text-stone-700 border-0 text-[10px]'}>
                      {o.payment_method === 'upi_qr' ? 'UPI QR' : o.payment_method || 'Razorpay'}
                    </Badge>
                    {o.utr_number && <span className="font-mono text-xs font-semibold text-stone-800">UTR: {o.utr_number}</span>}
                  </div>
                  {o.upi_id && <div className="text-[10px] text-stone-500 font-mono mt-0.5">To: {o.upi_id}</div>}
                </TableCell>
                <TableCell>
                  <Badge className={o.status === 'paid' ? 'bg-emerald-600 hover:bg-emerald-600 text-white border-0' : o.status === 'pending_verification' ? 'bg-amber-500 text-white border-0' : o.status === 'failed' ? 'bg-red-600 text-white border-0' : ''}>
                    {o.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-stone-500">{o.created_at ? new Date(o.created_at).toLocaleString() : '—'}</TableCell>
                <TableCell className="text-right space-x-1 whitespace-nowrap">
                  {o.status !== 'paid' && (
                    <Button size="sm" variant="outline" onClick={() => approveOrder(o.id)} className="h-7 text-xs border-emerald-300 text-emerald-800 hover:bg-emerald-50" title="Approve & Activate Pro">
                      <CheckCircle2 size={12} className="mr-1" /> Approve
                    </Button>
                  )}
                  {o.status !== 'failed' && (
                    <Button size="sm" variant="ghost" onClick={() => rejectOrder(o.id)} className="h-7 text-xs text-amber-700 hover:bg-amber-50" title="Reject">
                      <Ban size={13} />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ ...o, amount_rupees: (((o.amount || 0) / 100) || 0).toString() })} title="Edit order"><Pencil size={13} /></Button>
                  <Button size="sm" variant="ghost" onClick={() => del(o.id)} className="text-red-600"><Trash2 size={13} /></Button>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-stone-500 text-sm">No orders.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader><DialogTitle>Edit Order</DialogTitle></DialogHeader>
          {editing && (
            <form onSubmit={save} className="space-y-3">
              <div><Label className="text-xs">Order ID</Label><Input disabled value={editing.order_id || ''} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Amount (₹)</Label><Input type="number" step="0.01" value={editing.amount_rupees || ''} onChange={(e) => setEditing({ ...editing, amount_rupees: e.target.value })} required /></div>
                <div><Label className="text-xs">Plan</Label><Input value={editing.plan || ''} onChange={(e) => setEditing({ ...editing, plan: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Payment Method</Label>
                  <Select value={editing.payment_method || 'upi_qr'} onValueChange={(v) => setEditing({ ...editing, payment_method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="upi_qr">UPI QR</SelectItem>
                      <SelectItem value="razorpay">Razorpay</SelectItem>
                      <SelectItem value="cash">Cash / Manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Status</Label>
                  <Select value={editing.status || 'created'} onValueChange={(v) => setEditing({ ...editing, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="created">Created</SelectItem>
                      <SelectItem value="pending_verification">Pending Verification</SelectItem>
                      <SelectItem value="paid">Paid (Activates Pro)</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">UTR / Reference No.</Label><Input value={editing.utr_number || ''} onChange={(e) => setEditing({ ...editing, utr_number: e.target.value })} className="font-mono text-xs" /></div>
                <div><Label className="text-xs">UPI ID</Label><Input value={editing.upi_id || ''} onChange={(e) => setEditing({ ...editing, upi_id: e.target.value })} className="font-mono text-xs" /></div>
              </div>
              <div><Label className="text-xs">Notes</Label><Input value={editing.notes || ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></div>
              <DialogFooter className="pt-2"><Button type="submit" className="bg-[#0A6E3B] hover:bg-[#075030] text-white rounded-full">Save Changes</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------- User Profile Modal with PII Reveal & Impersonation ----------------
export function UserProfileModal({ userId, open, onOpenChange }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [revealModal, setRevealModal] = useState(false);
  const [revealField, setRevealField] = useState(null);
  const [revealReason, setRevealReason] = useState('');
  const [revealLoading, setRevealLoading] = useState(false);
  const [unmaskedValues, setUnmaskedValues] = useState({});
  const { refresh } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (open && userId) {
      setLoading(true);
      setUnmaskedValues({});
      api.get(`/admin/users/${userId}/full-profile`)
        .then(r => setProfile(r.data))
        .catch(() => toast.error('Failed to load user profile'))
        .finally(() => setLoading(false));
    } else {
      setProfile(null);
    }
  }, [open, userId]);

  const handleOpenReveal = (field) => {
    setRevealField(field);
    setRevealReason('');
    setRevealModal(true);
  };

  const handleConfirmReveal = async (e) => {
    e.preventDefault();
    if (!revealReason || revealReason.trim().length < 3) {
      toast.error('Administrative reason is strictly required (min 3 chars)');
      return;
    }
    setRevealLoading(true);
    try {
      const res = await api.post('/admin/audit/reveal', {
        entity_type: 'user',
        entity_id: userId,
        field: revealField,
        reason: revealReason.trim(),
      });
      setUnmaskedValues(prev => ({ ...prev, [revealField]: res.data.value }));
      toast.success(`Unmasked ${revealField}. Action recorded in immutable audit log.`);
      setRevealModal(false);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setRevealLoading(false);
    }
  };

  const handleImpersonate = async () => {
    if (!window.confirm(`Are you sure you want to login as this user? An immutable audit log will be created.`)) return;
    try {
      const res = await api.post(`/admin/impersonate/${userId}`);
      if (res.data?.token) {
        const currentToken = localStorage.getItem('lp_token');
        if (currentToken) {
          localStorage.setItem('admin_prev_token', currentToken);
        }
        localStorage.setItem('lp_token', res.data.token);
        localStorage.setItem('impersonated_user', JSON.stringify(res.data.user));
        toast.success(`Now acting as ${res.data.user.name || res.data.user.shop_name}`);
        onOpenChange(false);
        await refresh();
        if (res.data.user.role === 'vendor') {
          navigate('/vendor/dashboard');
        } else {
          navigate('/');
        }
      }
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  if (!open) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-white max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center justify-between">
              <span>Full User Profile</span>
              {profile?.user && (
                <Badge variant="outline" className="text-xs uppercase">
                  {profile.user.role}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {loading || !profile ? (
            <div className="py-12 text-center text-stone-400 text-xs">Loading comprehensive profile...</div>
          ) : (
            <div className="space-y-4 text-xs">
              {/* User header */}
              <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="font-semibold text-stone-900 text-sm">
                    {profile.user.name || profile.user.shop_name}
                  </div>
                  <div className="text-stone-500 font-mono text-[11px] mt-0.5">
                    User ID: {profile.user.id || userId}
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={handleImpersonate}
                  className="rounded-full bg-purple-700 hover:bg-purple-800 text-white text-xs h-8"
                >
                  <UserCheck size={13} className="mr-1.5" /> Impersonate User
                </Button>
              </div>

              {/* Masked PII details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-amber-50/40 rounded-xl border border-amber-200">
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-stone-600 uppercase">Email Address (Masked)</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-stone-900 font-medium">
                      {unmaskedValues.email || profile.user.email}
                    </span>
                    {!unmaskedValues.email && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenReveal('email')}
                        className="h-6 px-2 text-[10px] rounded border-amber-300 text-amber-900 hover:bg-amber-100"
                        title="Audited reveal"
                      >
                        <Lock size={10} className="mr-1" /> Reveal
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-stone-600 uppercase">Phone Number (Masked)</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-stone-900 font-medium">
                      {unmaskedValues.phone || profile.user.phone || '—'}
                    </span>
                    {profile.user.phone && !unmaskedValues.phone && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenReveal('phone')}
                        className="h-6 px-2 text-[10px] rounded border-amber-300 text-amber-900 hover:bg-amber-100"
                        title="Audited reveal"
                      >
                        <Lock size={10} className="mr-1" /> Reveal
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Activity metrics */}
              <div className="space-y-2">
                <div className="font-semibold text-stone-900">Platform Activity & Engagement</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-100">
                    <div className="text-[10px] text-stone-500 uppercase">Orders</div>
                    <div className="text-base font-bold font-display text-stone-900 mt-0.5">{profile.activity?.orders_count ?? 0}</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-100">
                    <div className="text-[10px] text-stone-500 uppercase">Reviews</div>
                    <div className="text-base font-bold font-display text-stone-900 mt-0.5">{profile.activity?.reviews_count ?? 0}</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-100">
                    <div className="text-[10px] text-stone-500 uppercase">Grievances</div>
                    <div className="text-base font-bold font-display text-stone-900 mt-0.5">{profile.activity?.grievances_count ?? 0}</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-100">
                    <div className="text-[10px] text-stone-500 uppercase">HyperLocal Points</div>
                    <div className="text-base font-bold font-display text-emerald-700 mt-0.5">{profile.activity?.hyperlocal_points ?? 0}</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-emerald-50/50 border border-emerald-100">
                    <div className="text-[10px] text-emerald-800 uppercase">Verified Visits</div>
                    <div className="text-base font-bold font-display text-emerald-800 mt-0.5">{profile.activity?.verified_visits ?? 0}</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-emerald-50/50 border border-emerald-100">
                    <div className="text-[10px] text-emerald-800 uppercase">Attributed Sales</div>
                    <div className="text-base font-bold font-display text-emerald-800 mt-0.5">{profile.activity?.attributed_purchases ?? 0}</div>
                  </div>
                  <div className="col-span-2 p-2.5 rounded-lg bg-[#0A6E3B]/10 border border-[#0A6E3B]/20">
                    <div className="text-[10px] text-[#0A6E3B] uppercase font-semibold">Attributed Revenue</div>
                    <div className="text-base font-bold font-display text-[#0A6E3B] mt-0.5">₹{(profile.activity?.attributed_revenue ?? 0).toLocaleString()}</div>
                  </div>
                </div>
              </div>

              {/* Vendor stats if role is vendor */}
              {profile.vendor_stats && (
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-2">
                  <div className="font-semibold text-stone-900">Vendor Attribution Health</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-stone-700">
                    <div>Quality Score: <span className="font-bold">{profile.vendor_stats.quality_score}/100</span> ({profile.vendor_stats.quality_rating})</div>
                    <div>Baseline Daily Sales: <span className="font-bold">{profile.vendor_stats.baseline ? `₹${profile.vendor_stats.baseline}` : 'Not set'}</span></div>
                    <div>Products Listed: <span className="font-bold">{profile.vendor_stats.products_count}</span></div>
                    <div>Daily Sales Logged: <span className="font-bold">{profile.vendor_stats.sales_logged_count} days</span></div>
                  </div>
                </div>
              )}

              {/* Recent Sessions */}
              {profile.recent_sessions && profile.recent_sessions.length > 0 && (
                <div className="space-y-1.5">
                  <div className="font-semibold text-stone-900">Recent Attribution Sessions</div>
                  <div className="divide-y divide-stone-100 border border-stone-200 rounded-xl bg-white overflow-hidden">
                    {profile.recent_sessions.map((s, idx) => (
                      <div key={s.id || idx} className="p-2.5 flex items-center justify-between text-[11px]">
                        <div className="font-mono text-stone-800">{s.session_id}</div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">{s.intent_level}</Badge>
                          <Badge className="bg-stone-100 text-stone-800 border-0 text-[10px]">{s.attribution_status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* REVEAL PII JUSTIFICATION DIALOG */}
      <Dialog open={revealModal} onOpenChange={setRevealModal}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg flex items-center gap-2 text-amber-800">
              <ShieldCheck size={18} />
              Audited PII Reveal Request
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleConfirmReveal} className="space-y-3.5 text-xs py-1">
            <p className="text-stone-600">
              You are requesting to reveal unmasked <strong>{revealField}</strong> for User <strong>{userId}</strong>.
              Super Admin access requires a specific audit justification.
            </p>
            <div>
              <Label className="text-xs">Administrative Reason (Required)</Label>
              <Input
                placeholder="e.g. Investigating consumer grievance #GRV-0042 identity match"
                value={revealReason}
                onChange={(e) => setRevealReason(e.target.value)}
                required
                minLength={3}
                className="mt-1 text-xs"
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setRevealModal(false)} className="rounded-full text-xs">
                Cancel
              </Button>
              <Button type="submit" disabled={revealLoading} className="rounded-full bg-amber-800 hover:bg-amber-900 text-white text-xs">
                {revealLoading ? 'Logging & Revealing...' : 'Confirm & Reveal'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------- Audit Logs ----------------
export function AdminAuditLogs() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const params = { limit: 100 };
      if (actionFilter && actionFilter !== 'all') {
        params.action = actionFilter;
      }
      const res = await api.get('/admin/audit-logs', { params });
      setLogs(res.data.logs || []);
      setTotal(res.data.total || 0);
    } catch {
      toast.error('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [actionFilter]);

  return (
    <div>
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-stone-900">
            Super Admin Audit Trail
          </h1>
          <p className="text-stone-600 text-sm mt-1">
            Immutable, cryptographically verifiable log of all administrative actions, data reveals, and overrides.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-56 text-xs bg-white"><SelectValue placeholder="Filter by action" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions ({total})</SelectItem>
              <SelectItem value="reveal_sensitive_data">PII Reveals</SelectItem>
              <SelectItem value="impersonate_user">User Impersonations</SelectItem>
              <SelectItem value="attribution_dispute_resolved">Dispute Resolutions</SelectItem>
              <SelectItem value="bulk_verify">Bulk Verifications</SelectItem>
              <SelectItem value="bulk_unverify">Bulk Unverifications</SelectItem>
              <SelectItem value="bulk_activate">Bulk Product In-Stock</SelectItem>
              <SelectItem value="bulk_deactivate">Bulk Product Out-of-Stock</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={loadLogs} className="text-xs">
            <RefreshCw size={13} className={`mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-stone-200 bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-stone-50">
              <TableHead>Timestamp</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Target Entity</TableHead>
              <TableHead>Target Name</TableHead>
              <TableHead>Justification / Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="text-xs text-stone-500 whitespace-nowrap">
                  {log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}
                </TableCell>
                <TableCell className="text-xs font-mono text-stone-700">
                  {log.admin_email}
                </TableCell>
                <TableCell>
                  <Badge className={`text-[10px] border-0 ${
                    log.action === 'reveal_sensitive_data' ? 'bg-amber-100 text-amber-900' :
                    log.action === 'impersonate_user' ? 'bg-purple-100 text-purple-900' :
                    log.action === 'attribution_dispute_resolved' ? 'bg-blue-100 text-blue-900' :
                    log.action?.startsWith('bulk_') ? 'bg-emerald-100 text-emerald-900' :
                    'bg-stone-100 text-stone-800'
                  }`}>
                    {log.action?.replace(/_/g, ' ')}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-stone-600 font-mono">
                  {log.entity_type} {log.entity_id ? `(${String(log.entity_id).substring(0, 10)}…)` : ''}
                </TableCell>
                <TableCell className="text-xs font-medium text-stone-900">
                  {log.target_name || log.entity_id || '—'}
                </TableCell>
                <TableCell className="text-xs text-stone-700 max-w-xs">
                  {log.reason || log.justification || (log.dispute_action ? `Action: ${log.dispute_action}` : '—')}
                </TableCell>
              </TableRow>
            ))}
            {logs.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-stone-400 text-xs">
                  {loading ? 'Loading audit records...' : 'No audit records match the selected filter.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
