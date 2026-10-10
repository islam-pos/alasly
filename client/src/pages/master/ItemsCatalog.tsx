import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

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

  // Form State
  const [formData, setFormData] = useState<any>({
    nameAr: '',
    nameEn: '',
    sku: '',
    barcode: '',
    partNumber: '',
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
      setItems(itemsRes);
      setCategories(catRes);
      setUnits(unitRes);
      setWarehouses(whRes);
      if (catRes.length > 0) setFormData((prev: any) => ({ ...prev, categoryId: catRes[0].id }));
      if (unitRes.length > 0) setFormData((prev: any) => ({ ...prev, unitId: unitRes[0].id }));
      if (whRes.length > 0) setFormData((prev: any) => ({ ...prev, initialWarehouseId: whRes[0].id }));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nameAr || !formData.categoryId || !formData.unitId) {
      error('يرجى ملء اسم الصنف، التصنيف والوحدة');
      return;
    }

    setSubmitting(true);
    try {
      await api.createItem(formData);
      success('تمت إضافة الصنف بنجاح!');
      setModalOpen(false);
      setFormData({
        nameAr: '',
        nameEn: '',
        sku: '',
        barcode: '',
        partNumber: '',
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
      loadData();
    } catch (err: any) {
      error(err.message || 'فشل حفظ الصنف');
    } finally {
      setSubmitting(false);
    }
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

        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-md shadow-brand-500/20"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة كارت صنف جديد</span>
        </button>
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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={canManagePrices ? 9 : 7} className="p-8 text-center text-slate-400">
                    جاري تحميل كتالوج الأصناف...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={canManagePrices ? 9 : 7} className="p-12 text-center text-slate-400">
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
                        <td className="p-3.5 font-bold text-slate-600 font-mono">{item.purchasePrice} ر.س</td>
                        <td className="p-3.5 font-black text-brand-600 font-mono">{item.sellPrice} ر.س</td>
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Item Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 overflow-y-auto max-h-[90vh] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Package className="w-5 h-5 text-brand-600" />
                <span>تعريف كارت صنف جديد (قطع غيار)</span>
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
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
                  <label className="block font-bold text-slate-700 mb-1">التصنيف *</label>
                  <select
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
                      <label className="block font-bold text-slate-700 mb-1">سعر الشراء (ر.س)</label>
                      <input
                        type="number"
                        value={formData.purchasePrice}
                        onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">سعر البيع (ر.س)</label>
                      <input
                        type="number"
                        value={formData.sellPrice}
                        onChange={(e) => setFormData({ ...formData, sellPrice: e.target.value })}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block font-bold text-slate-700 mb-1">الحد الأدنى للمخزون (حد إعادة الطلب)</label>
                  <input
                    type="number"
                    value={formData.minStock}
                    onChange={(e) => setFormData({ ...formData, minStock: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">رصيد افتتاحي (اختياري)</label>
                  <input
                    type="number"
                    value={formData.initialStock}
                    onChange={(e) => setFormData({ ...formData, initialStock: e.target.value })}
                    placeholder="0"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md shadow-brand-500/20"
                >
                  <Check className="w-4 h-4" />
                  <span>{submitting ? 'جاري الحفظ...' : 'حفظ كارت الصنف في المخزن'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
