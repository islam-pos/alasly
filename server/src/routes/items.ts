import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { logAudit } from '../middleware/audit';
import { AuthenticatedRequest, authenticate, loadUserPermissions, requirePermission } from '../middleware/auth';

const router = Router();

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

// Fast lookup by barcode or SKU for POS and scanner
router.get('/lookup/:code', authenticate, loadUserPermissions, async (req, res) => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
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

    const count = await prisma.item.count();
    const sku = safeItemData.sku || `SKU-${String(count + 1).padStart(4, '0')}`;
    const barcode = safeItemData.barcode || `628${String(Date.now()).slice(-9)}`;

    const item = await prisma.item.create({
      data: {
        ...safeItemData,
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

    res.status(201).json(hideUnauthorizedPrices(item, authenticatedReq));
  } catch (error: any) {
    res.status(400).json({ error: error.message });
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
    const item = await prisma.item.update({
      where: { id: req.params.id },
      data: {
        ...updateData,
        purchasePrice: updateData.purchasePrice === undefined ? undefined : parseFloat(updateData.purchasePrice),
        sellPrice: updateData.sellPrice === undefined ? undefined : parseFloat(updateData.sellPrice),
        specialSellPrice: updateData.specialSellPrice === undefined ? undefined : parseFloat(updateData.specialSellPrice),
      },
    });

    await logAudit({ action: 'UPDATE', entity: 'Item', entityId: item.id, details: `تحديث بيانات الصنف: ${item.nameAr}` });

    res.json(hideUnauthorizedPrices(item, authenticatedReq));
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
