import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logAudit } from '../middleware/audit';
import { AuthenticatedRequest, authenticate, loadUserPermissions, requirePermission } from '../middleware/auth';
import { branchWhere } from '../services/branchScope';
import { findImportReference } from '../services/itemImportMatching';

const router = Router();

const normalizeItemName = (value: string) => value
  .normalize('NFKC')
  .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
  .replace(/[آأإ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/\s+/g, ' ')
  .trim()
  .toLocaleLowerCase();

const normalizeItemCode = (value: string) => value.normalize('NFKC').trim().toLocaleUpperCase();

type DuplicateCandidate = {
  id: string;
  sku: string;
  barcode: string | null;
  nameAr: string;
  categoryId: string;
};

const findItemDuplicate = async (
  client: Prisma.TransactionClient | typeof prisma,
  item: { id?: string; sku: string; barcode?: string | null; nameAr: string; categoryId: string },
) => {
  const candidates = await client.$queryRaw<DuplicateCandidate[]>`
    SELECT "id", "sku", "barcode", "nameAr", "categoryId"
    FROM "Item"
    WHERE LOWER(TRIM("sku")) = LOWER(TRIM(${item.sku}))
      OR (${item.barcode || ''} <> '' AND "barcode" IS NOT NULL AND LOWER(TRIM("barcode")) = LOWER(TRIM(${item.barcode || ''})))
      OR "categoryId" = ${item.categoryId}
  `;
  const others = candidates.filter((candidate) => candidate.id !== item.id);

  if (others.some((candidate) => normalizeItemCode(candidate.sku) === normalizeItemCode(item.sku))) {
    return 'كود SKU مستخدم بالفعل في صنف آخر';
  }
  if (item.barcode && others.some((candidate) =>
    candidate.barcode && normalizeItemCode(candidate.barcode) === normalizeItemCode(item.barcode!),
  )) {
    return 'الباركود مستخدم بالفعل في صنف آخر';
  }
  if (others.some((candidate) =>
    candidate.categoryId === item.categoryId
      && normalizeItemName(candidate.nameAr) === normalizeItemName(item.nameAr),
  )) {
    return 'اسم الصنف موجود بالفعل داخل التصنيف المحدد';
  }
  return null;
};

const getUniqueConstraintMessage = (error: unknown) => {
  if (error instanceof Error && [
    'كود SKU مستخدم بالفعل في صنف آخر',
    'الباركود مستخدم بالفعل في صنف آخر',
    'اسم الصنف موجود بالفعل داخل التصنيف المحدد',
  ].includes(error.message)) return error.message;
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return null;
  const target = Array.isArray(error.meta?.target) ? error.meta.target.join(' ') : String(error.meta?.target || '');
  if (target.toLowerCase().includes('barcode')) return 'الباركود مستخدم بالفعل في صنف آخر';
  if (target.toLowerCase().includes('sku')) return 'كود SKU مستخدم بالفعل في صنف آخر';
  return 'كود SKU أو الباركود مستخدم بالفعل في صنف آخر';
};

const hasPermission = (req: AuthenticatedRequest, permission: string) =>
  req.authenticatedRole === 'admin' || req.rolePermissions?.includes(permission) === true;

const hideUnauthorizedPrices = (item: any, req: AuthenticatedRequest) => {
  const canViewPurchasePrice = hasPermission(req, 'manage_item_prices') || hasPermission(req, 'manage_purchases');
  const canViewSellPrice = hasPermission(req, 'manage_item_prices')
    || hasPermission(req, 'manage_sales')
    || hasPermission(req, 'pos_access')
    || hasPermission(req, 'approve_estimate');
  const {
    purchasePrice,
    avgCost,
    sellPrice,
    specialSellPrice,
    ...safeItem
  } = item;
  const safeTransactions = Array.isArray(safeItem.stockTransactions) && !canViewPurchasePrice
    ? safeItem.stockTransactions.map(({ unitCost, totalCost, ...transaction }: any) => transaction)
    : safeItem.stockTransactions;

  return {
    ...safeItem,
    ...(safeTransactions ? { stockTransactions: safeTransactions } : {}),
    ...(canViewPurchasePrice ? { purchasePrice, avgCost } : {}),
    ...(canViewSellPrice ? { sellPrice, specialSellPrice } : {}),
  };
};

const parseImportedNumber = (value: unknown, fallback: number) => {
  if (value === null || value === undefined || value === '') return fallback;
  const digits = '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹';
  const normalized = String(value)
    .replace(/[٠-٩۰-۹]/g, (digit) => String(digits.indexOf(digit) % 10))
    .replace(/[٬,]/g, '')
    .replace(/٫/g, '.')
    .trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
};

// Search or list items
router.get('/', authenticate, loadUserPermissions, async (req, res) => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
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
        ...hideUnauthorizedPrices(item, authenticatedReq),
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
    const authenticatedReq = req as AuthenticatedRequest;
    const canManagePrices = hasPermission(authenticatedReq, 'manage_item_prices');
    const [categories, units, warehouses] = await Promise.all([
      prisma.itemCategory.findMany({ select: { id: true, name: true } }),
      prisma.unit.findMany({ select: { id: true, name: true, symbol: true } }),
      prisma.warehouse.findMany({
        select: { id: true, name: true },
        where: { active: true, ...branchWhere(authenticatedReq) },
      }),
    ]);
    const unitReferences = units.map(({ id, name, symbol }) => ({ id, name, aliases: [symbol] }));
    const createdCategories = new Map<string, string>();
    const created: string[] = [];
    const duplicates: { row: number; sku: string; reason: string }[] = [];
    const errors: { row: number; sku?: string; reason: string }[] = [];
    const seenSkus = new Set<string>();
    const seenBarcodes = new Set<string>();
    const seenNames = new Set<string>();

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
      const category = findImportReference(categories, categoryValue);
      const unit = findImportReference(unitReferences, unitValue);
      const warehouseValue = String(row.initialWarehouseId || row.warehouse || '').trim();
      const warehouse = warehouseValue
        ? findImportReference(warehouses, warehouseValue)
        : undefined;
      const purchasePrice = canManagePrices ? parseImportedNumber(row.purchasePrice, 0) : 0;
      const sellPrice = canManagePrices ? parseImportedNumber(row.sellPrice, 0) : 0;
      const specialSellPrice = canManagePrices ? parseImportedNumber(row.specialSellPrice, 0) : 0;
      const minStock = parseImportedNumber(row.minStock, 5);
      const maxStock = parseImportedNumber(row.maxStock, 100);
      const initialStock = parseImportedNumber(row.initialStock, 0);

      if (!nameAr || !sku || !categoryValue || !unit) {
        errors.push({
          row: rowNumber,
          sku: sku || undefined,
          reason: !nameAr ? 'اسم الصنف مطلوب' : !sku ? 'كود SKU مطلوب' : !categoryValue ? 'التصنيف مطلوب؛ أدخل اسم التصنيف في الملف' : 'الوحدة غير موجودة؛ استخدم اسم وحدة مسجلًا في النظام',
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

      const skuKey = normalizeItemCode(sku);
      const barcodeKey = normalizeItemCode(barcode);
      const nameKey = `${normalizeItemName(category?.name || categoryValue)}:${normalizeItemName(nameAr)}`;
      const duplicateReason = seenSkus.has(skuKey)
        ? 'كود SKU مكرر داخل الملف؛ تم تخطي الصف'
        : barcode && seenBarcodes.has(barcodeKey)
          ? 'الباركود مكرر داخل الملف؛ تم تخطي الصف'
          : seenNames.has(nameKey)
            ? 'اسم الصنف مكرر داخل التصنيف داخل الملف؛ تم تخطي الصف'
            : category
              ? await findItemDuplicate(prisma, { sku, barcode, nameAr, categoryId: category.id })
              : null;
      if (duplicateReason) {
        duplicates.push({ row: rowNumber, sku, reason: `${duplicateReason}؛ تم تخطي الصف` });
        continue;
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          let resolvedCategory = category;
          let newCategory: { id: string; name: string } | undefined;
          if (!resolvedCategory) {
            const existingCategory = await tx.itemCategory.findUnique({ where: { name: categoryValue } });
            resolvedCategory = await tx.itemCategory.upsert({
              where: { name: categoryValue },
              create: { name: categoryValue },
              update: {},
              select: { id: true, name: true },
            });
            if (!existingCategory) newCategory = resolvedCategory;
          }

          const transactionDuplicate = await findItemDuplicate(tx, {
            sku,
            barcode,
            nameAr,
            categoryId: resolvedCategory.id,
          });
          if (transactionDuplicate) throw new Error(transactionDuplicate);
          const createdItem = await tx.item.create({
            data: {
              nameAr,
              nameEn: String(row.nameEn || '').trim() || null,
              sku,
              barcode: barcode || null,
              partNumber: String(row.partNumber || '').trim() || null,
              categoryId: resolvedCategory.id,
              unitId: unit.id,
              manufacturer: String(row.manufacturer || '').trim() || null,
              countryOfOrigin: String(row.countryOfOrigin || '').trim() || null,
              fitment: String(row.fitment || '').trim() || null,
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
          return { item: createdItem, newCategory };
        });
        const { item, newCategory } = result;
        seenSkus.add(skuKey);
        if (barcode) seenBarcodes.add(barcodeKey);
        seenNames.add(nameKey);
        created.push(item.nameAr);
        if (newCategory) {
          categories.push(newCategory);
          createdCategories.set(newCategory.id, newCategory.name);
          await logAudit({
            action: 'CREATE',
            entity: 'ItemCategory',
            entityId: newCategory.id,
            details: `إنشاء تصنيف أثناء استيراد الأصناف: ${newCategory.name}`,
          });
        }
        await logAudit({ action: 'CREATE', entity: 'Item', entityId: item.id, details: `استيراد صنف: ${item.nameAr} (${item.sku})` });
      } catch (error) {
        console.error(`Failed to import item at row ${rowNumber}:`, error);
        const message = error instanceof Error ? error.message : '';
        if (message.includes('مستخدم بالفعل') || message.includes('موجود بالفعل')) {
          duplicates.push({ row: rowNumber, sku, reason: `${message}؛ تم تخطي الصف` });
        } else {
          errors.push({ row: rowNumber, sku, reason: 'فشل حفظ الصنف؛ تحقق من البيانات المرتبطة' });
        }
      }
    }

    res.json({ created: created.length, createdCategories: [...createdCategories.values()], duplicates, errors });
  } catch (error) {
    console.error('Failed to import item spreadsheet:', error);
    res.status(500).json({ error: 'تعذر استيراد ملف الأصناف' });
  }
});

router.post(
  '/bulk/archive',
  authenticate,
  loadUserPermissions,
  requirePermission('manage_items'),
  async (req, res) => {
    const itemIds = req.body?.itemIds;
    if (!Array.isArray(itemIds) || itemIds.length === 0 || itemIds.length > 5000
      || itemIds.some((id: unknown) => typeof id !== 'string' || !id.trim())) {
      return res.status(400).json({ error: 'حدد من 1 إلى 5000 صنف صالح للأرشفة' });
    }
    if (new Set(itemIds).size !== itemIds.length) {
      return res.status(400).json({ error: 'قائمة الأصناف المحددة تحتوي على عناصر مكررة' });
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const archivedItems: { id: string; nameAr: string }[] = [];
        const skippedItems: { id: string; nameAr: string; reason: string }[] = [];

        for (let offset = 0; offset < itemIds.length; offset += 500) {
          const batchIds = itemIds.slice(offset, offset + 500) as string[];
          const items = await tx.item.findMany({
            where: { id: { in: batchIds }, active: true },
            select: {
              id: true,
              nameAr: true,
              stockBalances: { select: { quantity: true, reservedQty: true } },
            },
          });
          const itemById = new Map(items.map((item) => [item.id, item]));
          const eligibleIds: string[] = [];

          for (const id of batchIds) {
            const item = itemById.get(id);
            if (!item) {
              skippedItems.push({ id, nameAr: id, reason: 'الصنف غير موجود أو مؤرشف مسبقاً' });
              continue;
            }
            if (item.stockBalances.some((balance) => balance.quantity !== 0 || balance.reservedQty !== 0)) {
              skippedItems.push({ id: item.id, nameAr: item.nameAr, reason: 'له رصيد أو كمية محجوزة في المخزون' });
              continue;
            }
            eligibleIds.push(item.id);
          }

          if (eligibleIds.length === 0) continue;
          const updated = await tx.item.updateMany({
            where: {
              id: { in: eligibleIds },
              active: true,
              stockBalances: {
                none: {
                  OR: [{ quantity: { not: 0 } }, { reservedQty: { not: 0 } }],
                },
              },
            },
            data: { active: false },
          });
          const archivedIdSet = new Set(eligibleIds);
          if (updated.count !== eligibleIds.length) {
            const stillActive = await tx.item.findMany({
              where: { id: { in: eligibleIds }, active: true },
              select: { id: true, nameAr: true },
            });
            for (const item of stillActive) {
              archivedIdSet.delete(item.id);
              skippedItems.push({ id: item.id, nameAr: item.nameAr, reason: 'تغير رصيد المخزون أثناء تنفيذ الأرشفة' });
            }
          }
          archivedItems.push(...items
            .filter((item) => archivedIdSet.has(item.id))
            .map(({ id, nameAr }) => ({ id, nameAr })));
        }
        return { archivedItems, skippedItems };
      });

      if (result.archivedItems.length > 0) {
        await logAudit({
          action: 'BULK_ARCHIVE',
          entity: 'Item',
          details: `أرشفة ${result.archivedItems.length} صنف من المخزون`,
        });
      }
      res.json({
        archivedCount: result.archivedItems.length,
        skipped: result.skippedItems,
      });
    } catch (error) {
      console.error('Bulk item archive failed:', error);
      res.status(500).json({ error: 'تعذر أرشفة الأصناف المحددة' });
    }
  },
);

// Fast lookup by barcode or SKU for POS and scanner
router.get('/lookup/:code', authenticate, loadUserPermissions, async (req, res) => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const code = req.params.code.trim();
    const item = await prisma.item.findFirst({
      where: {
        OR: [{ barcode: code }, { sku: code }],
        active: true,
      },
      include: {
        category: true,
        unit: true,
        stockBalances: { include: { warehouse: true } },
      },
    });

    if (!item) {
      return res.status(404).json({ error: 'لم يتم العثور على صنف بهذا الباركود أو كود SKU' });
    }

    const totalQty = item.stockBalances.reduce((sum, sb) => sum + sb.quantity, 0);
    res.json({
      ...hideUnauthorizedPrices(item, authenticatedReq),
      totalQuantity: totalQty,
      availableQuantity: totalQty,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Single item details with movement history
router.get('/:id', authenticate, loadUserPermissions, async (req, res) => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
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
      ...hideUnauthorizedPrices(item, authenticatedReq),
      totalQuantity: totalQty,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create item
router.post('/', authenticate, loadUserPermissions, requirePermission('manage_items'), async (req, res) => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const { initialWarehouseId, initialStock, ...itemData } = req.body;
    const canManagePrices = hasPermission(authenticatedReq, 'manage_item_prices');
    const {
      purchasePrice: requestedPurchasePrice,
      sellPrice: requestedSellPrice,
      specialSellPrice: requestedSpecialSellPrice,
      ...safeItemData
    } = itemData;

    const itemNameAr = String(safeItemData.nameAr || '').trim();
    const categoryId = String(safeItemData.categoryId || '').trim();
    let sku = normalizeItemCode(String(safeItemData.sku || ''));
    if (!sku) {
      let nextSku = await prisma.item.count() + 1;
      do {
        sku = `SKU-${String(nextSku++).padStart(4, '0')}`;
      } while ((await prisma.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Item" WHERE LOWER(TRIM("sku")) = LOWER(TRIM(${sku})) LIMIT 1
      `).length > 0);
    }
    let barcode = normalizeItemCode(String(safeItemData.barcode || ''));
    if (!barcode) {
      const timeSuffix = String(Date.now()).slice(-9);
      do {
        barcode = `628${timeSuffix}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
      } while ((await prisma.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Item" WHERE LOWER(TRIM("barcode")) = LOWER(TRIM(${barcode})) LIMIT 1
      `).length > 0);
    }
    const itemDataToCreate = {
      ...safeItemData,
      nameAr: itemNameAr,
      categoryId,
      sku,
      barcode,
      purchasePrice: canManagePrices ? parseFloat(requestedPurchasePrice) || 0 : 0,
      avgCost: canManagePrices ? parseFloat(requestedPurchasePrice) || 0 : 0,
      sellPrice: canManagePrices ? parseFloat(requestedSellPrice) || 0 : 0,
      specialSellPrice: canManagePrices
        ? parseFloat(requestedSpecialSellPrice) || parseFloat(requestedSellPrice) * 0.9 || 0
        : 0,
      minStock: parseInt(itemData.minStock) || 5,
      maxStock: parseInt(itemData.maxStock) || 100,
    };

    const duplicateReason = await findItemDuplicate(prisma, {
      sku,
      barcode,
      nameAr: itemNameAr,
      categoryId,
    });
    if (duplicateReason) return res.status(409).json({ error: duplicateReason });

    const item = await prisma.$transaction(async (tx) => {
      const transactionDuplicate = await findItemDuplicate(tx, {
        sku,
        barcode,
        nameAr: itemNameAr,
        categoryId,
      });
      if (transactionDuplicate) throw new Error(transactionDuplicate);

      const createdItem = await tx.item.create({ data: itemDataToCreate });
      if (initialWarehouseId && initialStock > 0) {
        await tx.stockBalance.create({
          data: {
            itemId: createdItem.id,
            warehouseId: initialWarehouseId,
            quantity: parseInt(initialStock),
          },
        });
        await tx.stockTransaction.create({
          data: {
            itemId: createdItem.id,
            warehouseId: initialWarehouseId,
            type: 'ADJUSTMENT',
            quantity: parseInt(initialStock),
            unitCost: createdItem.avgCost,
            totalCost: parseInt(initialStock) * createdItem.avgCost,
            referenceType: 'Initial',
            notes: 'رصيد افتتاحي عند تعريف الصنف',
          },
        });
      }
      return createdItem;
    });

    await logAudit({ action: 'CREATE', entity: 'Item', entityId: item.id, details: `إضافة صنف جديد: ${item.nameAr}` });

    res.status(201).json(hideUnauthorizedPrices(item, authenticatedReq));
  } catch (error: any) {
    const duplicateMessage = getUniqueConstraintMessage(error);
    res.status(duplicateMessage ? 409 : 400).json({ error: duplicateMessage || error.message });
  }
});

// Update item
router.put('/:id', authenticate, loadUserPermissions, requirePermission('manage_items'), async (req, res) => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const updateData = { ...req.body };
    if (!hasPermission(authenticatedReq, 'manage_item_prices')) {
      delete updateData.purchasePrice;
      delete updateData.sellPrice;
      delete updateData.specialSellPrice;
    }
    delete updateData.avgCost;
    const currentItem = await prisma.item.findUnique({ where: { id: req.params.id } });
    if (!currentItem) return res.status(404).json({ error: 'الصنف غير موجود' });

    const duplicateCandidate = {
      id: currentItem.id,
      sku: normalizeItemCode(String(updateData.sku ?? currentItem.sku)),
      barcode: updateData.barcode === undefined
        ? currentItem.barcode
        : normalizeItemCode(String(updateData.barcode || '')) || null,
      nameAr: String(updateData.nameAr ?? currentItem.nameAr).trim(),
      categoryId: String(updateData.categoryId ?? currentItem.categoryId),
    };
    const duplicateReason = await findItemDuplicate(prisma, duplicateCandidate);
    if (duplicateReason) return res.status(409).json({ error: duplicateReason });

    const item = await prisma.$transaction(async (tx) => {
      const transactionDuplicate = await findItemDuplicate(tx, duplicateCandidate);
      if (transactionDuplicate) throw new Error(transactionDuplicate);
      return tx.item.update({
        where: { id: req.params.id },
        data: {
          ...updateData,
          ...(updateData.sku !== undefined ? { sku: duplicateCandidate.sku } : {}),
          ...(updateData.barcode !== undefined ? { barcode: duplicateCandidate.barcode } : {}),
          purchasePrice: updateData.purchasePrice === undefined ? undefined : parseFloat(updateData.purchasePrice),
          sellPrice: updateData.sellPrice === undefined ? undefined : parseFloat(updateData.sellPrice),
          specialSellPrice: updateData.specialSellPrice === undefined ? undefined : parseFloat(updateData.specialSellPrice),
        },
      });
    });

    await logAudit({ action: 'UPDATE', entity: 'Item', entityId: item.id, details: `تحديث بيانات الصنف: ${item.nameAr}` });

    res.json(hideUnauthorizedPrices(item, authenticatedReq));
  } catch (error: any) {
    const duplicateMessage = getUniqueConstraintMessage(error);
    res.status(duplicateMessage ? 409 : 400).json({ error: duplicateMessage || error.message });
  }
});

export default router;
