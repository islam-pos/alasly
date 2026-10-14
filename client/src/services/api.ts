// API Client for AutoCare ERP
import type {
  NotificationConnectionInput,
  NotificationConnectionTest,
  NotificationIntegrationInput,
  NotificationIntegrationStatus,
  NotificationQrStatus,
  NotificationTelegramQrStatus,
} from '../types/notifications';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

class ApiError extends Error {
  response: { data: { error: string } };

  constructor(message: string) {
    super(message);
    this.name = 'ApiError';
    this.response = { data: { error: message } };
  }
}

function getHeaders(): HeadersInit {
  const token = localStorage.getItem('autocare_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'حدث خطأ في الاتصال بالخادم' }));
    throw new ApiError(errorData.error || `Error ${res.status}: ${res.statusText}`);
  }
  const payload = await res.json();
  if (Array.isArray(payload)) return { data: payload } as T;
  if (payload && typeof payload === 'object' && !('data' in payload)) {
    return { ...payload, data: payload } as T;
  }
  return payload as T;
}

const apiClient = {
  // Auth
  login: (credentials: any) =>
    fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    }).then((res) => handleResponse<any>(res)),

  getMe: () =>
    fetch(`${BASE_URL}/auth/me`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  getUsers: () =>
    fetch(`${BASE_URL}/auth/users`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  createUser: (data: any) =>
    fetch(`${BASE_URL}/auth/users`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  updateUser: (id: string, data: any) =>
    fetch(`${BASE_URL}/auth/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  deleteUser: (id: string) =>
    fetch(`${BASE_URL}/auth/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getHeaders(),
    }).then((res) => handleResponse<any>(res)),

  resetUserPassword: (id: string, password: string) =>
    fetch(`${BASE_URL}/auth/users/${encodeURIComponent(id)}/password`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ password }),
    }).then((res) => handleResponse<any>(res)),

  // Dashboard
  getDashboardStats: () =>
    fetch(`${BASE_URL}/dashboard/stats`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  getDashboardCharts: () =>
    fetch(`${BASE_URL}/dashboard/charts`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  getDashboardAlerts: () =>
    fetch(`${BASE_URL}/dashboard/alerts`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  // Master Data
  getCompany: () =>
    fetch(`${BASE_URL}/master/company`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  updateCompany: (data: any) =>
    fetch(`${BASE_URL}/master/company`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  getBranches: () =>
    fetch(`${BASE_URL}/master/branches`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  createBranch: (data: any) =>
    fetch(`${BASE_URL}/master/branches`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  getCategories: () =>
    fetch(`${BASE_URL}/master/categories`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  getUnits: () =>
    fetch(`${BASE_URL}/master/units`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  getWarehouses: () =>
    fetch(`${BASE_URL}/master/warehouses`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  getSuppliers: () =>
    fetch(`${BASE_URL}/master/suppliers`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  createSupplier: (data: any) =>
    fetch(`${BASE_URL}/master/suppliers`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  updateSupplier: (id: string, data: any) =>
    fetch(`${BASE_URL}/master/suppliers/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  getCustomers: () =>
    fetch(`${BASE_URL}/master/customers`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  createCustomer: (data: any) =>
    fetch(`${BASE_URL}/master/customers`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  updateCustomer: (id: string, data: any) =>
    fetch(`${BASE_URL}/master/customers/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  getVehicles: () =>
    fetch(`${BASE_URL}/master/vehicles`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  getVehicleProfile: (id: string) =>
    fetch(`${BASE_URL}/master/vehicles/${id}`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  getMaintenanceReminders: (vehicleId: string) =>
    fetch(`${BASE_URL}/master/vehicles/${encodeURIComponent(vehicleId)}/reminders`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  createMaintenanceReminder: (vehicleId: string, data: { serviceName: string; dueDate?: string; dueOdometer?: number; notes?: string }) =>
    fetch(`${BASE_URL}/master/vehicles/${encodeURIComponent(vehicleId)}/reminders`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  updateMaintenanceReminder: (vehicleId: string, reminderId: string, status: 'PENDING' | 'COMPLETED' | 'CANCELLED') =>
    fetch(`${BASE_URL}/master/vehicles/${encodeURIComponent(vehicleId)}/reminders/${encodeURIComponent(reminderId)}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ status }),
    }).then((res) => handleResponse<any>(res)),

  createVehicle: (data: any) =>
    fetch(`${BASE_URL}/master/vehicles`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  getEmployees: () =>
    fetch(`${BASE_URL}/master/employees`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  createEmployee: (data: any) =>
    fetch(`${BASE_URL}/master/employees`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  updateEmployee: (id: string, data: any) =>
    fetch(`${BASE_URL}/master/employees/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  deleteEmployee: (id: string) =>
    fetch(`${BASE_URL}/master/employees/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getHeaders(),
    }).then((res) => handleResponse<any>(res)),

  getJobs: () =>
    fetch(`${BASE_URL}/master/jobs`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  getRoles: () =>
    fetch(`${BASE_URL}/master/roles`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  updateRolePermissions: (roleId: string, permissions: string[]) =>
    fetch(`${BASE_URL}/master/roles/${roleId}/permissions`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ permissions }),
    }).then((res) => handleResponse<any>(res)),

  // Items
  getItems: (params?: { q?: string; categoryId?: string; lowStock?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.q) query.append('q', params.q);
    if (params?.categoryId) query.append('categoryId', params.categoryId);
    if (params?.lowStock) query.append('lowStock', 'true');
    return fetch(`${BASE_URL}/items?${query.toString()}`, { headers: getHeaders() }).then((res) => handleResponse<any>(res));
  },

  getItemById: (id: string) =>
    fetch(`${BASE_URL}/items/${id}`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  lookupItemByBarcode: (code: string) =>
    fetch(`${BASE_URL}/items/lookup/${encodeURIComponent(code)}`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  createItem: (data: any) =>
    fetch(`${BASE_URL}/items`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  importItems: (rows: Record<string, unknown>[]) =>
    fetch(`${BASE_URL}/items/import`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ rows }),
    }).then((res) => handleResponse<{ created: number; duplicates: { row: number; sku: string; reason: string }[]; errors: { row: number; sku?: string; reason: string }[] }>(res)),

  updateItem: (id: string, data: any) =>
    fetch(`${BASE_URL}/items/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  // Purchases
  getPurchaseRequests: () =>
    fetch(`${BASE_URL}/purchases/requests`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  createPurchaseRequest: (data: any) =>
    fetch(`${BASE_URL}/purchases/requests`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  getPurchaseInvoices: () =>
    fetch(`${BASE_URL}/purchases/invoices`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  createPurchaseInvoice: (data: any) =>
    fetch(`${BASE_URL}/purchases/invoices`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  getSupplierStatement: (id: string) =>
    fetch(`${BASE_URL}/purchases/suppliers/${id}/statement`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  getAllSupplierStatements: () =>
    fetch(`${BASE_URL}/purchases/suppliers/statement`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  // Sales & POS
  getSalesInvoices: (params?: { type?: string; customerId?: string }) => {
    const query = new URLSearchParams();
    if (params?.type) query.append('type', params.type);
    if (params?.customerId) query.append('customerId', params.customerId);
    return fetch(`${BASE_URL}/sales/invoices?${query.toString()}`, { headers: getHeaders() }).then((res) => handleResponse<any>(res));
  },

  getSalesInvoiceById: (id: string) =>
    fetch(`${BASE_URL}/sales/invoices/${id}`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  posCheckout: (data: any) =>
    fetch(`${BASE_URL}/sales/pos`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  createSalesQuotation: (data: any) =>
    fetch(`${BASE_URL}/sales/quotations`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  convertSalesQuotation: (quotationId: string, payment?: { paymentMethod: string; cashPaid: number; cardPaid: number }) =>
    fetch(`${BASE_URL}/sales/invoices/${encodeURIComponent(quotationId)}/convert-quotation`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payment || {}),
    }).then((res) => handleResponse<any>(res)),

  createSalesReturn: (data: any) =>
    fetch(`${BASE_URL}/sales/returns`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  getCustomerStatement: (id: string) =>
    fetch(`${BASE_URL}/sales/customers/${id}/statement`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  // Workshop & Job Cards
  getJobCards: (params?: { status?: string; customerId?: string; vehicleId?: string; q?: string }) => {
    const query = new URLSearchParams();
    if (params?.status) query.append('status', params.status);
    if (params?.customerId) query.append('customerId', params.customerId);
    if (params?.vehicleId) query.append('vehicleId', params.vehicleId);
    if (params?.q) query.append('q', params.q);
    return fetch(`${BASE_URL}/workshop/job-cards?${query.toString()}`, { headers: getHeaders() }).then((res) => handleResponse<any>(res));
  },

  getJobCardById: (id: string) =>
    fetch(`${BASE_URL}/workshop/job-cards/${id}`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  createJobCard: (data: any) =>
    fetch(`${BASE_URL}/workshop/job-cards`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  updateJobCardStatus: (id: string, status: string, notes?: string) =>
    fetch(`${BASE_URL}/workshop/job-cards/${id}/status`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ status, notes }),
    }).then((res) => handleResponse<any>(res)),

  saveInspection: (jobCardId: string, data: any) =>
    fetch(`${BASE_URL}/workshop/job-cards/${jobCardId}/inspection`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  createEstimate: (jobCardId: string, data: any) =>
    fetch(`${BASE_URL}/workshop/job-cards/${jobCardId}/estimate`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  approveEstimate: (jobCardId: string, estimateId: string, approved: boolean, customerNotes?: string) =>
    fetch(`${BASE_URL}/workshop/job-cards/${jobCardId}/estimate/${estimateId}/approve`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ approved, customerNotes }),
    }).then((res) => handleResponse<any>(res)),

  issuePartToWorkshop: (jobCardId: string, data: { partId: string; warehouseId?: string; quantity: number }) =>
    fetch(`${BASE_URL}/workshop/job-cards/${jobCardId}/parts/issue`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  generateJobCardInvoice: (jobCardId: string, data: any) =>
    fetch(`${BASE_URL}/workshop/job-cards/${jobCardId}/invoice`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  // Inventory & Warehouses
  getStockBalances: (params?: { warehouseId?: string; categoryId?: string; q?: string }) => {
    const query = new URLSearchParams();
    if (params?.warehouseId) query.append('warehouseId', params.warehouseId);
    if (params?.categoryId) query.append('categoryId', params.categoryId);
    if (params?.q) query.append('q', params.q);
    return fetch(`${BASE_URL}/inventory/balances?${query.toString()}`, { headers: getHeaders() }).then((res) => handleResponse<any>(res));
  },

  updateBulkItemPrices: (data: {
    field: 'purchasePrice' | 'sellPrice';
    target:
      | { type: 'category'; categoryId: string }
      | { type: 'items'; itemIds: string[] }
      | { type: 'item'; itemId: string };
    adjustmentType: 'percentage' | 'amount';
    operation: 'increase' | 'decrease';
    value: number;
  }) =>
    fetch(`${BASE_URL}/inventory/prices/bulk`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<{ updatedCount: number }>(res)),

  updateItemLocation: (itemId: string, location: string) =>
    fetch(`${BASE_URL}/inventory/items/${itemId}/location`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ location }),
    }).then((res) => handleResponse<any>(res)),

  getTransfers: () =>
    fetch(`${BASE_URL}/inventory/transfers`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  createTransfer: (data: any) =>
    fetch(`${BASE_URL}/inventory/transfers`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  getCounts: () =>
    fetch(`${BASE_URL}/inventory/counts`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  createCount: (data: any) =>
    fetch(`${BASE_URL}/inventory/counts`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  // Financials
  getExpenses: () =>
    fetch(`${BASE_URL}/financials/expenses`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  createExpense: (data: any) =>
    fetch(`${BASE_URL}/financials/expenses`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  getRevenues: () =>
    fetch(`${BASE_URL}/financials/revenues`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  createRevenue: (data: any) =>
    fetch(`${BASE_URL}/financials/revenues`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  getCashTransactions: () =>
    fetch(`${BASE_URL}/financials/cash/transactions`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  createCashVoucher: (data: any) =>
    fetch(`${BASE_URL}/financials/cash/vouchers`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  getCashShifts: () =>
    fetch(`${BASE_URL}/financials/cash/shifts`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  closeCashShift: (data: any) =>
    fetch(`${BASE_URL}/financials/cash/shifts/close`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  getBanks: () =>
    fetch(`${BASE_URL}/financials/banks`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  getCashboxes: () =>
    fetch(`${BASE_URL}/financials/cashboxes`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  getExpenseCategories: () =>
    fetch(`${BASE_URL}/financials/expense-categories`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  createBankTransaction: (data: any) =>
    fetch(`${BASE_URL}/financials/banks/transactions`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  // Accounting
  getAccountingAccounts: () =>
    fetch(`${BASE_URL}/accounting/accounts`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  createAccountingAccount: (data: { code: string; nameAr: string; nameEn?: string; type: string }) =>
    fetch(`${BASE_URL}/accounting/accounts`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  getAccountingJournals: () =>
    fetch(`${BASE_URL}/accounting/journals`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  getAccountingEntries: () =>
    fetch(`${BASE_URL}/accounting/entries`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  getAccountingTrialBalance: () =>
    fetch(`${BASE_URL}/accounting/trial-balance`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  getAccountingLedger: (accountId: string) =>
    fetch(`${BASE_URL}/accounting/ledger/${encodeURIComponent(accountId)}`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  createAccountingEntry: (data: any) =>
    fetch(`${BASE_URL}/accounting/entries`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  reverseAccountingEntry: (entryId: string) =>
    fetch(`${BASE_URL}/accounting/entries/${encodeURIComponent(entryId)}/reverse`, {
      method: 'POST',
      headers: getHeaders(),
    }).then((res) => handleResponse<any>(res)),

  // HR
  getHrSettings: () =>
    fetch(`${BASE_URL}/hr/settings`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  updateHrSettings: (data: { standardMonthlyHours: number }) =>
    fetch(`${BASE_URL}/hr/settings`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  getAttendance: (params?: { employeeId?: string }) => {
    const query = new URLSearchParams();
    if (params?.employeeId) query.append('employeeId', params.employeeId);
    return fetch(`${BASE_URL}/hr/attendance?${query.toString()}`, { headers: getHeaders() }).then((res) => handleResponse<any>(res));
  },

  checkIn: (data: { employeeId: string; notes?: string }) =>
    fetch(`${BASE_URL}/hr/attendance/check-in`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  checkOut: (data: { attendanceId: string }) =>
    fetch(`${BASE_URL}/hr/attendance/check-out`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  getCommissions: (params?: { employeeId?: string; status?: string }) => {
    const query = new URLSearchParams();
    if (params?.employeeId) query.append('employeeId', params.employeeId);
    if (params?.status) query.append('status', params.status);
    return fetch(`${BASE_URL}/hr/commissions?${query.toString()}`, { headers: getHeaders() }).then((res) => handleResponse<any>(res));
  },

  getPayroll: (params?: { month?: number; year?: number }) => {
    const query = new URLSearchParams();
    if (params?.month) query.append('month', String(params.month));
    if (params?.year) query.append('year', String(params.year));
    return fetch(`${BASE_URL}/hr/payroll?${query.toString()}`, { headers: getHeaders() }).then((res) => handleResponse<any>(res));
  },

  generatePayroll: (data: { month: number; year: number }) =>
    fetch(`${BASE_URL}/hr/payroll/generate`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  // Reports
  getSalesReport: (params?: any) => {
    const query = new URLSearchParams(params || {});
    return fetch(`${BASE_URL}/reports/sales?${query.toString()}`, { headers: getHeaders() }).then((res) => handleResponse<any>(res));
  },

  getInventoryReport: (params?: any) => {
    const query = new URLSearchParams(params || {});
    return fetch(`${BASE_URL}/reports/inventory?${query.toString()}`, { headers: getHeaders() }).then((res) => handleResponse<any>(res));
  },

  getWorkshopReport: (params?: any) => {
    const query = new URLSearchParams(params || {});
    return fetch(`${BASE_URL}/reports/workshop?${query.toString()}`, { headers: getHeaders() }).then((res) => handleResponse<any>(res));
  },

  // Profits
  getProfitsSummary: (params?: { period?: string; branchId?: string }) => {
    const query = new URLSearchParams();
    if (params?.period) query.append('period', params.period);
    if (params?.branchId) query.append('branchId', params.branchId);
    return fetch(`${BASE_URL}/profits/summary?${query.toString()}`, { headers: getHeaders() }).then((res) => handleResponse<any>(res));
  },

  // Global Search
  globalSearch: (q: string) =>
    fetch(`${BASE_URL}/search?q=${encodeURIComponent(q)}`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  getSmartSearchSuggestions: (q: string) =>
    fetch(`${BASE_URL}/search/suggestions?q=${encodeURIComponent(q)}`, { headers: getHeaders() })
      .then((res) => handleResponse<{ suggestions: { value: string; label: string }[] }>(res)),

  // Settings & Audit
  getAuditLogs: (params?: { action?: string; entity?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.action) query.append('action', params.action);
    if (params?.entity) query.append('entity', params.entity);
    if (params?.limit) query.append('limit', String(params.limit));
    return fetch(`${BASE_URL}/settings/audit-logs?${query.toString()}`, { headers: getHeaders() }).then((res) => handleResponse<any>(res));
  },

  getPermissionsList: () =>
    fetch(`${BASE_URL}/settings/permissions`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  getNotificationIntegrations: () =>
    fetch(`${BASE_URL}/settings/integrations`, { headers: getHeaders() })
      .then((res) => handleResponse<{ data: NotificationIntegrationStatus }>(res)),

  getWhatsappQrStatus: () =>
    fetch(`${BASE_URL}/settings/integrations/whatsapp/qr`, { headers: getHeaders() })
      .then((res) => handleResponse<{ data: NotificationQrStatus }>(res)),

  startWhatsappQrPairing: () =>
    fetch(`${BASE_URL}/settings/integrations/whatsapp/connect`, {
      method: 'POST',
      headers: getHeaders(),
    }).then((res) => handleResponse<{ data: NotificationQrStatus }>(res)),

  disconnectWhatsappQr: () =>
    fetch(`${BASE_URL}/settings/integrations/whatsapp/connect`, {
      method: 'DELETE',
      headers: getHeaders(),
    }).then((res) => handleResponse<{ data: NotificationQrStatus }>(res)),

  getTelegramQrStatus: () =>
    fetch(`${BASE_URL}/settings/integrations/telegram/qr`, { headers: getHeaders() })
      .then((res) => handleResponse<{ data: NotificationTelegramQrStatus }>(res)),

  startTelegramQrPairing: () =>
    fetch(`${BASE_URL}/settings/integrations/telegram/connect`, {
      method: 'POST',
      headers: getHeaders(),
    }).then((res) => handleResponse<{ data: NotificationTelegramQrStatus }>(res)),

  submitTelegramQrPassword: (password: string) =>
    fetch(`${BASE_URL}/settings/integrations/telegram/password`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ password }),
    }).then((res) => handleResponse<{ data: NotificationTelegramQrStatus }>(res)),

  disconnectTelegramQr: () =>
    fetch(`${BASE_URL}/settings/integrations/telegram/connect`, {
      method: 'DELETE',
      headers: getHeaders(),
    }).then((res) => handleResponse<{ data: NotificationTelegramQrStatus }>(res)),

  saveNotificationIntegrations: (data: NotificationIntegrationInput) =>
    fetch(`${BASE_URL}/settings/integrations`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<{ data: NotificationIntegrationStatus }>(res)),

  testNotificationIntegration: (
    channel: 'whatsapp' | 'telegram',
    data: NotificationConnectionInput,
  ) =>
    fetch(`${BASE_URL}/settings/integrations/test/${channel}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<{ data: NotificationConnectionTest }>(res)),
};

export const api = Object.assign(apiClient, {
  master: {
    getCompany: apiClient.getCompany,
    updateCompany: apiClient.updateCompany,
    getBranches: apiClient.getBranches,
    createBranch: apiClient.createBranch,
    getCategories: apiClient.getCategories,
    getUnits: apiClient.getUnits,
    getWarehouses: apiClient.getWarehouses,
    getSuppliers: apiClient.getSuppliers,
    createSupplier: apiClient.createSupplier,
    getCustomers: apiClient.getCustomers,
    createCustomer: apiClient.createCustomer,
    getVehicles: apiClient.getVehicles,
    getVehicleProfile: apiClient.getVehicleProfile,
    createVehicle: apiClient.createVehicle,
    getEmployees: apiClient.getEmployees,
    createEmployee: apiClient.createEmployee,
    updateEmployee: apiClient.updateEmployee,
    deleteEmployee: apiClient.deleteEmployee,
    getJobs: apiClient.getJobs,
    getRoles: apiClient.getRoles,
  },
  inventory: {
    getBalances: apiClient.getStockBalances,
    updateItemLocation: apiClient.updateItemLocation,
    getTransfers: apiClient.getTransfers,
    createTransfer: apiClient.createTransfer,
    getCounts: apiClient.getCounts,
    createCount: apiClient.createCount,
  },
  financials: {
    getExpenses: apiClient.getExpenses,
    createExpense: apiClient.createExpense,
    getExpenseCategories: apiClient.getExpenseCategories,
    getRevenues: apiClient.getRevenues,
    createRevenue: apiClient.createRevenue,
    getCashTransactions: apiClient.getCashTransactions,
    createCashVoucher: apiClient.createCashVoucher,
    getCashShifts: apiClient.getCashShifts,
    closeCashShift: apiClient.closeCashShift,
    getBanks: apiClient.getBanks,
    getCashboxes: apiClient.getCashboxes,
  },
  accounting: {
    getAccounts: apiClient.getAccountingAccounts,
    createAccount: apiClient.createAccountingAccount,
    getJournals: apiClient.getAccountingJournals,
    getEntries: apiClient.getAccountingEntries,
    getTrialBalance: apiClient.getAccountingTrialBalance,
    getLedger: apiClient.getAccountingLedger,
    createEntry: apiClient.createAccountingEntry,
    reverseEntry: apiClient.reverseAccountingEntry,
  },
  hr: {
    getHrSettings: apiClient.getHrSettings,
    updateHrSettings: apiClient.updateHrSettings,
    getAttendance: apiClient.getAttendance,
    checkIn: apiClient.checkIn,
    checkOut: apiClient.checkOut,
    getCommissions: apiClient.getCommissions,
    getPayroll: apiClient.getPayroll,
    generatePayroll: apiClient.generatePayroll,
  },
  reports: {
    getSalesReport: apiClient.getSalesReport,
    getInventoryReport: apiClient.getInventoryReport,
    getWorkshopReport: apiClient.getWorkshopReport,
  },
  profits: {
    getSummary: apiClient.getProfitsSummary,
  },
  settings: {
    getAuditLogs: apiClient.getAuditLogs,
    getPermissions: apiClient.getPermissionsList,
    getNotificationIntegrations: apiClient.getNotificationIntegrations,
    getWhatsappQrStatus: apiClient.getWhatsappQrStatus,
    startWhatsappQrPairing: apiClient.startWhatsappQrPairing,
    disconnectWhatsappQr: apiClient.disconnectWhatsappQr,
    getTelegramQrStatus: apiClient.getTelegramQrStatus,
    startTelegramQrPairing: apiClient.startTelegramQrPairing,
    submitTelegramQrPassword: apiClient.submitTelegramQrPassword,
    disconnectTelegramQr: apiClient.disconnectTelegramQr,
    saveNotificationIntegrations: apiClient.saveNotificationIntegrations,
    testNotificationIntegration: apiClient.testNotificationIntegration,
  },
});
