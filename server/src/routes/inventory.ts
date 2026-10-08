import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { logAudit } from '../middleware/audit';

const router = Router();

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
router.get('/balances', async (req, res) => {
  try {
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
      return {
        ...it,
        totalQuantity,
        availableQuantity: totalQuantity - totalReserved,
        isLowStock: totalQuantity <= it.minStock,
        totalValue: totalQuantity * it.avgCost,
      };
    });

    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Inter-Warehouse Transfers ---
router.get('/transfers', async (req, res) => {
  try {
    const transfers = await prisma.warehouseTransfer.findMany({
      include: {
        fromWarehouse: true,
        toWarehouse: true,
        items: { include: { item: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(transfers);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/transfers', async (req, res) => {
  try {
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

    res.status(201).json(transfer);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Inventory Count / Stocktaking (Section 9: الجرد) ---
router.get('/counts', async (req, res) => {
  try {
    const counts = await prisma.inventoryCount.findMany({
      include: {
        warehouse: true,
        items: { include: { item: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(counts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/counts', async (req, res) => {
  try {
    const { warehouseId, items, notes } = req.body;

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
            unitCost: parseFloat(it.unitCost) || 0,
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
            unitCost: parseFloat(it.unitCost) || 0,
            totalCost: diff * (parseFloat(it.unitCost) || 0),
            referenceType: 'InventoryCount',
            referenceId: inventoryCount.id,
            notes: `تسوية جرد دوري برقم ${countNumber}`,
          },
        });
      }
    }

    await logAudit({ action: 'STOCKTAKING', entity: 'InventoryCount', entityId: inventoryCount.id, details: `اعتماد جرد مخزني ${countNumber}` });

    res.status(201).json(inventoryCount);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
