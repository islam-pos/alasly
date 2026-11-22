// API Client for AutoCare ERP
import type {
  NotificationConnectionInput,
  NotificationConnectionTest,
  NotificationIntegrationInput,
  NotificationIntegrationStatus,
  NotificationQrStatus,
  NotificationTelegramQrStatus,
} from '../types/notifications';
import { getCachedResponse, getCurrentOfflineCacheScope, saveCachedResponse } from './offlineCache';
import { queueOfflineMutation } from './offlineSync';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

class ApiError extends Error {
  response: { data: { error: string } };
  offline: boolean;

  constructor(message: string, offline = false) {
    super(message);
    this.name = 'ApiError';
    this.response = { data: { error: message } };
    this.offline = offline;
  }
}

export const isOfflineApiError = (error: unknown): boolean =>
  Boolean(error && typeof error === 'object' && 'offline' in error && error.offline === true);

function getHeaders(): HeadersInit {
  const token = localStorage.getItem('autocare_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const isNetworkFailure = (error: unknown) =>
  error instanceof TypeError || (typeof navigator !== 'undefined' && !navigator.onLine);

async function fetchWithOfflineCache(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    const requestUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    const url = new URL(requestUrl, window.location.href);
    const isAuthRequest = url.pathname.includes('/auth/');
    const idempotencyKey = !isAuthRequest ? crypto.randomUUID() : null;
    const headers = new Headers(init?.headers);
    if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
    const requestInit = { ...init, headers };
    try {
      return await globalThis.fetch(input, requestInit);
    } catch (error) {
      if (isNetworkFailure(error)) {
        if (isAuthRequest || !idempotencyKey) {
          throw new ApiError('لا يوجد اتصال بالخادم؛ لم تُحفظ العملية. أعد الاتصال بالإنترنت ثم حاول مرة أخرى.', true);
        }
        try {
          const mutation = await queueOfflineMutation(requestUrl, requestInit, method, idempotencyKey);
          throw new ApiError(
            mutation.autoSync
              ? 'لا يوجد اتصال بالخادم. حُفظ طلب الإنشاء على هذا الجهاز وسيُرسل تلقائياً عند عودة الاتصال.'
              : 'لا يوجد اتصال بالخادم. حُفظت العملية على هذا الجهاز، لكنها لم تُرسل؛ راجعها وتحقق من بيانات الخادم قبل مزامنتها.',
            true,
          );
        } catch (queueError) {
          if (queueError instanceof ApiError) throw queueError;
          console.error('Could not queue offline API mutation:', queueError);
          const message = queueError instanceof Error
            ? queueError.message
            : 'تعذر حفظ العملية في طابور المزامنة المحلي.';
          throw new ApiError(message, true);
        }
      }
      throw error;
    }
  }

  let scope: string | null = null;
  let cacheUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  try {
    try {
      scope = await getCurrentOfflineCacheScope();
    } catch (scopeError) {
      console.warn('Could not identify the authenticated offline cache scope:', scopeError);
    }
    const requestUrl = new URL(cacheUrl, window.location.href);
    cacheUrl = requestUrl.toString();
    const response = await globalThis.fetch(input, init);
    if (response.ok && scope && response.headers.get('content-type')?.toLocaleLowerCase().includes('application/json')) {
      try {
        await saveCachedResponse(scope, cacheUrl, response);
      } catch (cacheError) {
        console.warn('Could not cache API response for offline use:', cacheError);
      }
    }
    return response;
  } catch (error) {
    if (!isNetworkFailure(error)) throw error;
    if (!scope) throw new ApiError('يلزم تسجيل الدخول مسبقًا على هذا الجهاز للعرض دون اتصال.', true);
    try {
      const cached = await getCachedResponse(scope, cacheUrl);
      if (!cached) throw new ApiError('لا توجد نسخة محفوظة لهذه البيانات؛ اتصل بالإنترنت وافتح الصفحة أولًا.', true);
      window.dispatchEvent(new CustomEvent('autocare:offline-cache-hit', { detail: { storedAt: cached.storedAt } }));
      const headers = new Headers(cached.headers);
      headers.set('X-Offline-Cache', 'true');
      headers.set('X-Offline-Cached-At', String(cached.storedAt));
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers,
      });
    } catch (cacheError) {
      if (cacheError instanceof ApiError) throw cacheError;
      console.error('Could not read cached API response:', cacheError);
      throw new ApiError('تعذر الاتصال بالخادم وقراءة النسخة المحلية المحفوظة.', true);
    }
  }
}

const fetch = fetchWithOfflineCache;

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

  changeInitialPassword: (password: string) =>
    fetch(`${BASE_URL}/auth/change-initial-password`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ password }),
    }).then((res) => handleResponse<any>(res)),

  requestPasswordReset: (email: string) =>
    fetch(`${BASE_URL}/auth/password-reset/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).then((res) => handleResponse<{ message: string }>(res)),

  decidePasswordReset: (token: string, decision: 'approve' | 'reject') =>
    fetch(`${BASE_URL}/auth/password-reset/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, decision }),
    }).then((res) => handleResponse<{ message: string }>(res)),

  completePasswordReset: (token: string, password: string) =>
    fetch(`${BASE_URL}/auth/password-reset/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    }).then((res) => handleResponse<{ message: string }>(res)),

  getUsers: () =>
    fetch(`${BASE_URL}/auth/users`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  getPermissionReview: () =>
    fetch(`${BASE_URL}/auth/permissions/review`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  markPermissionsReviewed: () =>
    fetch(`${BASE_URL}/auth/permissions/review`, {
      method: 'POST',
      headers: getHeaders(),
    }).then((res) => handleResponse<any>(res)),

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
    }).then((res) => handleResponse<{ created: number; createdCategories: string[]; duplicates: { row: number; sku: string; reason: string }[]; errors: { row: number; sku?: string; reason: string }[] }>(res)),

  archiveItems: (itemIds: string[]) =>
    fetch(`${BASE_URL}/items/bulk/archive`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ itemIds }),
    }).then((res) => handleResponse<{ archivedCount: number; skipped: { id: string; nameAr: string; reason: string }[] }>(res)),

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

  approvePurchaseInvoice: (id: string) =>
    fetch(`${BASE_URL}/purchases/invoices/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      headers: getHeaders(),
    }).then((res) => handleResponse<any>(res)),

  rejectPurchaseInvoice: (id: string, reason: string) =>
    fetch(`${BASE_URL}/purchases/invoices/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ reason }),
    }).then((res) => handleResponse<any>(res)),

  getSupplierPriceHistory: (itemId: string) =>
    fetch(`${BASE_URL}/purchases/items/${encodeURIComponent(itemId)}/price-history`, { headers: getHeaders() })
      .then((res) => handleResponse<any>(res)),

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

  postInvoicePayment: (invoiceId: string, data: { amount: number; paymentMethod: string; cashboxId?: string; notes?: string }) =>
    fetch(`${BASE_URL}/sales/invoices/${encodeURIComponent(invoiceId)}/payments`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  getReceivablesAging: () =>
    fetch(`${BASE_URL}/sales/receivables/aging`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

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

  getLaborServices: () =>
    fetch(`${BASE_URL}/workshop/labor-services`, { headers: getHeaders() })
      .then((res) => handleResponse<{ services: { name: string; rate: number }[] }>(res)),

  getWorkshopPartRequests: () =>
    fetch(`${BASE_URL}/workshop/parts/requests`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  createWorkshopPartRequest: (data: { repairOrderId: string; items: { itemId: string; quantity: number }[] }) =>
    fetch(`${BASE_URL}/workshop/parts/requests`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

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

  createEstimateApprovalLink: (jobCardId: string, estimateId: string) =>
    fetch(`${BASE_URL}/workshop/job-cards/${jobCardId}/estimate/${estimateId}/approval-link`, {
      method: 'POST',
      headers: getHeaders(),
    }).then((res) => handleResponse<{ path: string; expiresInHours: number }>(res)),

  issuePartToWorkshop: (jobCardId: string, data: { partId: string; warehouseId?: string; quantity: number }) =>
    fetch(`${BASE_URL}/workshop/job-cards/${jobCardId}/parts/issue`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  useWorkshopPart: (jobCardId: string, partId: string, quantity: number) =>
    fetch(`${BASE_URL}/workshop/job-cards/${jobCardId}/parts/${partId}/use`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ quantity }),
    }).then((res) => handleResponse<any>(res)),

  returnWorkshopPart: (jobCardId: string, partId: string, quantity: number) =>
    fetch(`${BASE_URL}/workshop/job-cards/${jobCardId}/parts/${partId}/return`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ quantity }),
    }).then((res) => handleResponse<any>(res)),

  updateWorkshopLaborTimer: (jobCardId: string, laborId: string, action: 'START' | 'PAUSE' | 'COMPLETE') =>
    fetch(`${BASE_URL}/workshop/job-cards/${jobCardId}/labor/${laborId}/timer`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ action }),
    }).then((res) => handleResponse<any>(res)),

  uploadRepairAttachment: (jobCardId: string, data: { fileName: string; dataUrl: string }) =>
    fetch(`${BASE_URL}/workshop/job-cards/${jobCardId}/attachments`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  getRepairAttachment: async (jobCardId: string, attachmentId: string) => {
    const res = await fetch(`${BASE_URL}/workshop/job-cards/${jobCardId}/attachments/${attachmentId}/file`, {
      headers: getHeaders(),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'تعذر تحميل الصورة' }));
      throw new ApiError(errorData.error || 'تعذر تحميل الصورة');
    }
    return res.blob();
  },

  recordRepairHandover: (jobCardId: string, data: {
    customerName: string;
    deliveryOdometer: number;
    checklist: Record<string, boolean>;
    signatureData: string;
    warrantyMonths: number;
    warrantyTerms: string;
  }) =>
    fetch(`${BASE_URL}/workshop/job-cards/${jobCardId}/handover`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  recordRepairPayment: (jobCardId: string, data: { amount: number; paymentMethod: 'CASH' | 'CARD' }) =>
    fetch(`${BASE_URL}/workshop/job-cards/${jobCardId}/payments`, {
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

  approveCount: (id: string) =>
    fetch(`${BASE_URL}/inventory/counts/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      headers: getHeaders(),
    }).then((res) => handleResponse<any>(res)),

  rejectCount: (id: string, reason: string) =>
    fetch(`${BASE_URL}/inventory/counts/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ reason }),
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

  importBankStatement: (bankId: string, fileName: string, csv: string) =>
    fetch(`${BASE_URL}/financials/banks/${encodeURIComponent(bankId)}/reconciliations`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ fileName, csv }),
    }).then((res) => handleResponse<any>(res)),

  getBankReconciliation: (id: string) =>
    fetch(`${BASE_URL}/financials/banks/reconciliations/${encodeURIComponent(id)}`, { headers: getHeaders() })
      .then((res) => handleResponse<any>(res)),

  matchBankStatementLine: (reconciliationId: string, lineId: string, transactionId: string) =>
    fetch(`${BASE_URL}/financials/banks/reconciliations/${encodeURIComponent(reconciliationId)}/match`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ lineId, transactionId }),
    }).then((res) => handleResponse<any>(res)),

  completeBankReconciliation: (reconciliationId: string) =>
    fetch(`${BASE_URL}/financials/banks/reconciliations/${encodeURIComponent(reconciliationId)}/complete`, {
      method: 'POST',
      headers: getHeaders(),
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

  checkIn: (data: { employeeId: string; notes?: string; faceImage: string; deviceName?: string }) =>
    fetch(`${BASE_URL}/hr/attendance/check-in`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse<any>(res)),

  checkOut: (data: { attendanceId: string; faceImage: string; deviceName?: string }) =>
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

  getBackups: () =>
    fetch(`${BASE_URL}/backups`, { headers: getHeaders() }).then((res) =>
      handleResponse<{ data: {
        backups: { id: string; type: 'daily' | 'manual'; date: string; sizeBytes: number; offsiteStatus: string }[];
        restorePending: boolean;
        offsite: { configured: boolean; encrypted: boolean; bucket: string | null; provider: string; backups: unknown[] };
      } }>(res)),

  getOperationsHealth: () =>
    fetch(`${BASE_URL}/settings/operations/health`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),

  testOffsiteBackups: () =>
    fetch(`${BASE_URL}/backups/offsite/test`, {
      method: 'POST',
      headers: getHeaders(),
    }).then((res) => handleResponse<any>(res)),

  createManualBackup: () =>
    fetch(`${BASE_URL}/backups`, {
      method: 'POST',
      headers: getHeaders(),
    }).then((res) => handleResponse<{ data: { backup: { id: string; type: 'daily' | 'manual'; date: string; sizeBytes: number; offsiteStatus?: string } } }>(res)),

  downloadBackup: async (id: string) => {
    const response = await fetch(`${BASE_URL}/backups/${encodeURIComponent(id)}/download`, { headers: getHeaders() });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'تعذر تنزيل النسخة الاحتياطية' }));
      throw new ApiError(errorData.error || `Error ${response.status}: ${response.statusText}`);
    }
    return response.blob();
  },

  restoreBackup: (id: string) =>
    fetch(`${BASE_URL}/backups/${encodeURIComponent(id)}/restore`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ confirmation: 'RESTORE' }),
    }).then((res) => handleResponse<any>(res)),

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
  operational: {
    getAppointments: (params: Record<string, string> = {}) =>
      fetch(`${BASE_URL}/operational/appointments${new URLSearchParams(params).toString() ? `?${new URLSearchParams(params)}` : ''}`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),
    createAppointment: (data: any) =>
      fetch(`${BASE_URL}/operational/appointments`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then((res) => handleResponse<any>(res)),
    updateAppointment: (id: string, data: any) =>
      fetch(`${BASE_URL}/operational/appointments/${encodeURIComponent(id)}`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify(data) }).then((res) => handleResponse<any>(res)),
    createRepairFromAppointment: (id: string) =>
      fetch(`${BASE_URL}/operational/appointments/${encodeURIComponent(id)}/create-repair`, { method: 'POST', headers: getHeaders() }).then((res) => handleResponse<any>(res)),
    getLeads: () => fetch(`${BASE_URL}/operational/leads`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),
    createLead: (data: any) =>
      fetch(`${BASE_URL}/operational/leads`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then((res) => handleResponse<any>(res)),
    updateLead: (id: string, data: any) =>
      fetch(`${BASE_URL}/operational/leads/${encodeURIComponent(id)}`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify(data) }).then((res) => handleResponse<any>(res)),
    getCampaigns: () => fetch(`${BASE_URL}/operational/campaigns`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),
    createCampaign: (data: any) =>
      fetch(`${BASE_URL}/operational/campaigns`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then((res) => handleResponse<any>(res)),
    sendCampaign: (id: string) =>
      fetch(`${BASE_URL}/operational/campaigns/${encodeURIComponent(id)}/send`, { method: 'POST', headers: getHeaders() }).then((res) => handleResponse<any>(res)),
    getAssets: () => fetch(`${BASE_URL}/operational/assets`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),
    createAsset: (data: any) =>
      fetch(`${BASE_URL}/operational/assets`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then((res) => handleResponse<any>(res)),
    updateAsset: (id: string, data: any) =>
      fetch(`${BASE_URL}/operational/assets/${encodeURIComponent(id)}`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify(data) }).then((res) => handleResponse<any>(res)),
    depreciateAssets: () =>
      fetch(`${BASE_URL}/operational/assets/depreciate`, { method: 'POST', headers: getHeaders() }).then((res) => handleResponse<any>(res)),
    getTaxSetting: () => fetch(`${BASE_URL}/operational/tax`, { headers: getHeaders() }).then((res) => handleResponse<any>(res)),
    updateTaxSetting: (data: any) =>
      fetch(`${BASE_URL}/operational/tax`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }).then((res) => handleResponse<any>(res)),
    createPortalLink: (customerId: string) =>
      fetch(`${BASE_URL}/operational/portal-links`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ customerId }) }).then((res) => handleResponse<any>(res)),
  },
  getPublicCustomerPortal: (token: string) =>
    fetch(`/api/public/customer-portal/${encodeURIComponent(token)}`, { headers: { 'Content-Type': 'application/json' } }).then((res) => handleResponse<any>(res)),
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
    approveCount: apiClient.approveCount,
    rejectCount: apiClient.rejectCount,
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
    importBankStatement: apiClient.importBankStatement,
    getBankReconciliation: apiClient.getBankReconciliation,
    matchBankStatementLine: apiClient.matchBankStatementLine,
    completeBankReconciliation: apiClient.completeBankReconciliation,
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
    getBackups: apiClient.getBackups,
    getOperationsHealth: apiClient.getOperationsHealth,
    testOffsiteBackups: apiClient.testOffsiteBackups,
    createManualBackup: apiClient.createManualBackup,
    downloadBackup: apiClient.downloadBackup,
    restoreBackup: apiClient.restoreBackup,
  },
});
