import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';

export function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <div className="text-stone-500 text-sm">Loading…</div>
      </div>
    );
  }
  if (!user) {
    const to = role === 'vendor' ? '/auth/vendor' : '/auth/consumer';
    return <Navigate to={to} state={{ from: location }} replace />;
  }
  if (role && user.role !== role) {
    const to = role === 'vendor' ? '/auth/vendor' : '/auth/consumer';
    return <Navigate to={to} state={{ from: location, roleMismatch: true, requiredRole: role }} replace />;
  }
  return children;
}
