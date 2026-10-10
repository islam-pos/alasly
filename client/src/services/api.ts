// API Client for AutoCare ERP

const BASE_URL = '/api';

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
    throw new Error(errorData.error || `Error ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

export const api = {
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

  getCustomers: () =>
    fetch(`${BASE_URL}/master/customers`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  createCustomer: (data: any) =>
    fetch(`${BASE_URL}/master/customers`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  getVehicles: () =>
    fetch(`${BASE_URL}/master/vehicles`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  getVehicleProfile: (id: string) =>
    fetch(`${BASE_URL}/master/vehicles/${id}`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

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

  createBankTransaction: (data: any) =>
    fetch(`${BASE_URL}/financials/banks/transactions`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  // HR
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
};
