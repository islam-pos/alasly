import React, { useState, useEffect } from 'react';
import { 
  Boxes, ArrowLeftRight, ClipboardCheck, AlertTriangle, 
  Search, Plus, Filter, Warehouse, CheckCircle2, 
  RefreshCw, TrendingDown, DollarSign, PackageCheck, MapPin, Pencil, Save, X, Printer, Barcode
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { printBarcodeLabels } from '../../utils/barcodePrint';
import type { BarcodeLabelItem } from '../../utils/barcodePrint';
import { BarcodePrintDialog } from '../../components/common/BarcodePrintDialog';

export const InventoryManagement: React.FC = () => {
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const canManagePrices = hasPermission('manage_item_prices');
  const [activeTab, setActiveTab] = useState<'balances' | 'transfers' | 'counts'>('balances');
  
  // Data states
  const [balances, setBalances] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [counts, setCounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingLocationItemId, setEditingLocationItemId] = useState<string | null>(null);
  const [locationDraft, setLocationDraft] = useState('');
  const [savingLocation, setSavingLocation] = useState(false);
  const [barcodePrintItems, setBarcodePrintItems] = useState<BarcodeLabelItem[] | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  // Modals
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isCountModalOpen, setIsCountModalOpen] = useState(false);
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [selectedPriceItemIds, setSelectedPriceItemIds] = useState<string[]>([]);
  const [priceForm, setPriceForm] = useState({
    field: 'sellPrice' as 'purchasePrice' | 'sellPrice',
    targetType: 'selected' as 'selected' | 'category' | 'item',
    adjustmentType: 'percentage' as 'percentage' | 'amount',
    operation: 'increase' as 'increase' | 'decrease',
    value: '',
  });
  const [savingPrices, setSavingPrices] = useState(false);

  // Transfer form
  const [transferForm, setTransferForm] = useState({
    fromWarehouseId: '',
    toWarehouseId: '',
    itemId: '',
    quantity: 1,
    notes: ''
  });

  // Count form
  const [countWarehouseId, setCountWarehouseId] = useState('');
  const [countItems, setCountItems] = useState<any[]>([]);
  const [countNotes, setCountNotes] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const [bRes, wRes, cRes, tRes, cntRes] = await Promise.all([
        api.getStockBalances(),
        api.getWarehouses(),
        api.getCategories(),
        api.getTransfers(),
        api.getCounts()
      ]);
      setBalances(bRes);
      setWarehouses(wRes);
      setCategories(cRes);
      setTransfers(tRes);
      setCounts(cntRes);
    } catch (err: any) {
      showToast(err.message || 'فشل في تحميل بيانات المخزون', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveLocation = async (itemId: string) => {
    try {
      setSavingLocation(true);
      await api.inventory.updateItemLocation(itemId, locationDraft);
      showToast('تم تحديث موقع الصنف بنجاح', 'success');
      setEditingLocationItemId(null);
      await loadData();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'فشل تحديث موقع الصنف', 'error');
    } finally {
      setSavingLocation(false);
    }
  };

  const handlePrintBarcodes = (selectedItems: any[]) => {
    if (selectedItems.length === 0) {
      showToast('لا توجد أصناف لطباعة باركودها', 'error');
      return;
    }
    setBarcodePrintItems(selectedItems);
  };

  const printSelectedBarcodes = (selectedItems: BarcodeLabelItem[]) => {
    try {
      const result = printBarcodeLabels(selectedItems);
      if (result === 'empty') showToast('لا توجد أصناف لطباعة باركودها', 'error');
      if (result === 'blocked') showToast('يرجى السماح بالنوافذ المنبثقة لطباعة ملصقات الباركود', 'error');
      return result === 'opened';
    } catch (printError: any) {
      showToast(printError.message || 'تعذرت طباعة ملصقات الباركود', 'error');
      return false;
    }
  };

  // Filtered Balances
  const filteredBalances = balances.filter(item => {
    const matchesSearch = !searchQuery || 
      item.nameAr.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.partNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.sku?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = !selectedCategory || item.categoryId === selectedCategory;
    const matchesLowStock = !lowStockOnly || item.isLowStock;

    if (selectedWarehouse) {
      const hasStockInWh = item.stockBalances.some((b: any) => b.warehouseId === selectedWarehouse);
      return matchesSearch && matchesCategory && matchesLowStock && hasStockInWh;
    }

    return matchesSearch && matchesCategory && matchesLowStock;
  });

  // Top KPIs
  const totalItemsCount = balances.length;
  const lowStockCount = balances.filter(b => b.isLowStock).length;
  const totalStockValuation = balances.reduce((sum, b) => sum + (b.totalValue || 0), 0);
  const balanceColumnCount = 7 + (canManagePrices ? 4 : 0);

  const toggleSelectedPriceItem = (itemId: string, selected: boolean) => {
    setSelectedPriceItemIds((current) => selected
      ? [...new Set([...current, itemId])]
      : current.filter((id) => id !== itemId));
  };

  const toggleAllVisiblePriceItems = (selected: boolean) => {
    setSelectedPriceItemIds((current) => {
      const visibleIds = new Set(filteredBalances.map((item) => item.id));
      const remaining = current.filter((id) => !visibleIds.has(id));
      return selected ? [...remaining, ...visibleIds] : remaining;
    });
  };

  const handleBulkPriceUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(priceForm.value);
    if (!Number.isFinite(value) || value <= 0) {
      showToast('أدخل نسبة أو مبلغاً أكبر من صفر', 'error');
      return;
    }

    let target:
      | { type: 'category'; categoryId: string }
      | { type: 'items'; itemIds: string[] }
      | { type: 'item'; itemId: string };
    if (priceForm.targetType === 'category') {
      if (!selectedCategory) {
        showToast('حدد تصنيفاً أولاً من قائمة التصنيفات', 'error');
        return;
      }
      target = { type: 'category', categoryId: selectedCategory };
    } else if (priceForm.targetType === 'item') {
      if (selectedPriceItemIds.length !== 1) {
        showToast('حدد صنفاً واحداً فقط من الجدول', 'error');
        return;
      }
      target = { type: 'item', itemId: selectedPriceItemIds[0] };
    } else {
      if (selectedPriceItemIds.length === 0) {
        showToast('حدد صنفاً واحداً على الأقل من الجدول', 'error');
        return;
      }
      target = { type: 'items', itemIds: selectedPriceItemIds };
    }

    try {
      setSavingPrices(true);
      const result = await api.updateBulkItemPrices({
        field: priceForm.field,
        target,
        adjustmentType: priceForm.adjustmentType,
        operation: priceForm.operation,
        value,
      });
      showToast(`تم تحديث الأسعار لـ ${result.updatedCount} صنف`, 'success');
      setIsPriceModalOpen(false);
      setSelectedPriceItemIds([]);
      setPriceForm((current) => ({ ...current, value: '' }));
      await loadData();
    } catch (error: any) {
      showToast(error.message || 'فشل تحديث الأسعار', 'error');
    } finally {
      setSavingPrices(false);
    }
  };

  // Execute Transfer
  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (transferForm.fromWarehouseId === transferForm.toWarehouseId) {
      showToast('لا يمكن التحويل لنفس المخزن', 'error');
      return;
    }
    if (!transferForm.itemId || transferForm.quantity <= 0) {
      showToast('يرجى تحديد الصنف والكمية بشكل صحيح', 'error');
      return;
    }

    try {
      await api.createTransfer({
        fromWarehouseId: transferForm.fromWarehouseId,
        toWarehouseId: transferForm.toWarehouseId,
        notes: transferForm.notes,
        items: [{ itemId: transferForm.itemId, quantity: transferForm.quantity }]
      });
      showToast('تم إجراء التحويل المخزني بنجاح', 'success');
      setIsTransferModalOpen(false);
      setTransferForm({ fromWarehouseId: '', toWarehouseId: '', itemId: '', quantity: 1, notes: '' });
      loadData();
    } catch (err: any) {
      showToast(err.message || 'فشل تنفيذ التحويل', 'error');
    }
  };

  // Prepare Stocktaking
  const handleStartCount = (warehouseId: string) => {
    setCountWarehouseId(warehouseId);
    // Populate items for this warehouse
    const itemsForWh = balances.map(item => {
      const bal = item.stockBalances.find((b: any) => b.warehouseId === warehouseId);
      const bookQty = bal ? bal.quantity : 0;
      return {
        itemId: item.id,
        nameAr: item.nameAr,
        partNumber: item.partNumber,
        bookQty,
        physicalQty: bookQty,
        unitCost: item.avgCost || item.costPrice || 0
      };
    });
    setCountItems(itemsForWh);
    setIsCountModalOpen(true);
  };

  // Submit Stocktaking
  const handleSubmitCount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!countWarehouseId) {
      showToast('يرجى اختيار المستودع', 'error');
      return;
    }

    try {
      await api.createCount({
        warehouseId: countWarehouseId,
        notes: countNotes,
        items: countItems.map(it => ({
          itemId: it.itemId,
          bookQty: it.bookQty,
          physicalQty: Number(it.physicalQty),
          unitCost: it.unitCost
        }))
      });
      showToast('تم اعتماد الجرد وتحديث أرصدة المخزون بنجاح', 'success');
      setIsCountModalOpen(false);
      setCountNotes('');
      loadData();
    } catch (err: any) {
      showToast(err.message || 'فشل حفظ الجرد', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Boxes className="w-7 h-7 text-blue-600" />
            إدارة المخزون والمستودعات
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            متابعة الأرصدة الحية، التحويلات بين المستودعات، والجرد الفعلي والتسويات
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handlePrintBarcodes(filteredBalances)}
            disabled={filteredBalances.length === 0}
            className="flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-800 shadow-sm transition hover:bg-blue-100 disabled:opacity-50"
          >
            <Barcode className="h-4 w-4" />
            طباعة باركود النتائج
          </button>
          <button
            onClick={() => setIsTransferModalOpen(true)}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm transition"
          >
            <ArrowLeftRight className="w-4 h-4" />
            تحويل مخزني
          </button>
          <button
            onClick={() => handleStartCount(warehouses[0]?.id || '')}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-md transition"
          >
            <ClipboardCheck className="w-4 h-4" />
            بدء جرد فعلي
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">إجمالي الأصناف بالمستودعات</span>
            <div className="text-2xl font-black text-slate-900 mt-1">{totalItemsCount} صنف</div>
            <span className="text-[11px] text-slate-400">موزعة عبر {warehouses.length} مستودعات نشطة</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <PackageCheck className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">أصناف تحت حد الطلب (منخفضة)</span>
            <div className="text-2xl font-black text-amber-600 mt-1">{lowStockCount} صنف</div>
            <span className="text-[11px] text-amber-600 font-medium">تتطلب إعادة الشراء فوراً</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        {canManagePrices && <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">إجمالي القيمة التقديرية للمخزون</span>
            <div className="text-2xl font-black text-emerald-600 mt-1">{totalStockValuation.toLocaleString()} ر.س</div>
            <span className="text-[11px] text-emerald-600 font-medium">محسوبة على متوسط سعر التكلفة</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-6 pt-2 rounded-t-2xl">
        <button
          onClick={() => setActiveTab('balances')}
          className={`pb-4 px-4 font-bold text-sm border-b-2 flex items-center gap-2 transition ${
            activeTab === 'balances' 
              ? 'border-blue-600 text-blue-600' 
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Boxes className="w-4 h-4" />
          أرصدة المستودعات الحية
        </button>
        <button
          onClick={() => setActiveTab('transfers')}
          className={`pb-4 px-4 font-bold text-sm border-b-2 flex items-center gap-2 transition ${
            activeTab === 'transfers' 
              ? 'border-blue-600 text-blue-600' 
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ArrowLeftRight className="w-4 h-4" />
          التحويلات المخزنية ({transfers.length})
        </button>
        <button
          onClick={() => setActiveTab('counts')}
          className={`pb-4 px-4 font-bold text-sm border-b-2 flex items-center gap-2 transition ${
            activeTab === 'counts' 
              ? 'border-blue-600 text-blue-600' 
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ClipboardCheck className="w-4 h-4" />
          سجل الجرد والتسويات ({counts.length})
        </button>
      </div>

      {/* Tab 1: Live Balances */}
      {activeTab === 'balances' && (
        <div className="bg-white rounded-b-2xl border border-slate-200 border-t-0 p-6 space-y-4">
          {/* Filter Bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث بالاسم، رقم القطعة، الباركود..."
                className="w-full pr-9 pl-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <select
              value={selectedWarehouse}
              onChange={(e) => setSelectedWarehouse(e.target.value)}
              className="border rounded-xl px-3 py-2 text-sm bg-white outline-none"
            >
              <option value="">جميع المستودعات</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="border rounded-xl px-3 py-2 text-sm bg-white outline-none"
            >
              <option value="">جميع التصنيفات</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.nameAr}</option>
              ))}
            </select>

            <button
              onClick={() => setLowStockOnly(!lowStockOnly)}
              className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border transition ${
                lowStockOnly 
                  ? 'bg-amber-500 text-white border-amber-600' 
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              أصناف تحت حد الطلب فقط
            </button>
          </div>

          {canManagePrices && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                الأصناف المحددة: {selectedPriceItemIds.length}
              </span>
              <button
                type="button"
                onClick={() => setIsPriceModalOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-bold"
              >
                تحديث أسعار الأصناف
              </button>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto border rounded-xl">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b text-xs">
                <tr>
                  {canManagePrices && (
                    <th className="py-3 px-3 text-center">
                      <input
                        type="checkbox"
                        aria-label="تحديد كل الأصناف الظاهرة"
                        checked={filteredBalances.length > 0 && filteredBalances.every((item) => selectedPriceItemIds.includes(item.id))}
                        onChange={(event) => toggleAllVisiblePriceItems(event.target.checked)}
                        className="accent-blue-600"
                      />
                    </th>
                  )}
                  <th className="py-3 px-4">رقم القطعة / الصنف</th>
                  <th className="py-3 px-4">التصنيف</th>
                  <th className="py-3 px-4">التوزيع بالمستودعات</th>
                  <th className="py-3 px-4">موقع التخزين</th>
                  <th className="py-3 px-4 text-center">الرصيد الكلي</th>
                  <th className="py-3 px-4 text-center">حد الطلب</th>
                  {canManagePrices && (
                    <>
                      <th className="py-3 px-4 text-left">سعر الشراء</th>
                      <th className="py-3 px-4 text-left">سعر البيع</th>
                      <th className="py-3 px-4 text-left">إجمالي القيمة</th>
                    </>
                  )}
                  <th className="py-3 px-4">طباعة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={balanceColumnCount} className="text-center py-8 text-slate-400">جاري تحميل بيانات المخزون...</td>
                  </tr>
                ) : filteredBalances.length === 0 ? (
                  <tr>
                    <td colSpan={balanceColumnCount} className="text-center py-8 text-slate-400">لا توجد أصناف تطابق شروط البحث</td>
                  </tr>
                ) : (
                  filteredBalances.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition">
                      {canManagePrices && (
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            aria-label={`تحديد ${item.nameAr}`}
                            checked={selectedPriceItemIds.includes(item.id)}
                            onChange={(event) => toggleSelectedPriceItem(item.id, event.target.checked)}
                            className="accent-blue-600"
                          />
                        </td>
                      )}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{item.nameAr}</div>
                        <div className="text-xs font-mono text-slate-500">{item.partNumber || item.sku}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                          {item.category?.nameAr || '-'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {item.stockBalances?.map((sb: any) => (
                            <span 
                              key={sb.id}
                              className="text-[11px] bg-blue-50 border border-blue-200 text-blue-800 px-1.5 py-0.5 rounded"
                            >
                              {sb.warehouse?.name}: <b>{sb.quantity}</b>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {editingLocationItemId === item.id ? (
                          <div className="flex min-w-48 items-center gap-1">
                            <input
                              type="text"
                              maxLength={120}
                              autoFocus
                              value={locationDraft}
                              onChange={(e) => setLocationDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  void handleSaveLocation(item.id);
                                }
                                if (e.key === 'Escape') setEditingLocationItemId(null);
                              }}
                              aria-label={`موقع تخزين ${item.nameAr}`}
                              placeholder="ممر، رف، صندوق..."
                              className="w-full rounded-lg border px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                              type="button"
                              onClick={() => void handleSaveLocation(item.id)}
                              disabled={savingLocation}
                              aria-label="حفظ موقع الصنف"
                              className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                            >
                              <Save className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingLocationItemId(null)}
                              disabled={savingLocation}
                              aria-label="إلغاء تعديل الموقع"
                              className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingLocationItemId(item.id);
                              setLocationDraft(item.defaultLocation || '');
                            }}
                            aria-label={`تعديل موقع ${item.nameAr}`}
                            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                          >
                            <MapPin className="h-3.5 w-3.5" />
                            <span>{item.defaultLocation || 'تحديد الموقع'}</span>
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center font-mono">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                          item.isLowStock ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {item.totalQuantity} {item.unit?.nameAr || 'قطعة'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-xs text-slate-500">
                        {item.minStock}
                      </td>
                      {canManagePrices && (
                        <>
                          <td className="py-3 px-4 text-left font-mono text-xs">
                            {(item.purchasePrice || 0).toLocaleString()} ر.س
                          </td>
                          <td className="py-3 px-4 text-left font-mono font-bold text-slate-800">
                            {(item.sellPrice || 0).toLocaleString()} ر.س
                          </td>
                          <td className="py-3 px-4 text-left font-mono font-bold text-emerald-700">
                            {(item.totalValue || 0).toLocaleString()} ر.س
                          </td>
                        </>
                      )}
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => handlePrintBarcodes([item])}
                          aria-label={`طباعة باركود ${item.nameAr}`}
                          className="rounded-lg p-2 text-blue-700 hover:bg-blue-50"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isPriceModalOpen && canManagePrices && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <form onSubmit={handleBulkPriceUpdate} className="bg-white rounded-2xl shadow-xl max-w-xl w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">تحديث أسعار الأصناف</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs font-bold text-slate-700">
                السعر
                <select
                  value={priceForm.field}
                  onChange={(event) => setPriceForm({ ...priceForm, field: event.target.value as 'purchasePrice' | 'sellPrice' })}
                  className="mt-1 w-full border rounded-xl px-3 py-2 bg-white"
                >
                  <option value="sellPrice">سعر البيع</option>
                  <option value="purchasePrice">سعر الشراء</option>
                </select>
              </label>
              <label className="text-xs font-bold text-slate-700">
                نطاق الأصناف
                <select
                  value={priceForm.targetType}
                  onChange={(event) => setPriceForm({ ...priceForm, targetType: event.target.value as 'selected' | 'category' | 'item' })}
                  className="mt-1 w-full border rounded-xl px-3 py-2 bg-white"
                >
                  <option value="selected">الأصناف المحددة ({selectedPriceItemIds.length})</option>
                  <option value="item">صنف واحد محدد</option>
                  <option value="category">التصنيف المحدد ({categories.find((category) => category.id === selectedCategory)?.nameAr || 'لم يتم اختيار تصنيف'})</option>
                </select>
              </label>
              <label className="text-xs font-bold text-slate-700">
                نوع التعديل
                <select
                  value={priceForm.adjustmentType}
                  onChange={(event) => setPriceForm({ ...priceForm, adjustmentType: event.target.value as 'percentage' | 'amount' })}
                  className="mt-1 w-full border rounded-xl px-3 py-2 bg-white"
                >
                  <option value="percentage">نسبة مئوية</option>
                  <option value="amount">مبلغ ثابت (ر.س)</option>
                </select>
              </label>
              <label className="text-xs font-bold text-slate-700">
                طريقة التعديل
                <select
                  value={priceForm.operation}
                  onChange={(event) => setPriceForm({ ...priceForm, operation: event.target.value as 'increase' | 'decrease' })}
                  className="mt-1 w-full border rounded-xl px-3 py-2 bg-white"
                >
                  <option value="increase">زيادة</option>
                  <option value="decrease">تخفيض</option>
                </select>
              </label>
            </div>
            <label className="block text-xs font-bold text-slate-700">
              {priceForm.adjustmentType === 'percentage' ? 'النسبة المئوية' : 'المبلغ'}
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={priceForm.value}
                onChange={(event) => setPriceForm({ ...priceForm, value: event.target.value })}
                className="mt-1 w-full border rounded-xl px-3 py-2 font-mono"
              />
            </label>
            {priceForm.targetType === 'category' && !selectedCategory && (
              <p className="text-xs text-amber-700">اختر التصنيف المطلوب من قائمة التصنيفات قبل الحفظ.</p>
            )}
            {(priceForm.targetType === 'item' && selectedPriceItemIds.length !== 1) && (
              <p className="text-xs text-amber-700">حدد صنفاً واحداً فقط من الجدول.</p>
            )}
            <div className="flex justify-end gap-2 border-t pt-4">
              <button
                type="button"
                onClick={() => setIsPriceModalOpen(false)}
                className="px-4 py-2 border rounded-xl text-sm font-semibold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={savingPrices}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold"
              >
                {savingPrices ? 'جارٍ التحديث...' : 'تطبيق التحديث'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 2: Transfers */}
      {activeTab === 'transfers' && (
        <div className="bg-white rounded-b-2xl border border-slate-200 border-t-0 p-6 space-y-4">
          <div className="overflow-x-auto border rounded-xl">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b text-xs">
                <tr>
                  <th className="py-3 px-4">رقم التحويل</th>
                  <th className="py-3 px-4">التاريخ</th>
                  <th className="py-3 px-4">من مستودع</th>
                  <th className="py-3 px-4">إلى مستودع</th>
                  <th className="py-3 px-4">الأصناف المحولة</th>
                  <th className="py-3 px-4">ملاحظات</th>
                  <th className="py-3 px-4 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transfers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400">لا توجد عمليات تحويل مسجلة</td>
                  </tr>
                ) : (
                  transfers.map(trf => (
                    <tr key={trf.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-mono font-bold text-blue-600">{trf.transferNumber}</td>
                      <td className="py-3 px-4 text-xs text-slate-500">{new Date(trf.createdAt).toLocaleDateString('ar-SA')}</td>
                      <td className="py-3 px-4 font-semibold text-rose-700">{trf.fromWarehouse?.name}</td>
                      <td className="py-3 px-4 font-semibold text-emerald-700">{trf.toWarehouse?.name}</td>
                      <td className="py-3 px-4">
                        <div className="text-xs space-y-1">
                          {trf.items?.map((it: any) => (
                            <div key={it.id}>
                              {it.item?.nameAr} - <b className="font-mono">{it.quantity}</b> قطعة
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500">{trf.notes || '-'}</td>
                      <td className="py-3 px-4 text-center">
                        <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-1 rounded-full font-bold">
                          مكتمل
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Stocktaking & Adjustments */}
      {activeTab === 'counts' && (
        <div className="bg-white rounded-b-2xl border border-slate-200 border-t-0 p-6 space-y-4">
          <div className="overflow-x-auto border rounded-xl">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b text-xs">
                <tr>
                  <th className="py-3 px-4">رقم الجرد</th>
                  <th className="py-3 px-4">التاريخ</th>
                  <th className="py-3 px-4">المستودع</th>
                  <th className="py-3 px-4 text-center">عدد الأصناف المجرودة</th>
                  <th className="py-3 px-4 text-center">حالة الفروقات</th>
                  <th className="py-3 px-4">الملاحظات</th>
                  <th className="py-3 px-4 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {counts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400">لا توجد سجلات جرد معتمدة</td>
                  </tr>
                ) : (
                  counts.map(cnt => {
                    const diffCount = cnt.items?.filter((i: any) => i.difference !== 0).length || 0;
                    return (
                      <tr key={cnt.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{cnt.countNumber}</td>
                        <td className="py-3 px-4 text-xs text-slate-500">{new Date(cnt.createdAt).toLocaleDateString('ar-SA')}</td>
                        <td className="py-3 px-4 font-semibold text-slate-800">{cnt.warehouse?.name}</td>
                        <td className="py-3 px-4 text-center font-mono">{cnt.items?.length || 0}</td>
                        <td className="py-3 px-4 text-center">
                          {diffCount === 0 ? (
                            <span className="text-emerald-700 bg-emerald-50 text-xs px-2 py-0.5 rounded font-bold">
                              مطابق 100%
                            </span>
                          ) : (
                            <span className="text-rose-700 bg-rose-50 text-xs px-2 py-0.5 rounded font-bold">
                              فروقات في {diffCount} صنف
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-500">{cnt.notes || '-'}</td>
                        <td className="py-3 px-4 text-center">
                          <span className="bg-blue-100 text-blue-800 text-xs px-2.5 py-1 rounded-full font-bold">
                            معتمد ومسوّى
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5 text-blue-600" />
              إجراء تحويل مخزني بين المستودعات
            </h3>

            <form onSubmit={handleExecuteTransfer} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">من مستودع:</label>
                  <select
                    required
                    value={transferForm.fromWarehouseId}
                    onChange={(e) => setTransferForm({ ...transferForm, fromWarehouseId: e.target.value })}
                    className="w-full border rounded-xl px-3 py-2 text-sm bg-white outline-none"
                  >
                    <option value="">اختر المستودع المصدر</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">إلى مستودع:</label>
                  <select
                    required
                    value={transferForm.toWarehouseId}
                    onChange={(e) => setTransferForm({ ...transferForm, toWarehouseId: e.target.value })}
                    className="w-full border rounded-xl px-3 py-2 text-sm bg-white outline-none"
                  >
                    <option value="">اختر المستودع الوجهة</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">الصنف المراد تحويله:</label>
                <select
                  required
                  value={transferForm.itemId}
                  onChange={(e) => setTransferForm({ ...transferForm, itemId: e.target.value })}
                  className="w-full border rounded-xl px-3 py-2 text-sm bg-white outline-none"
                >
                  <option value="">اختر الصنف</option>
                  {balances.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.nameAr} - ({b.partNumber || b.sku}) - متاح: {b.availableQuantity}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">الكمية المحولة:</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={transferForm.quantity}
                  onChange={(e) => setTransferForm({ ...transferForm, quantity: parseInt(e.target.value) || 1 })}
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">ملاحظات / سبب التحويل:</label>
                <input
                  type="text"
                  value={transferForm.notes}
                  onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
                  placeholder="مثال: تلبية طلب أمر إصلاح بالورشة"
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(false)}
                  className="px-4 py-2 border rounded-xl text-sm font-semibold hover:bg-slate-100"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md"
                >
                  تأكيد التحويل الآن
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stocktaking Modal */}
      {isCountModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col p-6 border border-slate-200">
            <div className="flex justify-between items-center pb-4 border-b">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <ClipboardCheck className="w-5 h-5 text-blue-600" />
                  محضر الجرد الفعلي للمستودع وتسوية الفروقات
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  أدخل الكمية الفعلية الموجودة على الرف، وسيقوم النظام بتسوية الفارق تلقائياً
                </p>
              </div>
              <select
                value={countWarehouseId}
                onChange={(e) => handleStartCount(e.target.value)}
                className="border rounded-xl px-3 py-1.5 text-xs font-bold bg-slate-50"
              >
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>

            <form onSubmit={handleSubmitCount} className="flex-1 flex flex-col overflow-hidden pt-4">
              <div className="overflow-y-auto flex-1 border rounded-xl mb-4">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-700 sticky top-0 border-b">
                    <tr>
                      <th className="py-2.5 px-3">الصنف / رقم القطعة</th>
                      <th className="py-2.5 px-3 text-center">الرصيد الدفتري بالنظام</th>
                      <th className="py-2.5 px-3 text-center">الكمية الفعلية بالجرد</th>
                      <th className="py-2.5 px-3 text-center">الفارق (زيادة / عجز)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {countItems.map((item, idx) => {
                      const diff = Number(item.physicalQty) - Number(item.bookQty);
                      return (
                        <tr key={item.itemId} className="hover:bg-slate-50">
                          <td className="py-2 px-3">
                            <div className="font-semibold text-slate-800">{item.nameAr}</div>
                            <div className="font-mono text-[10px] text-slate-400">{item.partNumber}</div>
                          </td>
                          <td className="py-2 px-3 text-center font-mono font-bold text-slate-700">
                            {item.bookQty}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <input
                              type="number"
                              min="0"
                              value={item.physicalQty}
                              onChange={(e) => {
                                const newItems = [...countItems];
                                newItems[idx].physicalQty = e.target.value;
                                setCountItems(newItems);
                              }}
                              className="w-20 text-center border rounded-lg py-1 font-mono font-bold bg-white text-sm outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </td>
                          <td className="py-2 px-3 text-center font-mono font-bold">
                            {diff === 0 ? (
                              <span className="text-slate-400">0 (مطابق)</span>
                            ) : diff > 0 ? (
                              <span className="text-emerald-600">+{diff} (فائض)</span>
                            ) : (
                              <span className="text-rose-600">{diff} (عجز)</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mb-4">
                <input
                  type="text"
                  value={countNotes}
                  onChange={(e) => setCountNotes(e.target.value)}
                  placeholder="ملاحظات محضر الجرد (مثال: جرد ربع سنوي - فرع القاهرة)..."
                  className="w-full border rounded-xl px-3 py-2 text-xs outline-none"
                />
              </div>

              <div className="flex justify-between items-center border-t pt-4">
                <div className="text-xs text-slate-500">
                  سيتم إنشاء حركات تسوية مخزنية آلية للأصناف التي تحتوي على فروقات.
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCountModalOpen(false)}
                    className="px-4 py-2 border rounded-xl text-xs font-semibold hover:bg-slate-100"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md"
                  >
                    اعتماد الجرد وتسوية الأرصدة
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
      {barcodePrintItems && (
        <BarcodePrintDialog
          items={barcodePrintItems}
          onClose={() => setBarcodePrintItems(null)}
          onPrint={printSelectedBarcodes}
        />
      )}
    </div>
  );
};
