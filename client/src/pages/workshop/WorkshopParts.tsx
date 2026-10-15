import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardList, Package, Plus, Search, Send, Wrench } from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

type RequestedPart = {
  id: string;
  repairOrderId: string;
  requestedQty: number;
  issuedQty: number;
  remainingQty: number;
  status: string;
  requestedByName: string;
  createdAt: string;
  item: any;
  repairOrder: any;
  warehouse?: any;
};

type RequestLine = { item: any; quantity: number };

export const WorkshopParts: React.FC = () => {
  const { hasPermission, user } = useAuth();
  const { success, error } = useToast();
  const canRequest = hasPermission('manage_workshop') || hasPermission('manage_jobcards');
  const canIssue = hasPermission('issue_parts') || hasPermission('manage_inventory');
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<RequestedPart[]>([]);
  const [jobCards, setJobCards] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [itemResults, setItemResults] = useState<any[]>([]);
  const [requestLines, setRequestLines] = useState<RequestLine[]>([]);
  const [requestQuantity, setRequestQuantity] = useState(1);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestSearch, setRequestSearch] = useState('');
  const [requestFilter, setRequestFilter] = useState<'PENDING' | 'ALL' | 'ISSUED'>('PENDING');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [issueQuantities, setIssueQuantities] = useState<Record<string, number>>({});
  const [issuingId, setIssuingId] = useState<string | null>(null);

  const loadPage = async () => {
    setLoading(true);
    try {
      const [requestsResult, jobsResult, warehousesResult] = await Promise.all([
        api.getWorkshopPartRequests(),
        api.getJobCards(),
        canIssue ? api.getWarehouses() : Promise.resolve({ data: [] }),
      ]);
      const loadedRequests = requestsResult.data?.requests ?? requestsResult.data ?? [];
      setRequests(loadedRequests);
      setJobCards(jobsResult.data || []);
      const accessibleWarehouses = user?.allowedWarehouseId
        ? (warehousesResult.data || []).filter((warehouse: any) => warehouse.id === user.allowedWarehouseId)
        : warehousesResult.data || [];
      setWarehouses(accessibleWarehouses);
      setSelectedOrderId((current) => current || jobsResult.data?.[0]?.id || '');
      setSelectedWarehouseId((current) => {
        if (current && accessibleWarehouses.some((warehouse: any) => warehouse.id === current)) return current;
        return accessibleWarehouses[0]?.id
          || '';
      });
    } catch (loadError: any) {
      error(loadError.response?.data?.error || loadError.message || 'تعذر تحميل صفحة صرف قطع الورشة');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPage();
  }, []);

  useEffect(() => {
    if (itemSearch.trim().length < 2) {
      setItemResults([]);
      return;
    }
    let active = true;
    const timeout = window.setTimeout(async () => {
      try {
        const response = await api.getItems({ q: itemSearch.trim() });
        if (active) setItemResults((response.data || []).slice(0, 12));
      } catch (searchError: any) {
        if (active) error(searchError.response?.data?.error || 'تعذر البحث عن قطع الغيار');
      }
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [itemSearch]);

  const visibleRequests = useMemo(() => {
    const query = requestSearch.trim().toLocaleLowerCase();
    return requests.filter((request) => {
      const pending = request.remainingQty > 0;
      const matchesFilter = requestFilter === 'ALL' || (requestFilter === 'PENDING' ? pending : !pending);
      const searchText = [
        request.item?.nameAr,
        request.item?.sku,
        request.item?.barcode,
        request.repairOrder?.orderNumber,
        request.repairOrder?.customer?.name,
        request.repairOrder?.vehicle?.plateNumber,
        request.requestedByName,
      ].filter(Boolean).join(' ').toLocaleLowerCase();
      return matchesFilter && (!query || searchText.includes(query));
    });
  }, [requests, requestFilter, requestSearch]);

  const addRequestLine = (item: any) => {
    setRequestLines((current) => {
      const existing = current.find((line) => line.item.id === item.id);
      if (existing) return current.map((line) => line.item.id === item.id
        ? { ...line, quantity: line.quantity + requestQuantity }
        : line);
      return [...current, { item, quantity: requestQuantity }];
    });
    setItemSearch('');
    setItemResults([]);
    setRequestQuantity(1);
  };

  const submitRequest = async () => {
    if (!selectedOrderId || requestLines.length === 0) {
      error('اختر أمر إصلاح وأضف قطعة واحدة على الأقل');
      return;
    }
    setSubmittingRequest(true);
    try {
      await api.createWorkshopPartRequest({
        repairOrderId: selectedOrderId,
        items: requestLines.map(({ item, quantity }) => ({ itemId: item.id, quantity })),
      });
      success('تم إرسال طلب قطع الورشة بنجاح');
      setRequestLines([]);
      await loadPage();
    } catch (requestError: any) {
      error(requestError.response?.data?.error || requestError.message || 'تعذر إرسال طلب القطع');
    } finally {
      setSubmittingRequest(false);
    }
  };

  const issuePart = async (request: RequestedPart) => {
    const quantity = issueQuantities[request.id] ?? request.remainingQty;
    if (!selectedWarehouseId) {
      error('اختر مستودع الصرف');
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > request.remainingQty) {
      error('أدخل كمية صحيحة لا تتجاوز الكمية المتبقية من الطلب');
      return;
    }
    setIssuingId(request.id);
    try {
      await api.issuePartToWorkshop(request.repairOrderId, {
        partId: request.id,
        warehouseId: selectedWarehouseId,
        quantity,
      });
      success('تم صرف القطع للورشة وتسجيل الحركة بالمخزون');
      await loadPage();
    } catch (issueError: any) {
      error(issueError.response?.data?.error || issueError.message || 'تعذر صرف القطع');
    } finally {
      setIssuingId(null);
    }
  };

  const openJobs = jobCards.filter((job) => !['CLOSED', 'CANCELLED'].includes(job.status));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900">
            <Wrench className="h-7 w-7 text-blue-700" />
            طلب وصرف قطع الورشة
          </h1>
          <p className="mt-1 text-sm text-slate-500">طلبات قطع مرتبطة بأوامر الإصلاح مع متابعة الصرف من المخزن.</p>
        </div>
        <div className="flex gap-2">
          <span className="rounded-xl bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800">
            طلبات معلقة: {requests.filter((request) => request.remainingQty > 0).length}
          </span>
          <span className="rounded-xl bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800">
            طلبات مكتملة: {requests.filter((request) => request.remainingQty === 0).length}
          </span>
        </div>
      </header>

      {canRequest && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900">
            <Plus className="h-5 w-5 text-blue-700" />
            إنشاء طلب قطع للورشة
          </h2>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <label className="text-sm font-semibold text-slate-700">
              أمر الإصلاح
              <select
                value={selectedOrderId}
                onChange={(event) => setSelectedOrderId(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3"
              >
                <option value="">اختر أمر إصلاح...</option>
                {openJobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.orderNumber} — {job.customer?.name} — {job.vehicle?.plateNumber}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <label htmlFor="workshop-part-search" className="text-sm font-semibold text-slate-700">البحث عن قطعة</label>
              <div className="relative mt-1">
                <Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  id="workshop-part-search"
                  value={itemSearch}
                  onChange={(event) => setItemSearch(event.target.value)}
                  placeholder="ابحث باسم القطعة أو SKU أو الباركود..."
                  className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-3 pr-10"
                />
              </div>
              {itemSearch.trim().length >= 2 && (
                <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-slate-200">
                  {itemResults.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 border-b p-3 last:border-0">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-slate-800">{item.nameAr}</p>
                        <p className="text-xs text-slate-500">SKU: {item.sku} · المتاح: {item.availableQuantity ?? item.totalQuantity ?? 0}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          value={requestQuantity}
                          onChange={(event) => setRequestQuantity(Math.max(1, Number(event.target.value) || 1))}
                          aria-label={`الكمية المطلوبة من ${item.nameAr}`}
                          className="w-16 rounded-lg border p-2 text-center"
                        />
                        <button
                          type="button"
                          onClick={() => addRequestLine(item)}
                          disabled={!selectedOrderId}
                          className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                        >
                          إضافة
                        </button>
                      </div>
                    </div>
                  ))}
                  {!itemResults.length && <p className="p-4 text-sm text-slate-500">لا توجد قطع مطابقة.</p>}
                </div>
              )}
            </div>
          </div>

          {requestLines.length > 0 && (
            <div className="mt-4 space-y-2">
              {requestLines.map(({ item, quantity }) => (
                <div key={item.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                  <span className="font-semibold text-slate-800">{item.nameAr} <small className="text-slate-500">({item.sku})</small></span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      value={quantity}
                      aria-label={`كمية ${item.nameAr}`}
                      onChange={(event) => setRequestLines((current) => current.map((line) =>
                        line.item.id === item.id
                          ? { ...line, quantity: Math.max(1, Number(event.target.value) || 1) }
                          : line,
                      ))}
                      className="w-20 rounded-lg border p-2 text-center"
                    />
                    <button
                      type="button"
                      onClick={() => setRequestLines((current) => current.filter((line) => line.item.id !== item.id))}
                      className="rounded-lg px-3 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50"
                    >
                      حذف
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={submitRequest}
                disabled={submittingRequest || !selectedOrderId}
                className="mt-2 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 font-bold text-white disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {submittingRequest ? 'جارٍ إرسال الطلب...' : 'إرسال طلب الورشة'}
              </button>
            </div>
          )}
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <ClipboardList className="h-5 w-5 text-blue-700" />
            طلبات قطع الورشة
          </h2>
          <div className="flex flex-wrap gap-2">
            <select
              value={requestFilter}
              onChange={(event) => setRequestFilter(event.target.value as typeof requestFilter)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              aria-label="تصفية طلبات القطع"
            >
              <option value="PENDING">طلبات تحتاج صرفًا</option>
              <option value="ISSUED">طلبات مكتملة الصرف</option>
              <option value="ALL">كل الطلبات</option>
            </select>
            <div className="relative">
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={requestSearch}
                onChange={(event) => setRequestSearch(event.target.value)}
                placeholder="بحث في الطلبات..."
                aria-label="بحث في طلبات قطع الورشة"
                className="w-64 rounded-xl border border-slate-300 py-2 pl-3 pr-9 text-sm"
              />
            </div>
          </div>
        </div>
        {canIssue && (
          <div className="flex flex-wrap items-center gap-3 border-b bg-slate-50 px-5 py-3">
            <label className="text-sm font-semibold text-slate-700" htmlFor="workshop-issue-warehouse">مستودع الصرف</label>
            <select
              id="workshop-issue-warehouse"
              value={selectedWarehouseId}
              onChange={(event) => setSelectedWarehouseId(event.target.value)}
              className="min-w-52 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">اختر المستودع...</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
              ))}
            </select>
          </div>
        )}
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">جارٍ تحميل طلبات القطع...</div>
        ) : visibleRequests.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <p className="font-semibold text-slate-600">لا توجد طلبات قطع مطابقة.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-right text-sm">
              <thead className="bg-slate-50 text-xs font-bold text-slate-500">
                <tr>
                  <th className="p-3">الصنف</th>
                  <th className="p-3">أمر الإصلاح / السيارة</th>
                  <th className="p-3">مقدم الطلب</th>
                  <th className="p-3">الكمية المطلوبة</th>
                  <th className="p-3">تم صرفه</th>
                  <th className="p-3">متبقي</th>
                  {canIssue && <th className="p-3">إجراء الصرف</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRequests.map((request) => (
                  <tr key={request.id} className="align-middle">
                    <td className="p-3">
                      <p className="font-bold text-slate-800">{request.item?.nameAr}</p>
                      <p className="font-mono text-xs text-slate-500">SKU: {request.item?.sku}</p>
                    </td>
                    <td className="p-3">
                      <p className="font-semibold">{request.repairOrder?.orderNumber}</p>
                      <p className="text-xs text-slate-500">{request.repairOrder?.vehicle?.plateNumber} · {request.repairOrder?.customer?.name}</p>
                    </td>
                    <td className="p-3 text-slate-600">{request.requestedByName}</td>
                    <td className="p-3 font-bold">{request.requestedQty}</td>
                    <td className="p-3 font-bold text-blue-700">{request.issuedQty}</td>
                    <td className="p-3 font-bold text-amber-700">{request.remainingQty}</td>
                    {canIssue && (
                      <td className="p-3">
                        {request.remainingQty > 0 ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="1"
                              max={request.remainingQty}
                              value={issueQuantities[request.id] ?? request.remainingQty}
                              onChange={(event) => setIssueQuantities((current) => ({
                                ...current,
                                [request.id]: Number(event.target.value) || 0,
                              }))}
                              aria-label={`كمية صرف ${request.item?.nameAr}`}
                              className="w-20 rounded-lg border p-2 text-center"
                            />
                            <button
                              type="button"
                              onClick={() => issuePart(request)}
                              disabled={issuingId === request.id || !selectedWarehouseId}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 font-bold text-white disabled:opacity-50"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              صرف
                            </button>
                          </div>
                        ) : (
                          <span className="font-bold text-emerald-700">مكتمل الصرف</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
