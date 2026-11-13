import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import {
  Home, Search, Megaphone, ShoppingBag, User,
  Package, TrendingUp, MoreHorizontal, Users
} from 'lucide-react';

export default function BottomNav() {
  const { user } = useAuth();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const currentTab = searchParams.get('tab') || 'home';

  const isVendor = user?.role === 'vendor';
  const isCartVendor = isVendor && user?.vendor_type === 'cart_vendor';

  let items = [
    { to: '/', label: 'Home', icon: Home, key: 'home', match: (p) => p === '/' },
    { to: '/search', label: 'Explore', icon: Search, key: 'search', match: (p) => p.startsWith('/search') || p.startsWith('/map') },
    { to: '/i-need', label: 'Requests', icon: Megaphone, key: 'iNeed', match: (p) => p.startsWith('/i-need') },
    { to: '/orders', label: 'Orders', icon: ShoppingBag, key: 'orders', match: (p) => p.startsWith('/orders') || p.startsWith('/cart') },
    { to: '/profile', label: 'Profile', icon: User, key: 'profile', match: (p) => p.startsWith('/profile') || p.startsWith('/saved') || p.startsWith('/messages') },
  ];

  if (isCartVendor) {
    items = [
      { to: '/vendor/dashboard?tab=home', label: 'Home', icon: Home, key: 'home', match: (p) => p === '/vendor/dashboard' && currentTab === 'home' },
      { to: '/vendor/products', label: 'Products', icon: Package, key: 'products', match: (p) => p.startsWith('/vendor/products') },
      { to: '/vendor/dashboard?tab=customers', label: 'Customers', icon: Users, key: 'customers', match: (p) => (p === '/vendor/dashboard' && currentTab === 'customers') || p.startsWith('/i-need') || p.startsWith('/messages') },
      { to: '/vendor/dashboard?tab=growth', label: 'Growth', icon: TrendingUp, key: 'growth', match: (p) => (p === '/vendor/dashboard' && currentTab === 'growth') || p.startsWith('/vendor/analytics') },
      { to: '/vendor/dashboard?tab=more', label: 'More', icon: MoreHorizontal, key: 'more', match: (p) => (p === '/vendor/dashboard' && currentTab === 'more') || p.startsWith('/profile') || p.startsWith('/vendor/pricing') },
    ];
  } else if (isVendor) {
    items = [
      { to: '/vendor/dashboard?tab=home', label: 'Home', icon: Home, key: 'home', match: (p) => p === '/vendor/dashboard' && currentTab === 'home' },
      { to: '/vendor/products', label: 'Products', icon: Package, key: 'products', match: (p) => p.startsWith('/vendor/products') },
      { to: '/vendor/dashboard?tab=orders', label: 'Orders', icon: ShoppingBag, key: 'orders', match: (p) => p === '/vendor/dashboard' && currentTab === 'orders' },
      { to: '/vendor/dashboard?tab=growth', label: 'Growth', icon: TrendingUp, key: 'growth', match: (p) => (p === '/vendor/dashboard' && currentTab === 'growth') || p.startsWith('/vendor/analytics') },
      { to: '/vendor/dashboard?tab=more', label: 'More', icon: MoreHorizontal, key: 'more', match: (p) => (p === '/vendor/dashboard' && currentTab === 'more') || p.startsWith('/profile') || p.startsWith('/vendor/branches') || p.startsWith('/vendor/pricing') },
    ];
  }

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-stone-200 pb-safe shadow-sm">
      <div className="grid grid-cols-5">
        {items.map(({ to, label, icon: Icon, key, match }) => {
          const active = match ? match(location.pathname) : location.pathname === to;
          return (
            <NavLink
              key={key}
              to={to}
              data-testid={`bottomnav-${key}`}
              className={() =>
                `flex flex-col items-center justify-center py-2.5 text-[11px] font-medium transition-colors ${
                  active ? 'text-[#0A6E3B] font-semibold' : 'text-stone-500 hover:text-stone-800'
                }`
              }
            >
              <Icon size={20} strokeWidth={active ? 2.4 : 2} />
              <span className="mt-0.5">{label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
