import React from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { Navbar } from './components/layout/Navbar';
import { QuickSidebar } from './components/layout/QuickSidebar';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { CustomersVehicles } from './pages/master/CustomersVehicles';
import { ItemsCatalog } from './pages/master/ItemsCatalog';
import { Suppliers } from './pages/master/Suppliers';
import { EmployeesScreen } from './pages/hr/EmployeesScreen';
import { FinancialsScreen } from './pages/financials/FinancialsScreen';
import { InventoryManagement } from './pages/inventory/InventoryManagement';
import { PosScreen } from './pages/sales/PosScreen';
import { SalesList } from './pages/sales/SalesList';
import { PurchasesList } from './pages/purchases/PurchasesList';
import { ReportsCenter } from './pages/reports/ReportsCenter';
import { SettingsScreen } from './pages/settings/SettingsScreen';
import { ProfitsDashboard } from './pages/profits/ProfitsDashboard';
import { JobCardDetail } from './pages/workshop/JobCardDetail';
import { JobCardsList } from './pages/workshop/JobCardsList';
import { VehicleProfile } from './pages/vehicles/VehicleProfile';
import { SmartSearchSuggestions } from './components/layout/SmartSearchSuggestions';

const LoadingScreen: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50" role="status">
    <div className="h-9 w-9 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
  </div>
);

const ProtectedLayout: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50">
      <Navbar />
      <SmartSearchSuggestions />
      <div className="mx-auto flex max-w-[1700px] items-start gap-4 px-4 py-5">
        <QuickSidebar />
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

const AppRoutes: React.FC = () => {
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={loading ? <LoadingScreen /> : user ? <Navigate to="/" replace /> : <Login />}
      />
      <Route element={<ProtectedLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="items" element={<ItemsCatalog />} />
        <Route path="customers" element={<CustomersVehicles />} />
        <Route path="vehicles" element={<CustomersVehicles />} />
        <Route path="vehicles/:id" element={<VehicleProfile />} />
        <Route path="suppliers" element={<Suppliers />} />
        <Route path="employees" element={<EmployeesScreen />} />
        <Route path="financials" element={<FinancialsScreen />} />
        <Route path="warehouses" element={<InventoryManagement />} />
        <Route path="pos" element={<PosScreen />} />
        <Route path="sales" element={<SalesList />} />
        <Route path="purchases" element={<PurchasesList />} />
        <Route path="reports" element={<ReportsCenter />} />
        <Route path="profits" element={<ProfitsDashboard />} />
        <Route path="settings" element={<SettingsScreen />} />
        <Route path="workshop/job-cards" element={<JobCardsList />} />
        <Route path="workshop/job-cards/:id" element={<JobCardDetail />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

const App: React.FC = () => (
  <ToastProvider>
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  </ToastProvider>
);

export default App;
