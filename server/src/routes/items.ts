import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { logAudit } from '../middleware/audit';

const router = Router();

const parseImportedNumber = (value: unknown, fallback: number) => {
  if (value === null || value === undefined || value === '') return fallback;
  const normalized = String(value).replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/,/g, '').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
};

// Search or list items
router.get('/', async (req, res) => {
  try {
    const { q, categoryId, warehouseId, lowStock } = req.query;

    let whereClause: any = { active: true };

    if (q) {
      const searchStr = String(q).trim();
      whereClause.OR = [
        { nameAr: { contains: searchStr } },
        { nameEn: { contains: searchStr } },
        { sku: { contains: searchStr } },
        { barcode: { contains: searchStr } },
        { partNumber: { contains: searchStr } },
      ];
    }

    if (categoryId) {
      whereClause.categoryId = String(categoryId);
    }

    const items = await prisma.item.findMany({
      where: whereClause,
      include: {
        category: true,
        unit: true,
        stockBalances: {
          include: { warehouse: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate total available quantity and filter low stock if requested
    const formatted = items.map((item) => {
      const totalQty = item.stockBalances.reduce((sum, sb) => sum + sb.quantity, 0);
      const totalReserved = item.stockBalances.reduce((sum, sb) => sum + sb.reservedQty, 0);
      return {
        ...item,
        totalQuantity: totalQty,
        availableQuantity: totalQty - totalReserved,
        isLowStock: totalQty <= item.minStock,
      };
    });

    if (lowStock === 'true') {
      return res.json(formatted.filter((i) => i.isLowStock));
    }

    res.json(formatted);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/import', async (req, res) => {
  const rows = req.body?.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'ملف الاستيراد لا يحتوي على أصناف' });
  }
  if (rows.length > 2000) {
    return res.status(400).json({ error: 'الحد الأقصى للاستيراد هو 2000 صنف في المرة الواحدة' });
  }

  try {
    const [categories, units, warehouses] = await Promise.all([
      prisma.itemCategory.findMany({ select: { id: true, name: true } }),
      prisma.unit.findMany({ select: { id: true, name: true } }),
      prisma.warehouse.findMany({ select: { id: true, name: true }, where: { active: true } }),
    ]);
    const created: string[] = [];
    const duplicates: { row: number; sku: string; reason: string }[] = [];
    const errors: { row: number; sku?: string; reason: string }[] = [];
    const seenSkus = new Set<string>();
    const seenBarcodes = new Set<string>();

    for (const [index, rawRow] of rows.entries()) {
      const rowNumber = index + 2;
      if (!rawRow || typeof rawRow !== 'object' || Array.isArray(rawRow)) {
        errors.push({ row: rowNumber, reason: 'بيانات الصف غير صالحة' });
        continue;
      }

      const row = rawRow as Record<string, unknown>;
      const nameAr = String(row.nameAr || '').trim();
      const sku = String(row.sku || '').trim();
      const barcode = String(row.barcode || '').trim();
      const categoryValue = String(row.categoryId || row.category || '').trim();
      const unitValue = String(row.unitId || row.unit || '').trim();
      const category = categories.find((entry) => entry.id === categoryValue || entry.name.toLocaleLowerCase() === categoryValue.toLocaleLowerCase());
      const unit = units.find((entry) => entry.id === unitValue || entry.name.toLocaleLowerCase() === unitValue.toLocaleLowerCase());
      const warehouseValue = String(row.initialWarehouseId || row.warehouse || '').trim();
      const warehouse = warehouseValue
        ? warehouses.find((entry) => entry.id === warehouseValue || entry.name.toLocaleLowerCase() === warehouseValue.toLocaleLowerCase())
        : undefined;
      const purchasePrice = parseImportedNumber(row.purchasePrice, 0);
      const sellPrice = parseImportedNumber(row.sellPrice, 0);
      const specialSellPrice = parseImportedNumber(row.specialSellPrice, 0);
      const minStock = parseImportedNumber(row.minStock, 5);
      const maxStock = parseImportedNumber(row.maxStock, 100);
      const initialStock = parseImportedNumber(row.initialStock, 0);

      if (!nameAr || !sku || !category || !unit) {
        errors.push({
          row: rowNumber,
          sku: sku || undefined,
          reason: !nameAr ? 'اسم الصنف مطلوب' : !sku ? 'كود SKU مطلوب' : !category ? 'التصنيف غير موجود؛ استخدم اسم تصنيف صحيحًا' : 'الوحدة غير موجودة؛ استخدم اسم وحدة صحيحًا',
        });
        continue;
      }
      if ([purchasePrice, sellPrice, specialSellPrice, minStock, maxStock, initialStock].some((value) => Number.isNaN(value) || value < 0)
        || !Number.isInteger(minStock) || !Number.isInteger(maxStock) || !Number.isInteger(initialStock)) {
        errors.push({ row: rowNumber, sku, reason: 'الأسعار والكميات يجب أن تكون أرقامًا غير سالبة، والكميات أعدادًا صحيحة' });
        continue;
      }
      if (initialStock > 0 && !warehouse) {
        errors.push({ row: rowNumber, sku, reason: 'حدد مخزنًا صحيحًا عند استيراد رصيد افتتاحي أكبر من صفر' });
        continue;
      }

      const skuKey = sku.toLocaleLowerCase();
      const barcodeKey = barcode.toLocaleLowerCase();
      if (seenSkus.has(skuKey) || await prisma.item.findUnique({ where: { sku } })) {
        duplicates.push({ row: rowNumber, sku, reason: 'كود SKU موجود مسبقًا؛ تم تخطي الصف' });
        continue;
      }
      if (barcode && (seenBarcodes.has(barcodeKey) || await prisma.item.findUnique({ where: { barcode } }))) {
        duplicates.push({ row: rowNumber, sku, reason: 'الباركود مستخدم في صنف آخر؛ تم تخطي الصف' });
        continue;
      }

      try {
        const item = await prisma.$transaction(async (tx) => {
          const createdItem = await tx.item.create({
            data: {
              nameAr,
              nameEn: String(row.nameEn || '').trim() || null,
              sku,
              barcode: barcode || null,
              partNumber: String(row.partNumber || '').trim() || null,
              categoryId: category.id,
              unitId: unit.id,
              manufacturer: String(row.manufacturer || '').trim() || null,
              countryOfOrigin: String(row.countryOfOrigin || '').trim() || null,
              defaultLocation: String(row.defaultLocation || '').trim() || null,
              purchasePrice,
              avgCost: purchasePrice,
              sellPrice,
              specialSellPrice,
              minStock,
              maxStock,
            },
          });

          if (initialStock > 0 && warehouse) {
            await tx.stockBalance.create({
              data: { itemId: createdItem.id, warehouseId: warehouse.id, quantity: initialStock },
            });
            await tx.stockTransaction.create({
              data: {
                itemId: createdItem.id,
                warehouseId: warehouse.id,
                type: 'ADJUSTMENT',
                quantity: initialStock,
                unitCost: purchasePrice,
                totalCost: initialStock * purchasePrice,
                referenceType: 'Initial',
                notes: 'رصيد افتتاحي عند استيراد الصنف',
              },
            });
          }
          return createdItem;
        });
        seenSkus.add(skuKey);
        if (barcode) seenBarcodes.add(barcodeKey);
        created.push(item.nameAr);
        await logAudit({ action: 'CREATE', entity: 'Item', entityId: item.id, details: `استيراد صنف: ${item.nameAr} (${item.sku})` });
      } catch (error) {
        console.error(`Failed to import item at row ${rowNumber}:`, error);
        errors.push({ row: rowNumber, sku, reason: 'فشل حفظ الصنف؛ تحقق من عدم تكرار SKU أو الباركود والبيانات المرتبطة' });
      }
    }

    res.json({ created: created.length, duplicates, errors });
  } catch (error) {
    console.error('Failed to import item spreadsheet:', error);
    res.status(500).json({ error: 'تعذر استيراد ملف الأصناف' });
  }
});

// Fast lookup by barcode or SKU for POS and scanner
router.get('/lookup/:code', async (req, res) => {
  try {
    const code = req.params.code.trim();
    const item = await prisma.item.findFirst({
      where: {
        OR: [{ barcode: code }, { sku: code }, { partNumber: code }],
        active: true,
      },
      include: {
        category: true,
        unit: true,
        stockBalances: { include: { warehouse: true } },
      },
    });

    if (!item) {
      return res.status(404).json({ error: 'لم يتم العثور على صنف بهذا الباركود أو الكود' });
    }

    const totalQty = item.stockBalances.reduce((sum, sb) => sum + sb.quantity, 0);
    res.json({
      ...item,
      totalQuantity: totalQty,
      availableQuantity: totalQty,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Single item details with movement history
router.get('/:id', async (req, res) => {
  try {
    const item = await prisma.item.findUnique({
      where: { id: req.params.id },
      include: {
        category: true,
        unit: true,
        stockBalances: { include: { warehouse: true } },
        stockTransactions: {
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: { warehouse: true },
        },
      },
    });

    if (!item) return res.status(404).json({ error: 'الصنف غير موجود' });

    const totalQty = item.stockBalances.reduce((sum, sb) => sum + sb.quantity, 0);
    res.json({
      ...item,
      totalQuantity: totalQty,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create item
router.post('/', async (req, res) => {
  try {
    const { initialWarehouseId, initialStock, ...itemData } = req.body;

    const count = await prisma.item.count();
    const sku = itemData.sku || `SKU-${String(count + 1).padStart(4, '0')}`;
    const barcode = itemData.barcode || `628${String(Date.now()).slice(-9)}`;

    const item = await prisma.item.create({
      data: {
        ...itemData,
        sku,
        barcode,
        purchasePrice: parseFloat(itemData.purchasePrice) || 0,
        avgCost: parseFloat(itemData.purchasePrice) || 0,
        sellPrice: parseFloat(itemData.sellPrice) || 0,
        specialSellPrice: parseFloat(itemData.specialSellPrice) || parseFloat(itemData.sellPrice) * 0.9 || 0,
        minStock: parseInt(itemData.minStock) || 5,
        maxStock: parseInt(itemData.maxStock) || 100,
      },
    });

    // If initial stock is specified
    if (initialWarehouseId && initialStock > 0) {
      await prisma.stockBalance.create({
        data: {
          itemId: item.id,
          warehouseId: initialWarehouseId,
          quantity: parseInt(initialStock),
        },
      });

      await prisma.stockTransaction.create({
        data: {
          itemId: item.id,
          warehouseId: initialWarehouseId,
          type: 'ADJUSTMENT',
          quantity: parseInt(initialStock),
          unitCost: item.avgCost,
          totalCost: parseInt(initialStock) * item.avgCost,
          referenceType: 'Initial',
          notes: 'رصيد افتتاحي عند تعريف الصنف',
        },
      });
    }

    await logAudit({ action: 'CREATE', entity: 'Item', entityId: item.id, details: `إضافة صنف جديد: ${item.nameAr}` });

    res.status(201).json(item);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Update item
router.put('/:id', async (req, res) => {
  try {
    const item = await prisma.item.update({
      where: { id: req.params.id },
      data: {
        ...req.body,
        purchasePrice: req.body.purchasePrice ? parseFloat(req.body.purchasePrice) : undefined,
        sellPrice: req.body.sellPrice ? parseFloat(req.body.sellPrice) : undefined,
        specialSellPrice: req.body.specialSellPrice ? parseFloat(req.body.specialSellPrice) : undefined,
      },
    });

    await logAudit({ action: 'UPDATE', entity: 'Item', entityId: item.id, details: `تحديث بيانات الصنف: ${item.nameAr}` });

    res.json(item);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
