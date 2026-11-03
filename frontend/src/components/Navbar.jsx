import React, { useEffect, useState, useCallback } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useLang } from '@/lib/lang';
import { api } from '@/lib/api';
import { NAV } from '@/constants/testIds';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Sprout, ChevronDown, LogOut, MapPin, LayoutDashboard, ShoppingBag, Store, ShieldCheck } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { lang, setLang, t } = useLang();
  const navigate = useNavigate();
  const [cartCount, setCartCount] = useState(0);

  const fetchCartCount = useCallback(async () => {
    if (!user) {
      setCartCount(0);
      return;
    }
    try {
      const res = await api.get('/cart');
      const count = res.data?.items?.reduce((sum, it) => sum + (it.quantity || 1), 0) || 0;
      setCartCount(count);
    } catch {
      // ignore
    }
  }, [user]);

  useEffect(() => {
    fetchCartCount();
    const handleCartUpdate = () => fetchCartCount();
    window.addEventListener('cart_updated', handleCartUpdate);
    return () => window.removeEventListener('cart_updated', handleCartUpdate);
  }, [fetchCartCount]);

  const onLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <header className="glass-nav sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 md:px-8 h-14 md:h-16 flex items-center justify-between">
        <Link to="/" data-testid={NAV.logo} className="flex items-center gap-2 group shrink-0">
          <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-[#0A6E3B] text-white grid place-items-center shadow-sm">
            <Sprout size={16} strokeWidth={2.5} />
          </div>
          <div className="leading-tight">
            <div className="font-display text-base md:text-lg font-semibold text-stone-900">LocalPrice</div>
            <div className="text-[9px] md:text-[10px] uppercase tracking-[0.2em] text-stone-500 flex items-center gap-1"><MapPin size={9} /> Dehradun</div>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          <NavLink to="/search" data-testid={NAV.searchLink} className={({isActive}) => `px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive ? 'text-[#0A6E3B] bg-emerald-50' : 'text-stone-700 hover:text-[#0A6E3B]'}`}>{t('navFindProducts')}</NavLink>
          <NavLink to="/map" className={({isActive}) => `px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive ? 'text-[#0A6E3B] bg-emerald-50' : 'text-stone-700 hover:text-[#0A6E3B]'}`}>{t('navMap')}</NavLink>
          <NavLink to="/i-need" className={({isActive}) => `px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive ? 'text-[#0A6E3B] bg-emerald-50' : 'text-stone-700 hover:text-[#0A6E3B]'}`}>{t('navINeed')}</NavLink>
          {user && user.role === 'vendor' ? (
            <NavLink to="/vendor/dashboard" data-testid={NAV.dashboardLink} className={({isActive}) => `px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive ? 'text-[#0A6E3B] bg-emerald-50' : 'text-stone-700 hover:text-[#0A6E3B]'}`}>
              <span className="inline-flex items-center gap-1.5"><LayoutDashboard size={14} /> {t('navDashboard')}</span>
            </NavLink>
          ) : (
            <NavLink to="/vendor/dashboard" className={({isActive}) => `px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive ? 'text-[#0A6E3B] bg-emerald-50' : 'text-stone-700 hover:text-[#0A6E3B]'}`}>
              <span className="inline-flex items-center gap-1.5"><Store size={14} /> Vendor Panel</span>
            </NavLink>
          )}
        </nav>

        <div className="flex items-center gap-2">
          {/* Language toggle */}
          <div className="rounded-full border border-stone-200 bg-white p-0.5 flex text-[10px] font-semibold">
            <button
              data-testid="lang-en" onClick={() => setLang('en')}
              className={`px-2 py-1 rounded-full transition-colors ${lang === 'en' ? 'bg-[#0A6E3B] text-white' : 'text-stone-600'}`}
              title="English"
            >EN</button>
            <button
              data-testid="lang-hi" onClick={() => setLang('hi')}
              className={`px-2 py-1 rounded-full transition-colors ${lang === 'hi' ? 'bg-[#0A6E3B] text-white' : 'text-stone-600'}`}
              title="हिन्दी (Hindi)"
            >हिं</button>
            <button
              data-testid="lang-hinglish" onClick={() => setLang('hinglish')}
              className={`px-2 py-1 rounded-full transition-colors ${lang === 'hinglish' ? 'bg-[#0A6E3B] text-white' : 'text-stone-600'}`}
              title="Hinglish"
            >Hinglish</button>
          </div>

          {/* Cart button */}
          <Link
            to="/cart"
            className="relative p-2 rounded-full text-stone-700 hover:text-[#0A6E3B] hover:bg-stone-100 transition-colors"
            title="Shopping Cart"
            data-testid="navbar-cart-link"
          >
            <ShoppingBag size={18} />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#0A6E3B] text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {cartCount > 9 ? '9+' : cartCount}
              </span>
            )}
          </Link>

          {!user ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-stone-700 hover:text-[#0A6E3B] hidden sm:inline-flex">
                    {t('signIn')} <ChevronDown size={14} className="ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-white">
                  <DropdownMenuLabel>Choose account type</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild><Link to="/auth/consumer" data-testid={NAV.consumerLoginLink}>I'm a Shopper</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/auth/vendor" data-testid={NAV.vendorLoginLink}>I'm a Vendor</Link></DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/admin/login" className="flex items-center text-emerald-800 font-medium">
                      <ShieldCheck size={14} className="mr-1.5 text-emerald-700" /> Admin Console
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Link to="/auth/vendor?mode=signup"><Button data-testid={NAV.ctaGetStarted} size="sm" className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white">{t('listShop')}</Button></Link>
            </>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-full border-stone-300">
                  {user.name?.split(' ')[0]} <ChevronDown size={14} className="ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-white">
                <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link to="/profile">Profile</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/messages">Messages</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/grievances">Help & Grievances</Link></DropdownMenuItem>
                {user.role === 'consumer' && (<>
                  <DropdownMenuItem asChild><Link to="/orders">My Orders</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/cart">My Cart</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/saved">Saved</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/i-need">My requests</Link></DropdownMenuItem>
                </>)}
                {user.role === 'vendor' && (<>
                  <DropdownMenuItem asChild><Link to="/vendor/dashboard">Dashboard</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/vendor/analytics">Sales Impact & Attribution</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/vendor/products">Products</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/vendor/pricing">Upgrade</Link></DropdownMenuItem>
                </>)}
                {user.role === 'admin' && (<>
                  <DropdownMenuItem asChild><Link to="/admin" className="font-semibold text-emerald-800"><ShieldCheck size={14} className="mr-1.5 text-emerald-700" /> Admin Console</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/admin/ai-control-center">AI Control Center</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/admin/smart-features">Smart Features</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/admin/billing">Marketplace Billing</Link></DropdownMenuItem>
                </>)}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout} data-testid={NAV.logoutButton}>
                  <LogOut size={14} className="mr-2" /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
}
