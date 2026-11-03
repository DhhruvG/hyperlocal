import React from 'react';
import { NavLink } from 'react-router-dom';
import { useLang } from '@/lib/lang';
import { Home, Search, Map, Megaphone, Bookmark, MessageSquare, User } from 'lucide-react';

const items = [
  { to: '/', icon: Home, key: 'home' },
  { to: '/search', icon: Search, key: 'search' },
  { to: '/map', icon: Map, key: 'map' },
  { to: '/i-need', icon: Megaphone, key: 'iNeed' },
  { to: '/saved', icon: Bookmark, key: 'saved' },
  { to: '/messages', icon: MessageSquare, key: 'messages' },
  { to: '/profile', icon: User, key: 'profile' },
];

export default function BottomNav() {
  const { t } = useLang();
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-stone-200 pb-safe">
      <div className="grid grid-cols-7">
        {items.map(({ to, icon: Icon, key }) => (
          <NavLink
            key={key} to={to} end={to === '/'}
            data-testid={`bottomnav-${key}`}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-2 text-[10px] transition-colors ${isActive ? 'text-[#0A6E3B]' : 'text-stone-500'}`
            }
          >
            <Icon size={18} strokeWidth={2} />
            <span className="mt-0.5">{t(key)}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
