import React from 'react';
import '@/App.css';
import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import { LanguageProvider } from '@/lib/lang';
import { Toaster } from '@/components/ui/sonner';
import Navbar from '@/components/Navbar';
import BottomNav from '@/components/BottomNav';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import ErrorBoundary from '@/components/ErrorBoundary';

import HomePage from '@/pages/HomePage';
import ConsumerAuth from '@/pages/ConsumerAuth';
import VendorAuth from '@/pages/VendorAuth';
import ConsumerSearch from '@/pages/ConsumerSearch';
import VendorDashboard from '@/pages/VendorDashboard';
import VendorProducts from '@/pages/VendorProducts';
import VendorPricing from '@/pages/VendorPricing';
import VendorBranches from '@/pages/VendorBranches';
import VendorProfilePage from '@/pages/VendorProfilePage';
import INeedPage from '@/pages/INeedPage';
import SavedPage from '@/pages/SavedPage';
import { MessagesInbox, MessagesThread } from '@/pages/Messages';
import ProfilePage from '@/pages/ProfilePage';
import MapPage from '@/pages/MapPage';

import AdminLogin from '@/pages/admin/AdminLogin';
import {
  AdminLayout, AdminOverview, AdminVendors, AdminConsumers, AdminProducts,
  AdminReviews, AdminMessages, AdminRequests, AdminOrders, AdminAuditLogs,
} from '@/pages/admin/AdminPanel';
import { AdminGrievances, AdminGrievanceDetail, AdminKnowledge } from '@/pages/admin/AdminGrievances';
import AdminPaymentsSettings from '@/pages/admin/AdminPaymentsSettings';
import AdminAttribution from '@/pages/admin/AdminAttribution';
import AdminSmartFeatures from '@/pages/admin/AdminSmartFeatures';
import AdminAIPlayground from '@/pages/admin/AdminAIPlayground';
import AdminVoiceInventory from '@/pages/admin/AdminVoiceInventory';
import AdminAIControlCenter from '@/pages/admin/AdminAIControlCenter';
import GrievancesPage from '@/pages/GrievancesPage';
import GrievanceDetailPage from '@/pages/GrievanceDetailPage';
import AIAssistant from '@/components/AIAssistant';
import VendorBusinessImpact from '@/pages/VendorBusinessImpact';
import VendorQRPage from '@/pages/VendorQRPage';
import CustomerVisitPrompt from '@/components/CustomerVisitPrompt';
import CartPage from '@/pages/CartPage';
import CustomerOrdersPage from '@/pages/CustomerOrdersPage';
import AdminBilling from '@/pages/admin/AdminBilling';

function Layout() {
  return (
    <div className="App min-h-screen bg-[#FAFAF9]">
      <Navbar />
      <main><Outlet /></main>
      <BottomNav />
      <AIAssistant />
      <CustomerVisitPrompt />
      <Toaster position="top-right" richColors />
    </div>
  );
}

function AdminRouteLayout() {
  return (
    <ErrorBoundary title="Super Admin Panel Error">
      <AdminLayout />
      <AIAssistant />
      <Toaster position="top-right" richColors />
    </ErrorBoundary>
  );
}

function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/search" element={<ConsumerSearch />} />
              <Route path="/vendors/:id" element={<VendorProfilePage />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/i-need" element={<INeedPage />} />
              <Route path="/saved" element={<SavedPage />} />
              <Route path="/messages" element={<MessagesInbox />} />
              <Route path="/messages/:otherId" element={<MessagesThread />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/grievances" element={<GrievancesPage />} />
              <Route path="/grievances/:id" element={<GrievanceDetailPage />} />

              <Route path="/cart" element={<CartPage />} />
              <Route path="/orders" element={<CustomerOrdersPage />} />

              <Route path="/auth/consumer" element={<ConsumerAuth />} />
              <Route path="/auth/vendor" element={<VendorAuth />} />

              <Route path="/vendor/dashboard" element={<ProtectedRoute role="vendor"><VendorDashboard /></ProtectedRoute>} />
              <Route path="/vendor/analytics" element={<ProtectedRoute role="vendor"><VendorBusinessImpact /></ProtectedRoute>} />
              <Route path="/vendor/business-impact" element={<ProtectedRoute role="vendor"><VendorBusinessImpact /></ProtectedRoute>} />
              <Route path="/vendor/products" element={<ProtectedRoute role="vendor"><VendorProducts /></ProtectedRoute>} />
              <Route path="/vendor/pricing" element={<VendorPricing />} />
              <Route path="/vendor/branches" element={<ProtectedRoute role="vendor"><VendorBranches /></ProtectedRoute>} />
              <Route path="/qr/:vendorId" element={<VendorQRPage />} />
              <Route path="/v/:vendorId/checkin" element={<VendorQRPage />} />
            </Route>

            {/* Admin — separate chrome, no public nav */}
            <Route path="/admin/login" element={<><AdminLogin /><Toaster position="top-right" richColors /></>} />
            <Route path="/admin" element={<AdminRouteLayout />}>
              <Route index element={<AdminOverview />} />
              <Route path="ai-control-center" element={<AdminAIControlCenter />} />
              <Route path="ai-knowledge" element={<AdminAIControlCenter defaultTab="knowledge" />} />
              <Route path="voice-inventory" element={<AdminVoiceInventory />} />
              <Route path="smart-features" element={<AdminSmartFeatures />} />
              <Route path="ai-playground" element={<AdminAIPlayground />} />
              <Route path="attribution" element={<AdminAttribution />} />
              <Route path="audit-logs" element={<AdminAuditLogs />} />
              <Route path="billing" element={<AdminBilling />} />
              <Route path="vendors" element={<AdminVendors />} />
              <Route path="consumers" element={<AdminConsumers />} />
              <Route path="products" element={<AdminProducts />} />
              <Route path="reviews" element={<AdminReviews />} />
              <Route path="messages" element={<AdminMessages />} />
              <Route path="requests" element={<AdminRequests />} />
              <Route path="orders" element={<AdminOrders />} />
              <Route path="grievances" element={<AdminGrievances />} />
              <Route path="grievances/:id" element={<AdminGrievanceDetail />} />
              <Route path="knowledge" element={<AdminKnowledge />} />
              <Route path="payments" element={<AdminPaymentsSettings />} />
            </Route>
          </Routes>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}

export default App;
