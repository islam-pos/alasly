import React, { useState, useEffect, useRef } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import {
  Search,
  Barcode,
  Camera,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  Check,
  Printer,
  CreditCard,
  Banknote,
  Split,
  User,
  Package,
  X,
  Pause,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { printSalesInvoice } from '../../utils/invoicePrint';
import { getSmartUpsellSuggestions } from '../../utils/smartUpsell';

const matchesVehicleFitment = (fitment: string | null | undefined, vehicle: any) => {
  if (!fitment || !vehicle) return false;
  const normalize = (value: string) => value.trim().toLocaleLowerCase();

  return fitment.split(/\r?\n/).some((line) => {
    const [make, model, fromYear, toYear] = line.split('|').map(normalize);
    if (make !== normalize(vehicle.make) || model !== normalize(vehicle.model)) return false;
    const firstYear = fromYear ? Number(fromYear) : null;
    const lastYear = toYear ? Number(toYear) : null;
    if ((firstYear !== null && !Number.isInteger(firstYear)) || (lastYear !== null && !Number.isInteger(lastYear))) return false;
    return (firstYear === null || vehicle.year >= firstYear) && (lastYear === null || vehicle.year <= lastYear);
  });
};

export const PosScreen: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cart, setCart] = useState<any[]>([]);
  const [heldInvoices, setHeldInvoices] = useState<any[]>([]);
  const [heldInvoicesOpen, setHeldInvoicesOpen] = useState(false);
  const [holdingInvoice, setHoldingInvoice] = useState(false);
  const [freeLineModalOpen, setFreeLineModalOpen] = useState(false);
  const [freeLineName, setFreeLineName] = useState('');
  const [freeLineUnitPrice, setFreeLineUnitPrice] = useState(0);
  const [freeLineQuantity, setFreeLineQuantity] = useState(1);
  const [freeLineAddToInventory, setFreeLineAddToInventory] = useState(false);
  const [freeLineCategoryId, setFreeLineCategoryId] = useState('');
  const [freeLineUnitId, setFreeLineUnitId] = useState('');
  const [freeLineInitialStock, setFreeLineInitialStock] = useState(1);
  const [freeLineCostPrice, setFreeLineCostPrice] = useState(0);
  const [savingFreeLine, setSavingFreeLine] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [compatibleOnly, setCompatibleOnly] = useState(false);
  const [discount, setDiscount] = useState<number>(0);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'CREDIT' | 'SPLIT'>('CASH');
  const [cashPaid, setCashPaid] = useState<number>(0);
  const [cardPaid, setCardPaid] = useState<number>(0);
  const [completedInvoice, setCompletedInvoice] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const { hasPermission } = useAuth();
  const canRegisterInventoryItem = hasPermission('manage_items') && hasPermission('manage_item_prices');
  const { success, error } = useToast();
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<{ stop: () => void } | null>(null);
  const barcodeReadRef = useRef(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [itemsRes, catRes, cusRes, companyRes, vehiclesRes] = await Promise.all([
        api.getItems(),
        api.getCategories(),
        api.getCustomers(),
        api.master.getCompany(),
        api.getVehicles(),
      ]);
      setItems(itemsRes.data);
      setCategories(catRes.data);
      setCustomers(cusRes.data);
      setCompany(companyRes.data);
      setVehicles(vehiclesRes.data);
    } catch (err) {
      console.error(err);
    }
    if (canRegisterInventoryItem) {
      try {
        const unitsRes = await api.getUnits();
        setUnits(unitsRes.data);
      } catch (err) {
        console.error('Could not load units for POS inventory creation:', err);
      }
    }
    try {
      const response = await api.getHeldPosInvoices();
      setHeldInvoices(response.data);
    } catch (err: any) {
      console.error(err);
      error(err.message || 'تعذر تحميل الفواتير المعلقة');
    }
  };

  // Add item to cart
  const addToCart = (item: any) => {
    if (item.availableQuantity <= 0) {
      error(`الصنف (${item.nameAr}) غير متوفر في المخزن حالياً!`);
      return;
    }

    setCart((prev) => {
      const existing = prev.find((i) => i.itemId === item.id);
      if (existing) {
        if (existing.quantity >= item.availableQuantity) {
          error(`لا يمكن إضافة كمية أكبر من المتاح بالمخزون (${item.availableQuantity})`);
          return prev;
        }
        return prev.map((i) => (i.itemId === item.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [
        ...prev,
        {
          cartId: item.id,
          itemId: item.id,
          name: item.nameAr,
          sku: item.sku,
          unitPrice: item.sellPrice,
          costPrice: item.avgCost,
          quantity: 1,
          maxAvailable: item.availableQuantity,
          itemType: 'PART',
        },
      ];
    });
  };

  // Barcode scanner trigger
  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleBarcodeValue(barcodeInput);
  };

  const handleBarcodeValue = async (value: string) => {
    if (!value.trim()) return;
    try {
      const item = await api.lookupItemByBarcode(value.trim());
      if (item) {
        addToCart(item);
        setBarcodeInput('');
        success(`تمت إضافة: ${item.nameAr}`);
      }
    } catch (err: any) {
      error(err.message || 'لم يتم العثور على صنف بهذا الباركود أو كود SKU');
    }
  };

  useEffect(() => {
    if (!cameraScannerOpen || !videoRef.current) return;

    let cancelled = false;
    barcodeReadRef.current = false;
    setCameraError('');
    const reader = new BrowserMultiFormatReader();

    reader.decodeFromConstraints(
      { video: { facingMode: { ideal: 'environment' } } },
      videoRef.current,
      (result, _scanError, controls) => {
      if (cancelled || !result || barcodeReadRef.current) return;
      barcodeReadRef.current = true;
      controls.stop();
      scannerControlsRef.current = null;
      setCameraScannerOpen(false);
      void handleBarcodeValue(result.getText());
      },
    ).then((controls) => {
      if (cancelled) {
        controls.stop();
      } else {
        scannerControlsRef.current = controls;
      }
    }).catch((scanError: unknown) => {
      if (!cancelled) {
        setCameraError(
          scanError instanceof Error
            ? scanError.message
            : 'تعذر تشغيل الكاميرا. تحقق من السماح باستخدامها ومن اتصال آمن (HTTPS).',
        );
      }
    });

    return () => {
      cancelled = true;
      scannerControlsRef.current?.stop();
      scannerControlsRef.current = null;
    };
  }, [cameraScannerOpen]);

  const closeCameraScanner = () => {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    setCameraScannerOpen(false);
  };

  const updateQuantity = (cartId: string, newQty: number) => {
    if (newQty <= 0) {
      removeFromCart(cartId);
      return;
    }
    setCart((prev) =>
      prev.map((i) => {
        if (i.cartId === cartId) {
          if (i.itemId && newQty > i.maxAvailable) {
            error(`الكمية المطلوبة تتجاوز المتاح بالمخزن (${i.maxAvailable})`);
            return i;
          }
          return { ...i, quantity: newQty };
        }
        return i;
      })
    );
  };

  const updateUnitPrice = (cartId: string, unitPrice: number) => {
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return;
    setCart((prev) => prev.map((item) => item.cartId === cartId ? { ...item, unitPrice } : item));
  };

  const removeFromCart = (cartId: string) => {
    setCart((prev) => prev.filter((i) => i.cartId !== cartId));
  };

  const clearCart = () => {
    setCart([]);
    setDiscount(0);
    setSelectedCustomerId('');
    setSelectedVehicleId('');
  };

  const handleHoldInvoice = async () => {
    if (cart.length === 0) {
      error('لا توجد أصناف لتعليق الفاتورة');
      return;
    }
    setHoldingInvoice(true);
    try {
      const response = await api.holdPosInvoice({
        customerId: selectedCustomerId || null,
        vehicleId: selectedVehicleId || null,
        discount,
        items: cart.map(({ itemId, name, quantity, unitPrice }) => ({
          itemId: itemId || null,
          ...(itemId ? {} : { description: name, itemType: 'LABOR' }),
          quantity,
          unitPrice,
        })),
      });
      setHeldInvoices((prev) => [response.data, ...prev]);
      clearCart();
      success('تم تعليق الفاتورة ويمكن استعادتها لاحقاً');
    } catch (err: any) {
      error(err.message || 'تعذر تعليق الفاتورة');
    } finally {
      setHoldingInvoice(false);
    }
  };

  const handleResumeHeldInvoice = async (heldInvoice: any) => {
    if (cart.length > 0) {
      error('علّق الفاتورة الحالية أو أفرغ السلة قبل استعادة فاتورة أخرى');
      return;
    }

    const restoredItems = heldInvoice.items.map((heldItem: any, index: number) => {
      if (heldItem.itemId === null) {
        return {
          cartId: `held-${heldInvoice.id}-${index}`,
          itemId: null,
          name: heldItem.description,
          sku: '',
          unitPrice: heldItem.unitPrice,
          costPrice: 0,
          quantity: heldItem.quantity,
          maxAvailable: null,
          itemType: 'LABOR',
        };
      }
      const product = items.find((item) => item.id === heldItem.itemId);
      if (!product || product.availableQuantity < heldItem.quantity) return null;
      return {
        cartId: product.id,
        itemId: product.id,
        name: product.nameAr,
        sku: product.sku,
        unitPrice: heldItem.unitPrice,
        costPrice: product.avgCost,
        quantity: heldItem.quantity,
        maxAvailable: product.availableQuantity,
        itemType: 'PART',
      };
    });
    if (restoredItems.some((item: any) => item === null)) {
      error('تعذر استعادة الفاتورة لعدم كفاية مخزون أحد أصنافها أو عدم توفره');
      return;
    }

    try {
      await api.deleteHeldPosInvoice(heldInvoice.id);
      setCart(restoredItems);
      setDiscount(heldInvoice.discount);
      setSelectedCustomerId(heldInvoice.customerId || '');
      setSelectedVehicleId(heldInvoice.vehicleId || '');
      setHeldInvoices((prev) => prev.filter((invoice) => invoice.id !== heldInvoice.id));
      setHeldInvoicesOpen(false);
      success('تمت استعادة الفاتورة المعلقة');
    } catch (err: any) {
      error(err.message || 'تعذر استعادة الفاتورة المعلقة');
    }
  };

  const openFreeLineDialog = () => {
    setFreeLineName('');
    setFreeLineUnitPrice(0);
    setFreeLineQuantity(1);
    setFreeLineAddToInventory(false);
    setFreeLineInitialStock(1);
    setFreeLineCostPrice(0);
    setFreeLineCategoryId(categories[0]?.id || '');
    setFreeLineUnitId(units[0]?.id || '');
    setFreeLineModalOpen(true);
  };

  const handleAddFreeLine = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = freeLineName.trim();
    if (!name) {
      error('أدخل وصف البند الحر');
      return;
    }
    if (!Number.isSafeInteger(freeLineQuantity) || freeLineQuantity < 1) {
      error('الكمية يجب أن تكون عددًا صحيحًا موجبًا');
      return;
    }
    if (!Number.isFinite(freeLineUnitPrice) || freeLineUnitPrice < 0) {
      error('سعر الوحدة غير صالح');
      return;
    }

    if (!freeLineAddToInventory) {
      setCart((previous) => [...previous, {
        cartId: `free-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        itemId: null,
        name,
        sku: '',
        unitPrice: freeLineUnitPrice,
        costPrice: 0,
        quantity: freeLineQuantity,
        maxAvailable: null,
        itemType: 'LABOR',
      }]);
      setFreeLineModalOpen(false);
      success('تمت إضافة البند الحر إلى الفاتورة');
      return;
    }

    if (!canRegisterInventoryItem) {
      error('لا تملك صلاحية تسجيل صنف جديد بالمخزون؛ اطلب صلاحية إدارة الأصناف والأسعار');
      return;
    }
    if (!freeLineCategoryId || !freeLineUnitId) {
      error('اختر تصنيف الصنف ووحدة القياس');
      return;
    }
    if (
      !Number.isSafeInteger(freeLineInitialStock)
      || freeLineInitialStock < freeLineQuantity
      || !Number.isFinite(freeLineCostPrice)
      || freeLineCostPrice < 0
    ) {
      error('الرصيد الافتتاحي يجب أن يكون عددًا صحيحًا يغطي كمية البيع، والتكلفة غير سالبة');
      return;
    }

    const normalizeName = (value: string) => value
      .normalize('NFKC')
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[آأإ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/\s+/g, ' ')
      .trim()
      .toLocaleLowerCase();
    if (items.some((item) => item.categoryId === freeLineCategoryId && normalizeName(item.nameAr) === normalizeName(name))) {
      error('يوجد صنف بهذا الاسم في التصنيف؛ ابحث عنه في قائمة الأصناف وأضفه منها');
      return;
    }

    setSavingFreeLine(true);
    try {
      const response = await api.createPosInventoryItem({
        nameAr: name,
        categoryId: freeLineCategoryId,
        unitId: freeLineUnitId,
        sellPrice: freeLineUnitPrice,
        purchasePrice: freeLineCostPrice,
        initialStock: freeLineInitialStock,
        saleQuantity: freeLineQuantity,
      });
      const product = response.data;
      setItems((previous) => [product, ...previous]);
      setCart((previous) => [...previous, {
        cartId: product.id,
        itemId: product.id,
        name: product.nameAr,
        sku: product.sku,
        unitPrice: freeLineUnitPrice,
        costPrice: product.avgCost ?? freeLineCostPrice,
        quantity: freeLineQuantity,
        maxAvailable: product.availableQuantity ?? freeLineInitialStock,
        itemType: 'PART',
      }]);
      setFreeLineModalOpen(false);
      success(`تم تسجيل ${product.nameAr} بالمخزون وإضافته إلى الفاتورة`);
    } catch (err: any) {
      error(err.message || 'تعذر إضافة الصنف إلى المخزون');
    } finally {
      setSavingFreeLine(false);
    }
  };

  // Calculation
  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const taxable = Math.max(0, subtotal - discount);
  const grandTotal = taxable;
  const smartUpsells = getSmartUpsellSuggestions(
    items,
    cart.filter((item) => item.itemId).map((item) => ({ itemId: item.itemId, name: item.name, sku: item.sku })),
    3,
  );

  // Open payment modal
  const openPaymentModal = () => {
    if (cart.length === 0) {
      error('السلة فارغة!');
      return;
    }
    setCashPaid(grandTotal);
    setCardPaid(0);
    setPaymentModalOpen(true);
  };

  // Process checkout
  const handleCheckout = async () => {
    setLoading(true);
    try {
      const payload = {
        customerId: selectedCustomerId || null,
        vehicleId: selectedVehicleId || null,
        items: cart.map((i) => ({
          itemId: i.itemId || null,
          ...(i.itemId ? {} : { description: i.name, itemType: 'LABOR' }),
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
        discount,
        paymentMethod,
        cashPaid: paymentMethod === 'CASH' ? grandTotal : paymentMethod === 'SPLIT' ? cashPaid : 0,
        cardPaid: paymentMethod === 'CARD' ? grandTotal : paymentMethod === 'SPLIT' ? cardPaid : 0,
        notes: 'عملية بيع سريعة عبر نقطة البيع POS',
      };

      const res = await api.posCheckout(payload);
      setCompletedInvoice(res);
      setPaymentModalOpen(false);
      clearCart();
      success(`تم إصدار فاتورة البيع ${res.invoiceNumber} بنجاح!`);
      if (res.whatsappNotification?.sent) {
        success('تم إرسال نسخة PDF للعميل عبر واتساب');
      } else if (selectedCustomerId && res.whatsappNotification?.reason === 'not_configured') {
        error('لم تُرسل الفاتورة عبر واتساب: إعدادات WhatsApp Cloud API غير مكتملة');
      } else if (selectedCustomerId && res.whatsappNotification?.reason === 'no_opt_in_or_number') {
        error('لم تُرسل الفاتورة: رقم واتساب العميل أو موافقته على الاستلام غير مسجل');
      } else if (selectedCustomerId && res.whatsappNotification?.error) {
        error(`تعذر إرسال الفاتورة عبر واتساب: ${res.whatsappNotification.error}`);
      }
      // Refresh inventory items
      loadData();
    } catch (err: any) {
      error(err.message || 'فشلت عملية البيع');
    } finally {
      setLoading(false);
    }
  };

  const handlePrintInvoice = () => {
    try {
      const result = printSalesInvoice(completedInvoice, company, company?.printSettings);
      if (result === 'blocked') error('يرجى السماح بالنوافذ المنبثقة لطباعة الفاتورة');
    } catch (printError: any) {
      error(printError.message || 'تعذرت طباعة الفاتورة');
    }
  };

  // Filter items
  const filteredItems = items.filter((item) => {
    const matchesCat = selectedCategory === 'all' || item.categoryId === selectedCategory;
    const matchesQuery =
      !searchQuery ||
      item.nameAr.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.barcode && item.barcode.includes(searchQuery));
    const vehicle = vehicles.find((entry) => entry.id === selectedVehicleId);
    const matchesFitment = !compatibleOnly || matchesVehicleFitment(item.fitment, vehicle);
    return matchesCat && matchesQuery && matchesFitment;
  });

  const customerVehicles = vehicles.filter((vehicle) => vehicle.customerId === selectedCustomerId);

  return (
    <div className="h-[calc(100vh-7.5rem)] flex flex-col lg:flex-row gap-4">
      {/* 1. Left Catalog Area (Items Grid) */}
      <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        {/* Search & Barcode Header */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Barcode Fast Reader */}
            <form onSubmit={handleBarcodeSubmit} className="flex-1 relative">
              <input
                ref={barcodeInputRef}
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="امسح الباركود أو أدخل كود SKU..."
                className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono font-medium focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
              />
              <Barcode className="w-5 h-5 text-slate-400 absolute right-3 top-2.5" />
            </form>
            <button
              type="button"
              onClick={() => setCameraScannerOpen(true)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold"
            >
              <Camera className="w-4 h-4" />
              مسح بالكاميرا
            </button>

            {/* Keyword Search */}
            <div className="flex-1 relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="البحث باسم الصنف أو رقم القطعة..."
                className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
              />
              <Search className="w-5 h-5 text-slate-400 absolute right-3 top-2.5" />
            </div>
          </div>

          {/* Category Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors whitespace-nowrap ${
                selectedCategory === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              كافة الأصناف ({items.length})
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCategory(c.id)}
                className={`px-3 py-1.5 rounded-lg font-bold transition-colors whitespace-nowrap ${
                  selectedCategory === c.id
                    ? 'bg-brand-600 text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Items Grid */}
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 content-start">
          {filteredItems.map((item) => {
            const isOutOfStock = item.availableQuantity <= 0;
            return (
              <div
                key={item.id}
                onClick={() => !isOutOfStock && addToCart(item)}
                className={`p-3 rounded-xl border transition-all flex flex-col justify-between select-none ${
                  isOutOfStock
                    ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                    : 'bg-white border-slate-200 hover:border-brand-400 hover:shadow-md cursor-pointer group'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                      {item.sku}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        isOutOfStock
                          ? 'bg-rose-100 text-rose-700'
                          : item.availableQuantity <= item.minStock
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      المتاح: {item.availableQuantity}
                    </span>
                  </div>

                  <h3 className="text-xs font-bold text-slate-800 line-clamp-2 leading-relaxed group-hover:text-brand-700">
                    {item.nameAr}
                  </h3>
                  {item.defaultLocation && (
                    <div className="text-[10px] text-slate-400 mt-1">الرف: {item.defaultLocation}</div>
                  )}
                </div>

                <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-black text-brand-600">{item.sellPrice}</span>
                    <span className="text-[10px] text-slate-400 mr-1">ج.م</span>
                  </div>
                  <button
                    disabled={isOutOfStock}
                    className="w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-brand-600 group-hover:text-white flex items-center justify-center transition-colors text-slate-500"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Right Cart & Checkout Area */}
      <div className="w-full lg:w-96 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        {/* Cart Header & Customer Picker */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
              <ShoppingCart className="w-4 h-4 text-brand-600" />
              <span>سلة المبيعات ({cart.length})</span>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
              <button
                type="button"
                onClick={openFreeLineDialog}
                title="إضافة بند غير مسجل إلى الفاتورة"
                className="text-[11px] text-violet-700 hover:text-violet-800 font-bold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                بند حر
              </button>
              <button
                type="button"
                onClick={handleHoldInvoice}
                disabled={cart.length === 0 || holdingInvoice}
                title="احفظ الفاتورة الحالية مؤقتاً لخدمة عميل آخر ثم استعدها لاحقاً"
                className="text-[11px] text-amber-700 hover:text-amber-800 font-bold flex items-center gap-1 disabled:opacity-40"
              >
                <Pause className="w-3.5 h-3.5" />
                تعليق
              </button>
              <button
                onClick={() => setHeldInvoicesOpen((open) => !open)}
                className="text-[11px] text-brand-700 hover:text-brand-800 font-bold flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                معلقة ({heldInvoices.length})
              </button>
              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  className="text-[11px] text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  تفريغ
                </button>
              )}
            </div>
          </div>

          <p className="text-[10px] text-slate-500">
            علّق الفاتورة الحالية لبدء بيع جديد، ثم استعدها من قائمة الفواتير المعلقة.
          </p>

          {heldInvoicesOpen && (
            <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
              {heldInvoices.length === 0 ? (
                <p className="py-2 text-center text-[11px] text-slate-500">لا توجد فواتير معلقة</p>
              ) : heldInvoices.map((invoice) => {
                const customerName = customers.find((customer) => customer.id === invoice.customerId)?.name || 'عميل نقدي';
                const total = invoice.items.reduce(
                  (sum: number, item: any) => sum + item.unitPrice * item.quantity,
                  0,
                ) - invoice.discount;
                return (
                  <div key={invoice.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5">
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-bold text-slate-700">{customerName}</div>
                      <div className="text-[10px] text-slate-500">{Math.max(0, total).toFixed(2)} ج.م</div>
                      <div className="text-[9px] text-slate-400">
                        {invoice.items.length} بند · {new Date(invoice.createdAt).toLocaleString('ar-EG')}
                      </div>
                    </div>
                    <button
                      onClick={() => handleResumeHeldInvoice(invoice)}
                      className="shrink-0 rounded-md bg-brand-50 px-2 py-1 text-[10px] font-bold text-brand-700 hover:bg-brand-100"
                    >
                      استعادة
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Customer Selection */}
          <div className="relative">
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="w-full py-2 pr-8 pl-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:border-brand-500"
            >
              <option value="">عميل نقدي سريع (افتراضي)</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.phone}) - {c.customerType === 'COMPANY' ? 'شركة' : 'فرد'}
                </option>
              ))}
            </select>
            <User className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>
          {selectedCustomerId && (
            <select
              value={selectedVehicleId}
              onChange={(event) => setSelectedVehicleId(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
            >
              <option value="">اختر سيارة العميل</option>
              {customerVehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>{vehicle.make} {vehicle.model} • {vehicle.year} • {vehicle.plateNumber}</option>
              ))}
            </select>
          )}
          <label className={`flex items-center gap-2 text-xs font-semibold ${selectedVehicleId ? 'text-slate-700' : 'text-slate-400'}`}>
            <input
              type="checkbox"
              checked={compatibleOnly}
              disabled={!selectedVehicleId}
              onChange={(event) => setCompatibleOnly(event.target.checked)}
              className="h-4 w-4 accent-emerald-700"
            />
            عرض القطع المسجلة كتوافق لهذه السيارة فقط
          </label>
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12 text-slate-400">
              <Package className="w-12 h-12 text-slate-200 mb-2 stroke-[1.5]" />
              <p className="text-xs font-bold text-slate-500">السلة فارغة حالياً</p>
              <p className="text-[11px] text-slate-400 mt-0.5">انقر على أي صنف أو امسح الباركود لإضافته</p>
            </div>
          ) : (
            cart.map((it) => (
              <div
                key={it.cartId}
                className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between gap-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-slate-800 truncate">{it.name}</div>
                  <div className="text-[11px] text-brand-600 font-bold mt-0.5">
                    <label className="inline-flex items-center gap-1">
                      <span>السعر:</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={it.unitPrice}
                        aria-label={`سعر ${it.name}`}
                        onChange={(event) => updateUnitPrice(it.cartId, Number(event.target.value))}
                        className="w-20 rounded border border-slate-300 bg-white px-1 py-0.5 text-center text-[11px] font-bold text-slate-800"
                      />
                    </label>
                    {' '}ج.م × {it.quantity} ={' '}
                    <span className="text-slate-900 font-black">{it.unitPrice * it.quantity} ج.م</span>
                  </div>
                </div>

                {/* Qty controls */}
                <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border border-slate-200">
                  <button
                    onClick={() => updateQuantity(it.cartId, it.quantity - 1)}
                    className="w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:bg-slate-100"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="text-xs font-bold w-6 text-center font-mono">{it.quantity}</span>
                  <button
                    onClick={() => updateQuantity(it.cartId, it.quantity + 1)}
                    className="w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:bg-slate-100"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                <button
                  onClick={() => removeFromCart(it.cartId)}
                  className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
          {smartUpsells.length > 0 && (
            <section aria-label="اقتراحات البيع الذكي" className="mt-3 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-black text-violet-900">
                <Sparkles className="h-4 w-4 text-violet-600" />
                اقتراحات بيع من الأصناف المتاحة
              </div>
              <div className="space-y-2">
                {smartUpsells.map(({ item, reason }) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 rounded-xl border border-violet-100 bg-white px-2.5 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-bold text-slate-800">{item.nameAr}</p>
                      <p className="truncate text-[9px] text-slate-500">{reason}</p>
                      <p className="mt-0.5 text-[10px] font-black text-brand-700">{item.sellPrice.toLocaleString()} ج.م · متاح {item.availableQuantity}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => addToCart(item)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-800 transition hover:bg-violet-200"
                      aria-label={`إضافة ${item.nameAr} إلى السلة`}
                      title="إضافة إلى السلة"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Totals & Checkout Button */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>المجموع الفرعي:</span>
            <span className="font-bold">{subtotal.toLocaleString()} ج.م</span>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>الخصم:</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="0"
                value={discount}
                onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                className="w-16 px-1.5 py-0.5 bg-white border border-slate-300 rounded text-xs text-center font-bold"
              />
              <span>ج.م</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>الإجمالي بعد الخصم:</span>
            <span className="font-bold">{grandTotal.toFixed(2)} ج.م</span>
          </div>

          <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-base font-black text-slate-900">
            <span>الإجمالي النهائي:</span>
            <span className="text-brand-600 text-lg">{grandTotal.toFixed(2)} ج.م</span>
          </div>

          <button
            disabled={cart.length === 0}
            onClick={openPaymentModal}
            className="w-full mt-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/25 transition-all text-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <CreditCard className="w-4 h-4" />
            <span>متابعة الدفع والتحصيل</span>
          </button>
        </div>
      </div>

      {/* 3. Payment Dialog Modal (Section 6) */}
      {paymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">طريقة الدفع وإصدار الفاتورة</h3>
              <button
                onClick={() => setPaymentModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-brand-50 p-4 rounded-2xl border border-brand-100 text-center">
              <div className="text-xs text-brand-700 font-bold">المبلغ المطلوب سداده</div>
              <div className="text-2xl font-black text-brand-900 mt-1">{grandTotal.toFixed(2)} ج.م</div>
            </div>

            {/* Payment Method Selector */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('CASH')}
                className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  paymentMethod === 'CASH'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <Banknote className="w-4 h-4" />
                <span>نقدي (كاش)</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('CARD')}
                className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  paymentMethod === 'CARD'
                    ? 'bg-blue-50 border-blue-500 text-blue-800'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                <span>شبكة / بطاقة</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('SPLIT')}
                className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  paymentMethod === 'SPLIT'
                    ? 'bg-purple-50 border-purple-500 text-purple-800'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <Split className="w-4 h-4" />
                <span>تقسيم الدفع</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('CREDIT')}
                className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  paymentMethod === 'CREDIT'
                    ? 'bg-amber-50 border-amber-500 text-amber-800'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <User className="w-4 h-4" />
                <span>آجل (على الحساب)</span>
              </button>
            </div>

            {/* Split Payment Inputs */}
            {paymentMethod === 'SPLIT' && (
              <div className="space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">المدفوع نقداً (كاش):</label>
                  <input
                    type="number"
                    value={cashPaid}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setCashPaid(val);
                      setCardPaid(Math.max(0, grandTotal - val));
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-bold mb-1">المدفوع شبكة (بطاقة):</label>
                  <input
                    type="number"
                    value={cardPaid}
                    onChange={(e) => setCardPaid(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-bold"
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleCheckout}
              disabled={loading}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/25 transition-all text-sm flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  <span>تأكيد وطباعة الفاتورة</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {freeLineModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <form onSubmit={handleAddFreeLine} className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black text-slate-900">إضافة بند حر للفاتورة</h2>
                <p className="mt-1 text-xs text-slate-500">استخدمه لخدمة أو صنف غير مسجل في قائمة المخزون.</p>
              </div>
              <button
                type="button"
                onClick={() => setFreeLineModalOpen(false)}
                aria-label="إغلاق نافذة البند الحر"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <label className="block space-y-1 text-xs font-bold text-slate-700">
              <span>وصف البند</span>
              <input
                autoFocus
                required
                maxLength={200}
                value={freeLineName}
                onChange={(event) => setFreeLineName(event.target.value)}
                placeholder="مثال: خدمة تركيب أو قطعة غير مسجلة"
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-medium outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-xs font-bold text-slate-700">
                <span>سعر الوحدة (ج.م)</span>
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={freeLineUnitPrice}
                  onChange={(event) => setFreeLineUnitPrice(Number(event.target.value))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
                />
              </label>
              <label className="space-y-1 text-xs font-bold text-slate-700">
                <span>الكمية</span>
                <input
                  required
                  type="number"
                  min="1"
                  step="1"
                  value={freeLineQuantity}
                  onChange={(event) => setFreeLineQuantity(Number(event.target.value))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
                />
              </label>
            </div>

            <label className={`flex items-start gap-2 rounded-xl border p-3 text-xs ${canRegisterInventoryItem ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
              <input
                type="checkbox"
                checked={freeLineAddToInventory}
                disabled={!canRegisterInventoryItem}
                onChange={(event) => setFreeLineAddToInventory(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-emerald-700"
              />
              <span>
                <strong className="block">تسجيله صنفًا جديدًا بالمخزون</strong>
                {canRegisterInventoryItem
                  ? 'ينشئ الصنف ورصيده الافتتاحي بالمخزن الرئيسي؛ ويخصم النظام كمية البيع عند إصدار الفاتورة.'
                  : 'تتطلب هذه الخطوة صلاحية إدارة الأصناف والأسعار؛ ما زال بإمكانك إضافة البند للفاتورة فقط.'}
              </span>
            </label>

            {freeLineAddToInventory && (
              <div className="space-y-3 rounded-xl border border-emerald-100 bg-white p-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1 text-xs font-bold text-slate-700">
                    <span>التصنيف</span>
                    <select
                      required
                      value={freeLineCategoryId}
                      onChange={(event) => setFreeLineCategoryId(event.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs"
                    >
                      <option value="">اختر التصنيف</option>
                      {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1 text-xs font-bold text-slate-700">
                    <span>وحدة القياس</span>
                    <select
                      required
                      value={freeLineUnitId}
                      onChange={(event) => setFreeLineUnitId(event.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs"
                    >
                      <option value="">اختر الوحدة</option>
                      {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.symbol})</option>)}
                    </select>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1 text-xs font-bold text-slate-700">
                    <span>الرصيد الافتتاحي الفعلي</span>
                    <input
                      required
                      type="number"
                      min={freeLineQuantity}
                      step="1"
                      value={freeLineInitialStock}
                      onChange={(event) => setFreeLineInitialStock(Number(event.target.value))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-xs font-bold text-slate-700">
                    <span>تكلفة الوحدة (ج.م)</span>
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      value={freeLineCostPrice}
                      onChange={(event) => setFreeLineCostPrice(Number(event.target.value))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
              </div>
            )}

            <div className="flex gap-2 border-t border-slate-100 pt-3">
              <button type="button" onClick={() => setFreeLineModalOpen(false)} className="flex-1 rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-200">
                إلغاء
              </button>
              <button
                type="submit"
                disabled={savingFreeLine || (freeLineAddToInventory && !canRegisterInventoryItem)}
                className="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {savingFreeLine ? 'جارٍ الإضافة...' : freeLineAddToInventory ? 'إنشاء الصنف وإضافته' : 'إضافة للفاتورة'}
              </button>
            </div>
          </form>
        </div>
      )}

      {cameraScannerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b p-4">
              <div>
                <h2 className="font-bold text-slate-900">قراءة الباركود بالكاميرا</h2>
                <p className="mt-1 text-xs text-slate-500">وجّه الكاميرا نحو الباركود حتى يتم التقاطه تلقائياً</p>
              </div>
              <button
                type="button"
                onClick={closeCameraScanner}
                aria-label="إغلاق قارئ الكاميرا"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <video
                ref={videoRef}
                className="aspect-video w-full rounded-xl bg-black object-cover"
                muted
                playsInline
              />
              {cameraError && (
                <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                  {cameraError}
                </p>
              )}
              <p className="text-xs text-slate-500">
                يلزم السماح بالوصول للكاميرا، ويجب فتح النظام عبر HTTPS أو localhost.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 4. Completed Invoice Receipt Modal */}
      {completedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 text-center space-y-4">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <Check className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900">تمت العملية بنجاح!</h3>
              <p className="text-xs font-mono font-bold text-slate-500 mt-1">
                رقم الفاتورة: {completedInvoice.invoiceNumber}
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-right space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">العميل:</span>
                <span className="font-bold">{completedInvoice.customer?.name || 'عميل نقدي'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">الإجمالي شامل الضريبة:</span>
                <span className="font-bold text-emerald-600">{completedInvoice.grandTotal} ج.م</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">طريقة الدفع:</span>
                <span className="font-bold">{completedInvoice.paymentMethod}</span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handlePrintInvoice}
                className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة الإيصال</span>
              </button>
              <button
                onClick={() => setCompletedInvoice(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
