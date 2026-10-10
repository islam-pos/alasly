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
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { printSalesInvoice } from '../../utils/invoicePrint';

export const PosScreen: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cart, setCart] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [discount, setDiscount] = useState<number>(0);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'CREDIT' | 'SPLIT'>('CASH');
  const [cashPaid, setCashPaid] = useState<number>(0);
  const [cardPaid, setCardPaid] = useState<number>(0);
  const [completedInvoice, setCompletedInvoice] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(false);

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
      const [itemsRes, catRes, cusRes, companyRes] = await Promise.all([
        api.getItems(),
        api.getCategories(),
        api.getCustomers(),
        api.master.getCompany(),
      ]);
      setItems(itemsRes.data);
      setCategories(catRes.data);
      setCustomers(cusRes.data);
      setCompany(companyRes.data);
    } catch (err) {
      console.error(err);
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
          itemId: item.id,
          name: item.nameAr,
          sku: item.sku,
          unitPrice: item.sellPrice,
          costPrice: item.avgCost,
          quantity: 1,
          maxAvailable: item.availableQuantity,
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
      error(err.message || 'الصنف غير موجود بهذا الباركود');
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

  const updateQuantity = (itemId: string, newQty: number) => {
    if (newQty <= 0) {
      removeFromCart(itemId);
      return;
    }
    setCart((prev) =>
      prev.map((i) => {
        if (i.itemId === itemId) {
          if (newQty > i.maxAvailable) {
            error(`الكمية المطلوبة تتجاوز المتاح بالمخزن (${i.maxAvailable})`);
            return i;
          }
          return { ...i, quantity: newQty };
        }
        return i;
      })
    );
  };

  const removeFromCart = (itemId: string) => {
    setCart((prev) => prev.filter((i) => i.itemId !== itemId));
  };

  const clearCart = () => {
    setCart([]);
    setDiscount(0);
    setSelectedCustomerId('');
  };

  // Calculation
  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const taxable = Math.max(0, subtotal - discount);
  const taxAmount = (taxable * 15) / 100;
  const grandTotal = taxable + taxAmount;

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
        items: cart.map((i) => ({
          itemId: i.itemId,
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
    return matchesCat && matchesQuery;
  });

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
                placeholder="مسح الباركود مباشرة (أو اضغط Enter)..."
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
                placeholder="البحث باسم الصنف، كود الـ SKU، رقم القطعة..."
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
                    <span className="text-[10px] text-slate-400 mr-1">ر.س</span>
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
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-xs text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                تفريغ
              </button>
            )}
          </div>

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
                key={it.itemId}
                className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between gap-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-slate-800 truncate">{it.name}</div>
                  <div className="text-[11px] text-brand-600 font-bold mt-0.5">
                    {it.unitPrice} ر.س × {it.quantity} ={' '}
                    <span className="text-slate-900 font-black">{it.unitPrice * it.quantity} ر.س</span>
                  </div>
                </div>

                {/* Qty controls */}
                <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border border-slate-200">
                  <button
                    onClick={() => updateQuantity(it.itemId, it.quantity - 1)}
                    className="w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:bg-slate-100"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="text-xs font-bold w-6 text-center font-mono">{it.quantity}</span>
                  <button
                    onClick={() => updateQuantity(it.itemId, it.quantity + 1)}
                    className="w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:bg-slate-100"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                <button
                  onClick={() => removeFromCart(it.itemId)}
                  className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Totals & Checkout Button */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>المجموع الفرعي:</span>
            <span className="font-bold">{subtotal.toLocaleString()} ر.س</span>
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
              <span>ر.س</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>ضريبة القيمة المضافة (15%):</span>
            <span className="font-bold">{taxAmount.toFixed(2)} ر.س</span>
          </div>

          <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-base font-black text-slate-900">
            <span>الإجمالي النهائي:</span>
            <span className="text-brand-600 text-lg">{grandTotal.toFixed(2)} ر.س</span>
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
              <div className="text-2xl font-black text-brand-900 mt-1">{grandTotal.toFixed(2)} ر.س</div>
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
                <span className="font-bold text-emerald-600">{completedInvoice.grandTotal} ر.س</span>
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
