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
import { WorkshopParts } from './pages/workshop/WorkshopParts';
import { VehicleProfile } from './pages/vehicles/VehicleProfile';
import { SmartSearchSuggestions } from './components/layout/SmartSearchSuggestions';
import { AccountingScreen } from './pages/accounting/AccountingScreen';

const LoadingScreen: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50" role="status">
    <div className="h-9 w-9 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
  </div>
);

const PermissionGate: React.FC<{ permission: string | string[]; children: React.ReactNode }> = ({ permission, children }) => {
  const { hasPermission } = useAuth();
  const allowed = Array.isArray(permission) ? permission.some(hasPermission) : hasPermission(permission);
  return allowed
    ? <>{children}</>
    : <div role="alert" className="rounded-2xl border border-rose-200 bg-white p-8 text-center text-sm font-semibold text-rose-700">ليس لديك صلاحية لعرض هذه الصفحة.</div>;
};

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
        <Route index element={<PermissionGate permission="view_dashboard"><Dashboard /></PermissionGate>} />
        <Route path="items" element={<PermissionGate permission="manage_items"><ItemsCatalog /></PermissionGate>} />
        <Route path="customers" element={<PermissionGate permission={['manage_sales', 'manage_workshop', 'manage_purchases']}><CustomersVehicles /></PermissionGate>} />
        <Route path="vehicles" element={<PermissionGate permission={['manage_workshop', 'manage_sales']}><CustomersVehicles /></PermissionGate>} />
        <Route path="vehicles/:id" element={<PermissionGate permission={['manage_workshop', 'manage_sales']}><VehicleProfile /></PermissionGate>} />
        <Route path="suppliers" element={<PermissionGate permission={['manage_purchases', 'manage_expenses']}><Suppliers /></PermissionGate>} />
        <Route path="employees" element={<PermissionGate permission={['manage_employees', 'manage_payroll']}><EmployeesScreen /></PermissionGate>} />
        <Route path="financials" element={<PermissionGate permission={['manage_expenses', 'manage_cashbox', 'manage_banks']}><FinancialsScreen /></PermissionGate>} />
        <Route path="accounting" element={<PermissionGate permission="manage_accounting"><AccountingScreen /></PermissionGate>} />
        <Route path="warehouses" element={<PermissionGate permission="manage_inventory"><InventoryManagement /></PermissionGate>} />
        <Route path="pos" element={<PermissionGate permission="pos_access"><PosScreen /></PermissionGate>} />
        <Route path="sales" element={<PermissionGate permission="manage_sales"><SalesList /></PermissionGate>} />
        <Route path="purchases" element={<PermissionGate permission="manage_purchases"><PurchasesList /></PermissionGate>} />
        <Route path="reports" element={<PermissionGate permission="view_reports"><ReportsCenter /></PermissionGate>} />
        <Route path="profits" element={<PermissionGate permission="view_profits"><ProfitsDashboard /></PermissionGate>} />
        <Route path="settings" element={<PermissionGate permission={['manage_settings', 'view_audit_logs']}><SettingsScreen /></PermissionGate>} />
        <Route path="workshop/parts" element={<PermissionGate permission={['manage_workshop', 'manage_jobcards', 'issue_parts', 'manage_inventory']}><WorkshopParts /></PermissionGate>} />
        <Route path="workshop/job-cards" element={<PermissionGate permission="manage_workshop"><JobCardsList /></PermissionGate>} />
        <Route path="workshop/job-cards/:id" element={<PermissionGate permission="manage_workshop"><JobCardDetail /></PermissionGate>} />
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
