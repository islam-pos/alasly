import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Package,
  Search,
  Plus,
  Barcode,
  Tag,
  AlertTriangle,
  Edit2,
  Check,
  X,
  Filter,
  Download,
  FileSpreadsheet,
  Printer,
  Upload,
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { exportToExcel, exportToPdf } from '../../utils/exports';
import { readExcelRows } from '../../utils/excelImport';
import { printBarcodeLabels } from '../../utils/barcodePrint';
import type { BarcodeLabelItem } from '../../utils/barcodePrint';
import { BarcodePrintDialog } from '../../components/common/BarcodePrintDialog';

const itemExportColumns = [
  ['SKU', (item: any) => item.sku],
  ['اسم الصنف', (item: any) => item.nameAr],
  ['الاسم الإنجليزي', (item: any) => item.nameEn],
  ['الباركود', (item: any) => item.barcode],
  ['رقم القطعة', (item: any) => item.partNumber],
  ['التصنيف', (item: any) => item.category?.name],
  ['الوحدة', (item: any) => item.unit?.name],
  ['الشركة المصنعة', (item: any) => item.manufacturer],
  ['بلد المنشأ', (item: any) => item.countryOfOrigin],
  ['توافق المركبات', (item: any) => item.fitment],
  ['موقع التخزين', (item: any) => item.defaultLocation],
  ['المخزن الافتتاحي', () => ''],
  ['رصيد افتتاحي', () => ''],
  ['سعر الشراء', (item: any) => item.purchasePrice],
  ['سعر البيع', (item: any) => item.sellPrice],
  ['السعر الخاص', (item: any) => item.specialSellPrice],
  ['الحد الأدنى', (item: any) => item.minStock],
  ['الحد الأقصى', (item: any) => item.maxStock],
  ['المخزون المتاح', (item: any) => item.availableQuantity ?? item.totalQuantity],
] as const;

export const ItemsCatalog: React.FC = () => {
  const { hasPermission } = useAuth();
  const canManagePrices = hasPermission('manage_item_prices');
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [barcodePrintItems, setBarcodePrintItems] = useState<BarcodeLabelItem[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<{
    created: number;
    duplicates: { row: number; sku: string; reason: string }[];
    errors: { row: number; sku?: string; reason: string }[];
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [formData, setFormData] = useState<any>({
    nameAr: '',
    nameEn: '',
    sku: '',
    barcode: '',
    partNumber: '',
    manufacturer: '',
    countryOfOrigin: '',
    fitment: '',
    categoryId: '',
    unitId: '',
    defaultLocation: '',
    minStock: 5,
    maxStock: 50,
    purchasePrice: 0,
    sellPrice: 0,
    specialSellPrice: 0,
    initialWarehouseId: '',
    initialStock: 0,
  });
  const [submitting, setSubmitting] = useState(false);

  const [searchParams] = useSearchParams();
  const { success, error } = useToast();

  useEffect(() => {
    loadData();
    if (searchParams.get('action') === 'new') {
      setModalOpen(true);
    }
  }, [searchParams]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [itemsRes, catRes, unitRes, whRes] = await Promise.all([
        api.getItems(),
        api.getCategories(),
        api.getUnits(),
        api.getWarehouses(),
      ]);
      setItems(itemsRes.data);
      setCategories(catRes.data);
      setUnits(unitRes.data);
      setWarehouses(whRes.data);
      if (catRes.data.length > 0) setFormData((prev: any) => ({ ...prev, categoryId: catRes.data[0].id }));
      if (unitRes.data.length > 0) setFormData((prev: any) => ({ ...prev, unitId: unitRes.data[0].id }));
      if (whRes.data.length > 0) setFormData((prev: any) => ({ ...prev, initialWarehouseId: whRes.data[0].id }));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nameAr.trim() || !formData.categoryId || !formData.unitId) {
      error('يرجى ملء اسم الصنف، التصنيف والوحدة');
      return;
    }
    if (editingItemId && !formData.sku.trim()) {
      error('كود SKU مطلوب عند تعديل الصنف');
      return;
    }

    const minStock = Number(formData.minStock);
    const maxStock = Number(formData.maxStock);
    const initialStock = Number(formData.initialStock);
    if (
      !Number.isInteger(minStock) || minStock < 0 ||
      !Number.isInteger(maxStock) || maxStock < minStock ||
      (canManagePrices && [formData.purchasePrice, formData.sellPrice, formData.specialSellPrice]
        .some((price) => !Number.isFinite(Number(price)) || Number(price) < 0)) ||
      (!editingItemId && (!Number.isInteger(initialStock) || initialStock < 0))
    ) {
      error('تحقق من حدود المخزون؛ يجب أن يكون الحد الأقصى أكبر من أو يساوي الحد الأدنى والكميات أعداداً صحيحة غير سالبة');
      return;
    }
    if (!editingItemId && initialStock > 0 && !formData.initialWarehouseId) {
      error('حدد المخزن الذي سيُسجل فيه الرصيد الافتتاحي');
      return;
    }

    setSubmitting(true);
    try {
      const itemData = {
        nameAr: formData.nameAr.trim(),
        nameEn: formData.nameEn.trim() || null,
        sku: formData.sku.trim(),
        barcode: formData.barcode.trim() || null,
        partNumber: formData.partNumber.trim() || null,
        manufacturer: formData.manufacturer.trim() || null,
        countryOfOrigin: formData.countryOfOrigin.trim() || null,
        fitment: formData.fitment.trim() || null,
        categoryId: formData.categoryId,
        unitId: formData.unitId,
        defaultLocation: formData.defaultLocation.trim() || null,
        minStock,
        maxStock,
        ...(canManagePrices ? {
          purchasePrice: Number(formData.purchasePrice),
          sellPrice: Number(formData.sellPrice),
          specialSellPrice: Number(formData.specialSellPrice),
        } : {}),
      };
      if (editingItemId) {
        await api.updateItem(editingItemId, itemData);
        success('تم تحديث بيانات الصنف بنجاح');
      } else {
        await api.createItem({
          ...itemData,
          initialWarehouseId: formData.initialWarehouseId,
          initialStock,
        });
        success('تمت إضافة الصنف بنجاح!');
      }
      setEditingItemId(null);
      setModalOpen(false);
      setFormData({
        nameAr: '',
        nameEn: '',
        sku: '',
        barcode: '',
        partNumber: '',
        manufacturer: '',
        countryOfOrigin: '',
        fitment: '',
        categoryId: categories[0]?.id || '',
        unitId: units[0]?.id || '',
        defaultLocation: '',
        minStock: 5,
        maxStock: 50,
        purchasePrice: 0,
        sellPrice: 0,
        specialSellPrice: 0,
        initialWarehouseId: warehouses[0]?.id || '',
        initialStock: 0,
      });
      await loadData();
    } catch (err: any) {
      error(err.response?.data?.error || err.message || 'فشل حفظ الصنف');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditItem = (item: any) => {
    setEditingItemId(item.id);
    setFormData({
      nameAr: item.nameAr || '',
      nameEn: item.nameEn || '',
      sku: item.sku || '',
      barcode: item.barcode || '',
      partNumber: item.partNumber || '',
      manufacturer: item.manufacturer || '',
      countryOfOrigin: item.countryOfOrigin || '',
      fitment: item.fitment || '',
      categoryId: item.categoryId,
      unitId: item.unitId,
      defaultLocation: item.defaultLocation || '',
      minStock: item.minStock ?? 5,
      maxStock: item.maxStock ?? 100,
      purchasePrice: item.purchasePrice ?? 0,
      sellPrice: item.sellPrice ?? 0,
      specialSellPrice: item.specialSellPrice ?? 0,
      initialWarehouseId: '',
      initialStock: 0,
    });
    setModalOpen(true);
  };

  const handleNewItem = () => {
    setEditingItemId(null);
    setFormData({
      nameAr: '',
      nameEn: '',
      sku: '',
      barcode: '',
      partNumber: '',
      manufacturer: '',
      countryOfOrigin: '',
      fitment: '',
      categoryId: categories[0]?.id || '',
      unitId: units[0]?.id || '',
      defaultLocation: '',
      minStock: 5,
      maxStock: 50,
      purchasePrice: 0,
      sellPrice: 0,
      specialSellPrice: 0,
      initialWarehouseId: warehouses[0]?.id || '',
      initialStock: 0,
    });
    setModalOpen(true);
  };

  const filteredItems = items.filter((it) => {
    const matchesCat = selectedCategory === 'ALL' || it.categoryId === selectedCategory;
    const matchesLow = !lowStockOnly || it.isLowStock;
    const matchesQuery =
      !searchQuery ||
      it.nameAr.toLowerCase().includes(searchQuery.toLowerCase()) ||
      it.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (it.barcode && it.barcode.includes(searchQuery)) ||
      (it.partNumber && it.partNumber.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCat && matchesLow && matchesQuery;
  });

  const exportItems = (format: 'excel' | 'pdf', template = false) => {
    const headers = itemExportColumns.map(([header]) => header);
    const rows = template ? [] : filteredItems.map((item) => itemExportColumns.map(([, value]) => value(item)));
    try {
      if (format === 'excel') {
        const records = rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
        exportToExcel(
          'كتالوج-الأصناف',
          records.length ? records : [Object.fromEntries(headers.map((header) => [header, '']))],
        );
      } else {
        exportToPdf('كتالوج الأصناف', headers, rows);
      }
    } catch (exportError: any) {
      error(exportError.message || 'تعذر تصدير الأصناف');
    }
  };

  const handlePrintBarcodes = (selectedItems: any[]) => {
    if (selectedItems.length === 0) {
      error('لا توجد أصناف لطباعة باركودها');
      return;
    }
    setBarcodePrintItems(selectedItems);
  };

  const printSelectedBarcodes = (selectedItems: BarcodeLabelItem[]) => {
    try {
      const result = printBarcodeLabels(selectedItems);
      if (result === 'empty') error('لا توجد أصناف لطباعة باركودها');
      if (result === 'blocked') error('يرجى السماح بالنوافذ المنبثقة لطباعة ملصقات الباركود');
      return result === 'opened';
    } catch (printError: any) {
      error(printError.message || 'تعذرت طباعة ملصقات الباركود');
      return false;
    }
  };

  const handleImportItems = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setImporting(true);
    try {
      const rows = await readExcelRows(file);
      const normalizedHeaders = rows[0].map((header) =>
        header.normalize('NFKC').replace(/[\u200B-\u200F\uFEFF]/g, '').trim().toLocaleLowerCase(),
      );
      const headerAliases: Record<string, string[]> = {
        sku: ['sku', 'كود الصنف', 'كود sku', 'كود الصنف sku', 'item code'],
        nameAr: ['اسم الصنف', 'الاسم العربي', 'namear', 'item name', 'name'],
        nameEn: ['الاسم الإنجليزي', 'الاسم الانجليزي', 'nameen', 'english name'],
        barcode: ['الباركود', 'barcode', 'bar code'],
        partNumber: ['رقم القطعة', 'part number', 'partnumber', 'oem', 'رقم الصنف'],
        category: ['التصنيف', 'category', 'الفئة'],
        unit: ['الوحدة', 'unit', 'وحدة القياس'],
        manufacturer: ['الشركة المصنعة', 'manufacturer', 'المصنع'],
        countryOfOrigin: ['بلد المنشأ', 'country of origin', 'countryoforigin', 'بلد الصنع'],
        defaultLocation: ['موقع التخزين', 'موقع الرف', 'location', 'الموقع'],
        purchasePrice: ['سعر الشراء', 'purchase price', 'purchaseprice', 'تكلفة الشراء'],
        sellPrice: ['سعر البيع', 'sell price', 'sellprice', 'سعر التجزئة'],
        specialSellPrice: ['السعر الخاص', 'special price', 'specialsellprice', 'سعر خاص'],
        minStock: ['الحد الأدنى', 'min stock', 'minstock', 'حد الطلب'],
        maxStock: ['الحد الأقصى', 'max stock', 'maxstock'],
        initialStock: ['رصيد افتتاحي', 'المخزون الافتتاحي', 'initial stock', 'initialstock', 'الكمية الافتتاحية'],
        warehouse: ['المخزن الافتتاحي', 'المخزن', 'warehouse', 'المستودع'],
      };
      const columnIndices = Object.fromEntries(
        Object.entries(headerAliases).map(([field, aliases]) => [
          field,
          normalizedHeaders.findIndex((header) => aliases.includes(header)),
        ]),
      );
      const missingHeaders = ['sku', 'nameAr', 'category', 'unit'].filter((field) => columnIndices[field] < 0);
      if (missingHeaders.length) {
        throw new Error('الأعمدة المطلوبة في الملف هي: SKU، اسم الصنف، التصنيف، والوحدة');
      }

      const importRows = rows.slice(1)
        .filter((row) => row.some((value) => value.trim()))
        .map((row) =>
          Object.fromEntries(
            Object.entries(columnIndices)
              .filter(([, column]) => column >= 0)
              .map(([field, column]) => [field, row[column] || '']),
          ),
        );
      if (!importRows.length) throw new Error('لم يتم العثور على صفوف أصناف أسفل عناوين الأعمدة');

      const result = await api.importItems(importRows);
      setImportReport(result);
      if (result.created > 0) {
        success(`تم استيراد ${result.created} صنف بنجاح`);
        await loadData();
      }
      if (result.created === 0) success('اكتملت مراجعة ملف الأصناف؛ راجع تقرير الاستيراد');
    } catch (importError: any) {
      error(importError.message || 'تعذر استيراد ملف الأصناف');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-brand-600" />
            <span>كتالوج وتعريف أصناف قطع الغيار (Items Master)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            إدارة كروت الأصناف، الباركود، رقم القطعة، مواقع التخزين، وأسعار الشراء والبيع
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handlePrintBarcodes(filteredItems)}
            disabled={filteredItems.length === 0}
            className="flex items-center gap-2 px-3 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-xl text-xs font-bold disabled:opacity-50"
          >
            <Barcode className="w-4 h-4" />
            <span>طباعة باركود النتائج</span>
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleImportItems}
            className="hidden"
            aria-label="استيراد ملف أصناف Excel"
          />
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 px-3 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold disabled:opacity-60"
          >
            <Upload className="w-4 h-4" />
            <span>{importing ? 'جاري الاستيراد...' : 'استيراد Excel'}</span>
          </button>
          <button
            onClick={() => exportItems('excel')}
            className="flex items-center gap-2 px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
          >
            <Download className="w-4 h-4" />
            <span>تصدير Excel</span>
          </button>
          <button
            onClick={() => exportItems('pdf')}
            className="flex items-center gap-2 px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
          >
            <Printer className="w-4 h-4" />
            <span>PDF</span>
          </button>
          <button
            onClick={() => exportItems('excel', true)}
            className="flex items-center gap-2 px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>نموذج Excel</span>
          </button>
          <button
            onClick={handleNewItem}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-md shadow-brand-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة كارت صنف جديد</span>
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="البحث باسم الصنف، كود الـ SKU، الباركود، رقم القطعة OEM..."
              className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-brand-500 outline-none"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
            >
              <option value="ALL">كافة التصنيفات</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <button
              onClick={() => setLowStockOnly(!lowStockOnly)}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
                lowStockOnly
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>الناقص في المخزون</span>
            </button>
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
              <tr>
                <th className="p-3.5">الكود SKU</th>
                <th className="p-3.5">اسم الصنف ورقم القطعة</th>
                <th className="p-3.5">التصنيف</th>
                <th className="p-3.5">الوحدة</th>
                <th className="p-3.5">موقع الرف</th>
                {canManagePrices && (
                  <>
                    <th className="p-3.5">سعر الشراء</th>
                    <th className="p-3.5">سعر البيع</th>
                  </>
                )}
                <th className="p-3.5">المخزون المتاح</th>
                <th className="p-3.5">حد الطلب</th>
                <th className="p-3.5">الباركود</th>
                <th className="p-3.5">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={canManagePrices ? 11 : 9} className="p-8 text-center text-slate-400">
                    جاري تحميل كتالوج الأصناف...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={canManagePrices ? 11 : 9} className="p-12 text-center text-slate-400">
                    لا توجد أصناف مطابقة للبحث
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-slate-700">{item.sku}</td>
                    <td className="p-3.5">
                      <div className="font-bold text-slate-900">{item.nameAr}</div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                        {item.partNumber && <span>OEM: {item.partNumber}</span>}
                        {item.barcode && <span>• باركود: {item.barcode}</span>}
                      </div>
                    </td>
                    <td className="p-3.5 text-slate-600">{item.category?.name}</td>
                    <td className="p-3.5 text-slate-500">{item.unit?.name}</td>
                    <td className="p-3.5 font-mono text-slate-500">{item.defaultLocation || '-'}</td>
                    {canManagePrices && (
                      <>
                        <td className="p-3.5 font-bold text-slate-600 font-mono">{item.purchasePrice} ج.م</td>
                        <td className="p-3.5 font-black text-brand-600 font-mono">{item.sellPrice} ج.م</td>
                      </>
                    )}
                    <td className="p-3.5">
                      <span
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono ${
                          item.totalQuantity <= 0
                            ? 'bg-rose-100 text-rose-800'
                            : item.isLowStock
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {item.totalQuantity} {item.unit?.symbol}
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-400 font-mono">{item.minStock}</td>
                    <td className="p-3.5">
                      <button
                        type="button"
                        onClick={() => handlePrintBarcodes([item])}
                        aria-label={`طباعة باركود ${item.nameAr}`}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-blue-700 hover:bg-blue-50"
                      >
                        <Printer className="h-4 w-4" />
                        <span>طباعة</span>
                      </button>
                    </td>
                    <td className="p-3.5">
                      <button
                        type="button"
                        onClick={() => handleEditItem(item)}
                        aria-label={`تعديل بيانات ${item.nameAr}`}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-brand-700 hover:bg-brand-50"
                      >
                        <Edit2 className="h-4 w-4" />
                        <span>تعديل</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Item Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 overflow-y-auto max-h-[90vh] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Package className="w-5 h-5 text-brand-600" />
                <span>{editingItemId ? 'تعديل كارت الصنف' : 'تعريف كارت صنف جديد (قطع غيار)'}</span>
              </h3>
              <button onClick={() => { setModalOpen(false); setEditingItemId(null); }} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">اسم الصنف بالعربية *</label>
                  <input
                    type="text"
                    required
                    value={formData.nameAr}
                    onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                    placeholder="مثلاً: فحمات فرامل أمامية كامري سيراميك"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">الاسم بالإنجليزية</label>
                  <input
                    type="text"
                    value={formData.nameEn}
                    onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">التصنيف *</label>
                  <select
                    required
                    value={formData.categoryId}
                    onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">الوحدة *</label>
                  <select
                    required
                    value={formData.unitId}
                    onChange={(e) => setFormData({ ...formData, unitId: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  >
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.symbol})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">كود الصنف SKU (اختياري)</label>
                  <input
                    type="text"
                    required={Boolean(editingItemId)}
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    placeholder="توليد تلقائي إن ترك فارغاً"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">رقم الباركود</label>
                  <input
                    type="text"
                    value={formData.barcode}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    placeholder="امسح الباركود أو اتركه للتوليد"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">رقم القطعة Part Number (OEM)</label>
                  <input
                    type="text"
                    value={formData.partNumber}
                    onChange={(e) => setFormData({ ...formData, partNumber: e.target.value })}
                    placeholder="مثلاً: 04465-33480"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">الشركة المصنعة</label>
                  <input
                    type="text"
                    value={formData.manufacturer}
                    onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">بلد المنشأ</label>
                  <input
                    type="text"
                    value={formData.countryOfOrigin}
                    onChange={(e) => setFormData({ ...formData, countryOfOrigin: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">السيارات المتوافقة</label>
                  <textarea
                    rows={3}
                    maxLength={2000}
                    value={formData.fitment}
                    onChange={(e) => setFormData({ ...formData, fitment: e.target.value })}
                    placeholder={'كل سيارة في سطر: الماركة | الموديل | من سنة | إلى سنة\nتويوتا | كامري | 2018 | 2024'}
                    className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">موقع التخزين / الرف</label>
                  <input
                    type="text"
                    value={formData.defaultLocation}
                    onChange={(e) => setFormData({ ...formData, defaultLocation: e.target.value })}
                    placeholder="ممر A - رف 3 - صندوق 12"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                {canManagePrices && (
                  <>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">سعر الشراء (ج.م)</label>
                      <input
                        type="number"
                        required
                        min="0"
                        step="0.01"
                        value={formData.purchasePrice}
                        onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">سعر البيع (ج.م)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.sellPrice}
                        onChange={(e) => setFormData({ ...formData, sellPrice: e.target.value })}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">السعر الخاص (ج.م)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.specialSellPrice}
                        onChange={(e) => setFormData({ ...formData, specialSellPrice: e.target.value })}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block font-bold text-slate-700 mb-1">الحد الأدنى للمخزون (حد إعادة الطلب)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formData.minStock}
                    onChange={(e) => setFormData({ ...formData, minStock: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">الحد الأقصى للمخزون</label>
                  <input
                    type="number"
                    required
                    min={formData.minStock || 0}
                    step="1"
                    value={formData.maxStock}
                    onChange={(e) => setFormData({ ...formData, maxStock: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                {!editingItemId && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">مخزن الرصيد الافتتاحي</label>
                    <select
                      value={formData.initialWarehouseId}
                      onChange={(e) => setFormData({ ...formData, initialWarehouseId: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                    >
                      <option value="">اختر المخزن</option>
                      {warehouses.map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {!editingItemId && <div>
                  <label className="block font-bold text-slate-700 mb-1">رصيد افتتاحي (اختياري)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formData.initialStock}
                    onChange={(e) => setFormData({ ...formData, initialStock: e.target.value })}
                    placeholder="0"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>}
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md shadow-brand-500/20"
                >
                  <Check className="w-4 h-4" />
                  <span>{submitting ? 'جاري الحفظ...' : editingItemId ? 'حفظ التعديلات' : 'حفظ كارت الصنف في المخزن'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setModalOpen(false); setEditingItemId(null); }}
                  className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {importReport && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-bold text-slate-900 text-base">تقرير استيراد الأصناف</h3>
                <p className="text-xs text-slate-500 mt-1">
                  تمت إضافة {importReport.created} صنف، وتخطي {importReport.duplicates.length + importReport.errors.length} صف.
                </p>
              </div>
              <button onClick={() => setImportReport(null)} aria-label="إغلاق تقرير الاستيراد" className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
              {[...importReport.duplicates, ...importReport.errors]
                .sort((a, b) => a.row - b.row)
                .map((issue, index) => (
                  <div key={`${issue.row}-${index}`} className="flex items-start gap-3 p-3 text-xs">
                    <span className="shrink-0 rounded bg-rose-50 px-2 py-1 font-mono font-bold text-rose-700">
                      صف {issue.row}
                    </span>
                    <span className="font-mono text-slate-500">{issue.sku || '-'}</span>
                    <span className="text-slate-700">{issue.reason}</span>
                  </div>
                ))}
              {importReport.duplicates.length + importReport.errors.length === 0 && (
                <p className="p-6 text-center text-sm text-emerald-700">تم استيراد جميع الصفوف بنجاح.</p>
              )}
            </div>
            <div className="flex justify-end">
              <button onClick={() => setImportReport(null)} className="px-5 py-2 bg-slate-100 hover:bg-slate-200 font-bold rounded-xl text-xs">
                إغلاق
              </button>
            </div>
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
