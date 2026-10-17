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

      const auditDetails = `تعديل ${field === 'purchasePrice' ? 'سعر الشراء' : 'سعر البيع'} لـ ${updates.length} صنف (${adjustmentType === 'percentage' ? `${value}%` : `${value} ج.م`} ${operation === 'increase' ? 'زيادة' : 'تخفيض'})`;
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

    if (typeof fromWarehouseId !== 'string' || !fromWarehouseId ||
        typeof toWarehouseId !== 'string' || !toWarehouseId) {
      return res.status(400).json({ error: 'يرجى تحديد المستودع المصدر والوجهة' });
    }
    if (fromWarehouseId === toWarehouseId) {
      return res.status(400).json({ error: 'لا يمكن التحويل لنفس المخزن' });
    }
    if (!Array.isArray(items) || items.length === 0 ||
        items.some((item: any) => typeof item?.itemId !== 'string' || !item.itemId ||
          !Number.isInteger(item.quantity) || item.quantity <= 0)) {
      return res.status(400).json({ error: 'يجب تحديد صنف واحد على الأقل بكمية صحيحة أكبر من صفر' });
    }
    if (new Set(items.map((item: any) => item.itemId)).size !== items.length) {
      return res.status(400).json({ error: 'لا يمكن تكرار الصنف نفسه في التحويل' });
    }
    if (notes !== undefined && notes !== null && typeof notes !== 'string') {
      return res.status(400).json({ error: 'ملاحظات التحويل غير صحيحة' });
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
              quantity: it.quantity,
            })),
          },
        },
        include: { items: { include: { item: true } } },
      });

      // 2. Transfer stock quantities
      for (const it of items) {
        const qty = it.quantity;
        const itemObj = await tx.item.findUnique({ where: { id: it.itemId } });
        const sourceBalance = await tx.stockBalance.findUnique({
          where: {
            itemId_warehouseId: { itemId: it.itemId, warehouseId: fromWarehouseId },
          },
        });

        if (!sourceBalance || sourceBalance.quantity - sourceBalance.reservedQty < qty) {
          throw new Error(`الكمية المتاحة غير كافية للصنف ${itemObj?.nameAr || it.itemId}`);
        }

        // Decrement source warehouse
        const sourceUpdate = await tx.stockBalance.updateMany({
          where: {
            itemId: it.itemId,
            warehouseId: fromWarehouseId,
            quantity: { gte: qty },
          },
          data: { quantity: { decrement: qty } },
        });
        if (sourceUpdate.count !== 1) {
          throw new Error(`تغير رصيد الصنف ${itemObj?.nameAr || it.itemId}؛ أعد المحاولة`);
        }

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
    const authenticatedReq = req as AuthenticatedRequest;
    const canViewPrices = canViewItemPrices(req as AuthenticatedRequest);
    const { warehouseId, items, notes } = req.body;
    if (!warehouseId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'يجب تحديد المستودع وأصناف الجرد' });
    }
    if (items.some((item: any) =>
      typeof item?.itemId !== 'string' ||
      !Number.isInteger(Number(item.physicalQty)) ||
      Number(item.physicalQty) < 0
    ) || new Set(items.map((item: any) => item.itemId)).size !== items.length) {
      return res.status(400).json({ error: 'بيانات أصناف الجرد غير صالحة أو تحتوي على أصناف مكررة' });
    }

    const itemCosts = await prisma.item.findMany({
      where: { id: { in: items.map((item: any) => item.itemId) } },
      select: { id: true, avgCost: true },
    });
    if (itemCosts.length !== new Set(items.map((item: any) => item.itemId)).size) {
      return res.status(400).json({ error: 'بعض أصناف الجرد غير موجودة' });
    }
    const costByItemId = new Map(itemCosts.map((item) => [item.id, item.avgCost]));
    const currentBalances = await prisma.stockBalance.findMany({
      where: { warehouseId, itemId: { in: items.map((item: any) => item.itemId) } },
      select: { itemId: true, quantity: true },
    });
    const quantityByItemId = new Map(currentBalances.map((balance) => [balance.itemId, balance.quantity]));

    const countNumber = `CNT-${new Date().getFullYear()}-${String((await prisma.inventoryCount.count()) + 1).padStart(3, '0')}`;

    const inventoryCount = await prisma.inventoryCount.create({
      data: {
        countNumber,
        warehouseId,
        notes: notes || null,
        status: 'PENDING_APPROVAL',
        createdById: authenticatedReq.user!.id,
        items: {
          create: items.map((it: any) => ({
            itemId: it.itemId,
            bookQty: quantityByItemId.get(it.itemId) || 0,
            physicalQty: Number(it.physicalQty),
            difference: Number(it.physicalQty) - (quantityByItemId.get(it.itemId) || 0),
            unitCost: costByItemId.get(it.itemId) || 0,
            notes: it.notes || null,
          })),
        },
      },
      include: { warehouse: true, items: { include: { item: true } } },
    });

    await logAudit({
      userId: authenticatedReq.user!.id,
      action: 'CREATE',
      entity: 'InventoryCount',
      entityId: inventoryCount.id,
      details: `إنشاء جرد ${countNumber} بانتظار الاعتماد`,
      ipAddress: req.ip,
    });
    res.status(201).json(sanitizeInventoryRecord(inventoryCount, canViewPrices));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/counts/:id/approve', authenticate, loadUserPermissions, requirePermission('manage_inventory'), async (req, res) => {
  const authenticatedReq = req as AuthenticatedRequest;
  try {
    const approvedCount = await prisma.$transaction(async (tx) => {
      const count = await tx.inventoryCount.findUnique({
        where: { id: req.params.id },
        include: { items: true },
      });
      if (!count) throw new Error('الجرد غير موجود');
      if (count.status !== 'PENDING_APPROVAL') throw new Error('الجرد ليس بانتظار الاعتماد');
      if (count.createdById === authenticatedReq.user!.id) throw new Error('لا يمكن اعتماد جرد أنشأته بنفسك');

      for (const entry of count.items) {
        const current = await tx.stockBalance.findUnique({
          where: { itemId_warehouseId: { itemId: entry.itemId, warehouseId: count.warehouseId } },
        });
        const currentQty = current?.quantity || 0;
        if (currentQty !== entry.bookQty) {
          throw new Error('تغير رصيد صنف بعد إجراء الجرد؛ أنشئ جرداً جديداً قبل الاعتماد');
        }
        const difference = entry.physicalQty - currentQty;
        if (difference === 0) continue;
        if (current) {
          await tx.stockBalance.update({
            where: { id: current.id },
            data: { quantity: entry.physicalQty },
          });
        } else {
          await tx.stockBalance.create({
            data: { itemId: entry.itemId, warehouseId: count.warehouseId, quantity: entry.physicalQty },
          });
        }
        await tx.stockTransaction.create({
          data: {
            itemId: entry.itemId,
            warehouseId: count.warehouseId,
            type: 'ADJUSTMENT',
            quantity: difference,
            unitCost: entry.unitCost,
            totalCost: difference * entry.unitCost,
            referenceType: 'InventoryCount',
            referenceId: count.id,
            notes: `تسوية جرد دوري برقم ${count.countNumber}`,
          },
        });
      }
      return tx.inventoryCount.update({
        where: { id: count.id },
        data: {
          status: 'ADJUSTED',
          reviewedById: authenticatedReq.user!.id,
          reviewedAt: new Date(),
        },
        include: { warehouse: true, items: { include: { item: true } } },
      });
    });
    await logAudit({
      userId: authenticatedReq.user!.id,
      action: 'APPROVE',
      entity: 'InventoryCount',
      entityId: approvedCount.id,
      details: `اعتماد جرد مخزني ${approvedCount.countNumber}`,
      ipAddress: req.ip,
    });
    res.json(sanitizeInventoryRecord(approvedCount, canViewItemPrices(authenticatedReq)));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذر اعتماد الجرد';
    res.status(message === 'الجرد غير موجود' ? 404 : 400).json({ error: message });
  }
});

router.post('/counts/:id/reject', authenticate, loadUserPermissions, requirePermission('manage_inventory'), async (req, res) => {
  const authenticatedReq = req as AuthenticatedRequest;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason || reason.length > 500) return res.status(400).json({ error: 'سبب رفض الجرد مطلوب وبحد أقصى 500 حرف' });
  try {
    const count = await prisma.inventoryCount.findUnique({ where: { id: req.params.id } });
    if (!count) return res.status(404).json({ error: 'الجرد غير موجود' });
    if (count.status !== 'PENDING_APPROVAL') return res.status(400).json({ error: 'الجرد ليس بانتظار المراجعة' });
    if (count.createdById === authenticatedReq.user!.id) return res.status(400).json({ error: 'لا يمكن رفض جرد أنشأته بنفسك' });
    const rejected = await prisma.inventoryCount.update({
      where: { id: count.id },
      data: {
        status: 'REJECTED',
        reviewedById: authenticatedReq.user!.id,
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
      include: { warehouse: true, items: { include: { item: true } } },
    });
    await logAudit({
      userId: authenticatedReq.user!.id,
      action: 'REJECT',
      entity: 'InventoryCount',
      entityId: count.id,
      details: `رفض جرد ${count.countNumber}: ${reason}`,
      ipAddress: req.ip,
    });
    res.json(sanitizeInventoryRecord(rejected, canViewItemPrices(authenticatedReq)));
  } catch (error) {
    console.error('Failed to reject inventory count:', error);
    res.status(500).json({ error: 'تعذر رفض الجرد' });
  }
});

export default router;
