import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { logAudit } from '../middleware/audit';

const router = Router();

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
