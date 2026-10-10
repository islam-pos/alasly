import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { logAudit } from '../middleware/audit';
import { AuthenticatedRequest, authenticate, loadUserPermissions, requirePermission } from '../middleware/auth';

const router = Router();

const canViewItemPrices = (req: AuthenticatedRequest) =>
  req.authenticatedRole === 'admin' || req.rolePermissions?.includes('manage_item_prices') === true;

const withoutItemPrices = (item: any) => {
  if (!item) return item;
  const { purchasePrice, avgCost, sellPrice, specialSellPrice, ...safeItem } = item;
  return safeItem;
};

const sanitizeInventoryRecord = (record: any, canViewPrices: boolean) => ({
  ...record,
  ...(Array.isArray(record.items) ? {
    items: record.items.map((entry: any) => {
      const { unitCost, totalCost, ...safeEntry } = entry;
      return {
        ...safeEntry,
        ...(canViewPrices ? { unitCost, totalCost } : {}),
        ...(entry.item ? { item: canViewPrices ? entry.item : withoutItemPrices(entry.item) } : {}),
      };
    }),
  } : {}),
});

router.put('/items/:id/location', async (req, res) => {
  const location = req.body?.location;
  if (typeof location !== 'string' || location.length > 120) {
    return res.status(400).json({ error: 'موقع الصنف يجب أن يكون نصاً لا يتجاوز 120 حرفاً' });
  }

  try {
    const item = await prisma.item.update({
      where: { id: req.params.id },
      data: { defaultLocation: location.trim() || null },
      select: { id: true, nameAr: true, defaultLocation: true },
    });
    await logAudit({
      action: 'UPDATE',
      entity: 'Item',
      entityId: item.id,
      details: `تحديث موقع تخزين الصنف: ${item.nameAr}`,
    });
    res.json(item);
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'الصنف غير موجود' });
    res.status(500).json({ error: 'تعذر تحديث موقع الصنف' });
  }
});

// --- Live Stock Balances across Warehouses ---
router.get('/balances', authenticate, loadUserPermissions, requirePermission('manage_inventory'), async (req, res) => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const canViewPrices = authenticatedReq.authenticatedRole === 'admin'
      || authenticatedReq.rolePermissions?.includes('manage_item_prices') === true;
    const { warehouseId, categoryId, q } = req.query;
    let whereClause: any = { active: true };

    if (categoryId) whereClause.categoryId = String(categoryId);
    if (q) {
      const searchStr = String(q).trim();
      whereClause.OR = [
        { nameAr: { contains: searchStr } },
        { sku: { contains: searchStr } },
        { barcode: { contains: searchStr } },
        { partNumber: { contains: searchStr } },
      ];
    }

    const items = await prisma.item.findMany({
      where: whereClause,
      include: {
        category: true,
        unit: true,
        stockBalances: {
          include: { warehouse: true },
          where: warehouseId ? { warehouseId: String(warehouseId) } : undefined,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const results = items.map((it) => {
      const totalQuantity = it.stockBalances.reduce((sum, b) => sum + b.quantity, 0);
      const totalReserved = it.stockBalances.reduce((sum, b) => sum + b.reservedQty, 0);
      const { purchasePrice, avgCost, sellPrice, specialSellPrice, ...itemDetails } = it;
      return {
        ...itemDetails,
        totalQuantity,
        availableQuantity: totalQuantity - totalReserved,
        isLowStock: totalQuantity <= it.minStock,
        ...(canViewPrices ? {
          purchasePrice,
          avgCost,
          sellPrice,
          specialSellPrice,
          totalValue: totalQuantity * avgCost,
        } : {}),
      };
    });

    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post(
  '/prices/bulk',
  authenticate,
  loadUserPermissions,
  requirePermission('manage_inventory'),
  requirePermission('manage_item_prices'),
  async (req, res) => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;
      const { field, target, adjustmentType, operation, value } = req.body;
      if (!['purchasePrice', 'sellPrice'].includes(field)) {
        return res.status(400).json({ error: 'نوع السعر غير صالح' });
      }
      if (!target || !['category', 'items', 'item'].includes(target.type)) {
        return res.status(400).json({ error: 'نطاق تحديث الأسعار غير صالح' });
      }
      if (!['percentage', 'amount'].includes(adjustmentType)) {
        return res.status(400).json({ error: 'نوع التعديل غير صالح' });
      }
      if (!['increase', 'decrease'].includes(operation)) {
        return res.status(400).json({ error: 'اتجاه التعديل غير صالح' });
      }
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return res.status(400).json({ error: 'يجب إدخال نسبة أو مبلغ أكبر من صفر' });
      }

      let where: { active: boolean; categoryId?: string; id?: string | { in: string[] } };
      if (target.type === 'category' && typeof target.categoryId === 'string' && target.categoryId) {
        where = { active: true, categoryId: target.categoryId };
      } else if (
        target.type === 'item' &&
        typeof target.itemId === 'string' &&
        target.itemId
      ) {
        where = { active: true, id: target.itemId };
      } else if (
        target.type === 'items' &&
        Array.isArray(target.itemIds) &&
        target.itemIds.length > 0 &&
        target.itemIds.length <= 1000 &&
        target.itemIds.every((id: unknown) => typeof id === 'string' && id.length > 0)
      ) {
        const itemIds = [...new Set(target.itemIds as string[])];
        if (itemIds.length !== target.itemIds.length) {
          return res.status(400).json({ error: 'قائمة الأصناف تحتوي على عناصر مكررة' });
        }
        where = { active: true, id: { in: itemIds } };
      } else {
        return res.status(400).json({ error: 'بيانات الأصناف المستهدفة غير صالحة' });
      }

      const items = await prisma.item.findMany({
        where,
        select: { id: true, nameAr: true, purchasePrice: true, sellPrice: true },
      });
      if (items.length === 0) {
        return res.status(404).json({ error: 'لا توجد أصناف نشطة مطابقة للتحديث' });
      }
      if (target.type === 'items' && items.length !== target.itemIds.length) {
        return res.status(400).json({ error: 'بعض الأصناف المحددة غير موجودة أو غير نشطة' });
      }

      const sign = operation === 'increase' ? 1 : -1;
      const updates = items.map((item) => {
        const currentPrice = item[field as 'purchasePrice' | 'sellPrice'];
        const delta = adjustmentType === 'percentage' ? currentPrice * value / 100 : value;
        const newPrice = Math.round((currentPrice + sign * delta) * 100) / 100;
        if (!Number.isFinite(newPrice) || newPrice < 0) {
          throw new Error(`سيؤدي التعديل إلى سعر غير صالح للصنف ${item.nameAr}`);
        }
        return { id: item.id, price: newPrice };
      });

      const auditDetails = `تعديل ${field === 'purchasePrice' ? 'سعر الشراء' : 'سعر البيع'} لـ ${updates.length} صنف (${adjustmentType === 'percentage' ? `${value}%` : `${value} ر.س`} ${operation === 'increase' ? 'زيادة' : 'تخفيض'})`;
      await prisma.$transaction(async (transaction) => {
        for (const { id, price } of updates) {
          await transaction.item.update({ where: { id }, data: { [field]: price } });
        }
        await transaction.auditLog.create({
          data: {
            userId: authenticatedReq.user?.id,
            action: 'UPDATE',
            entity: 'ItemPrice',
            entityId: target.type === 'category' ? target.categoryId : null,
            details: auditDetails,
            ipAddress: req.ip,
          },
        });
      });

      res.json({ updatedCount: updates.length });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  },
);

// --- Inter-Warehouse Transfers ---
router.get('/transfers', authenticate, loadUserPermissions, requirePermission('manage_inventory'), async (req, res) => {
  try {
    const canViewPrices = canViewItemPrices(req as AuthenticatedRequest);
    const transfers = await prisma.warehouseTransfer.findMany({
      include: {
        fromWarehouse: true,
        toWarehouse: true,
        items: { include: { item: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(transfers.map((transfer) => sanitizeInventoryRecord(transfer, canViewPrices)));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/transfers', authenticate, loadUserPermissions, requirePermission('manage_inventory'), async (req, res) => {
  try {
    const canViewPrices = canViewItemPrices(req as AuthenticatedRequest);
    const { fromWarehouseId, toWarehouseId, items, notes } = req.body;

    if (fromWarehouseId === toWarehouseId) {
      return res.status(400).json({ error: 'لا يمكن التحويل لنفس المخزن' });
    }

    const count = await prisma.warehouseTransfer.count();
    const transferNumber = `TRF-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;

    const transfer = await prisma.$transaction(async (tx) => {
      // 1. Create transfer record
      const trf = await tx.warehouseTransfer.create({
        data: {
          transferNumber,
          fromWarehouseId,
          toWarehouseId,
          notes: notes || null,
          status: 'COMPLETED',
          items: {
            create: items.map((it: any) => ({
              itemId: it.itemId,
              quantity: parseInt(it.quantity),
            })),
          },
        },
        include: { items: { include: { item: true } } },
      });

      // 2. Transfer stock quantities
      for (const it of items) {
        const qty = parseInt(it.quantity);
        const itemObj = await tx.item.findUnique({ where: { id: it.itemId } });

        // Decrement source warehouse
        await tx.stockBalance.update({
          where: {
            itemId_warehouseId: { itemId: it.itemId, warehouseId: fromWarehouseId },
          },
          data: { quantity: { decrement: qty } },
        });

        // Increment target warehouse
        const targetBalance = await tx.stockBalance.findUnique({
          where: {
            itemId_warehouseId: { itemId: it.itemId, warehouseId: toWarehouseId },
          },
        });

        if (targetBalance) {
          await tx.stockBalance.update({
            where: { id: targetBalance.id },
            data: { quantity: { increment: qty } },
          });
        } else {
          await tx.stockBalance.create({
            data: {
              itemId: it.itemId,
              warehouseId: toWarehouseId,
              quantity: qty,
            },
          });
        }

        // Transactions
        await tx.stockTransaction.create({
          data: {
            itemId: it.itemId,
            warehouseId: fromWarehouseId,
            type: 'TRANSFER_OUT',
            quantity: -qty,
            unitCost: itemObj?.avgCost || 0,
            totalCost: -(qty * (itemObj?.avgCost || 0)),
            referenceType: 'WarehouseTransfer',
            referenceId: trf.id,
            notes: `تحويل مخزني صادر برقم ${transferNumber}`,
          },
        });

        await tx.stockTransaction.create({
          data: {
            itemId: it.itemId,
            warehouseId: toWarehouseId,
            type: 'TRANSFER_IN',
            quantity: qty,
            unitCost: itemObj?.avgCost || 0,
            totalCost: qty * (itemObj?.avgCost || 0),
            referenceType: 'WarehouseTransfer',
            referenceId: trf.id,
            notes: `تحويل مخزني وارد برقم ${transferNumber}`,
          },
        });
      }

      return trf;
    });

    await logAudit({ action: 'TRANSFER', entity: 'WarehouseTransfer', entityId: transfer.id, details: `تنفيذ تحويل مخزني ${transferNumber}` });

    res.status(201).json(sanitizeInventoryRecord(transfer, canViewPrices));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Inventory Count / Stocktaking (Section 9: الجرد) ---
router.get('/counts', authenticate, loadUserPermissions, requirePermission('manage_inventory'), async (req, res) => {
  try {
    const canViewPrices = canViewItemPrices(req as AuthenticatedRequest);
    const counts = await prisma.inventoryCount.findMany({
      include: {
        warehouse: true,
        items: { include: { item: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(counts.map((count) => sanitizeInventoryRecord(count, canViewPrices)));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/counts', authenticate, loadUserPermissions, requirePermission('manage_inventory'), async (req, res) => {
  try {
    const canViewPrices = canViewItemPrices(req as AuthenticatedRequest);
    const { warehouseId, items, notes } = req.body;
    if (!warehouseId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'يجب تحديد المستودع وأصناف الجرد' });
    }

    const itemCosts = await prisma.item.findMany({
      where: { id: { in: items.map((item: any) => item.itemId) } },
      select: { id: true, avgCost: true },
    });
    if (itemCosts.length !== new Set(items.map((item: any) => item.itemId)).size) {
      return res.status(400).json({ error: 'بعض أصناف الجرد غير موجودة' });
    }
    const costByItemId = new Map(itemCosts.map((item) => [item.id, item.avgCost]));

    const countNumber = `CNT-${new Date().getFullYear()}-${String((await prisma.inventoryCount.count()) + 1).padStart(3, '0')}`;

    const inventoryCount = await prisma.inventoryCount.create({
      data: {
        countNumber,
        warehouseId,
        notes: notes || null,
        status: 'COMPLETED',
        items: {
          create: items.map((it: any) => ({
            itemId: it.itemId,
            bookQty: parseInt(it.bookQty),
            physicalQty: parseInt(it.physicalQty),
            difference: parseInt(it.physicalQty) - parseInt(it.bookQty),
            unitCost: costByItemId.get(it.itemId) || 0,
            notes: it.notes || null,
          })),
        },
      },
      include: { items: { include: { item: true } } },
    });

    // Auto apply adjustments if differences exist
    for (const it of items) {
      const diff = parseInt(it.physicalQty) - parseInt(it.bookQty);
      if (diff !== 0) {
        await prisma.stockBalance.update({
          where: {
            itemId_warehouseId: { itemId: it.itemId, warehouseId },
          },
          data: { quantity: parseInt(it.physicalQty) },
        });

        await prisma.stockTransaction.create({
          data: {
            itemId: it.itemId,
            warehouseId,
            type: 'ADJUSTMENT',
            quantity: diff,
            unitCost: costByItemId.get(it.itemId) || 0,
            totalCost: diff * (costByItemId.get(it.itemId) || 0),
            referenceType: 'InventoryCount',
            referenceId: inventoryCount.id,
            notes: `تسوية جرد دوري برقم ${countNumber}`,
          },
        });
      }
    }

    await logAudit({ action: 'STOCKTAKING', entity: 'InventoryCount', entityId: inventoryCount.id, details: `اعتماد جرد مخزني ${countNumber}` });

    res.status(201).json(sanitizeInventoryRecord(inventoryCount, canViewPrices));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
