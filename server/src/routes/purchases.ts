import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { logAudit } from '../middleware/audit';

const router = Router();

// --- Purchase Requests ---
router.get('/requests', async (req, res) => {
  try {
    const requests = await prisma.purchaseRequest.findMany({
      include: {
        supplier: true,
        warehouse: true,
        items: { include: { item: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(requests);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/requests', async (req, res) => {
  try {
    const { items, ...data } = req.body;
    const count = await prisma.purchaseRequest.count();
    const requestNumber = `PR-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;

    const request = await prisma.purchaseRequest.create({
      data: {
        ...data,
        requestNumber,
        items: {
          create: items.map((i: any) => ({
            itemId: i.itemId,
            quantity: parseInt(i.quantity),
            estimatedPrice: parseFloat(i.estimatedPrice) || 0,
            notes: i.notes || null,
          })),
        },
      },
      include: { items: { include: { item: true } }, supplier: true },
    });

    await logAudit({ action: 'CREATE', entity: 'PurchaseRequest', entityId: request.id, details: `إنشاء طلب شراء ${requestNumber}` });

    res.status(201).json(request);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Purchase Invoices ---
router.get('/invoices', async (req, res) => {
  try {
    const invoices = await prisma.purchaseInvoice.findMany({
      include: {
        supplier: true,
        warehouse: true,
        items: { include: { item: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(invoices);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/invoices', async (req, res) => {
  try {
    const { items, ...data } = req.body;
    const count = await prisma.purchaseInvoice.count();
    const invoiceNumber = `PINV-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;

    const subtotal = items.reduce((sum: number, it: any) => sum + (parseFloat(it.unitPrice) * parseInt(it.quantity)), 0);
    const discount = parseFloat(data.discount) || 0;
    const taxableAmount = Math.max(0, subtotal - discount);
    const taxAmount = (taxableAmount * 15) / 100;
    const grandTotal = taxableAmount + taxAmount;
    const paidAmount = parseFloat(data.paidAmount) || 0;
    const remainingAmount = Math.max(0, grandTotal - paidAmount);

    const invoice = await prisma.$transaction(async (tx) => {
      // 1. Create invoice
      const createdInvoice = await tx.purchaseInvoice.create({
        data: {
          invoiceNumber,
          supplierInvoiceNumber: data.supplierInvoiceNumber || null,
          supplierId: data.supplierId,
          warehouseId: data.warehouseId,
          branchId: data.branchId || null,
          subtotal,
          discount,
          taxAmount,
          grandTotal,
          paidAmount,
          remainingAmount,
          paymentMethod: data.paymentMethod || 'CREDIT',
          status: remainingAmount === 0 ? 'PAID' : paidAmount > 0 ? 'PARTIALLY_PAID' : 'POSTED',
          notes: data.notes || null,
          items: {
            create: items.map((it: any) => {
              const itemTotal = parseFloat(it.unitPrice) * parseInt(it.quantity);
              const itemTax = (itemTotal * 15) / 100;
              return {
                itemId: it.itemId,
                quantity: parseInt(it.quantity),
                unitPrice: parseFloat(it.unitPrice),
                taxRate: 15.0,
                taxAmount: itemTax,
                total: itemTotal + itemTax,
              };
            }),
          },
        },
      });

      // 2. Increase stock and update cost for each item
      for (const it of items) {
        const qty = parseInt(it.quantity);
        const price = parseFloat(it.unitPrice);

        // Update or insert StockBalance
        const currentBalance = await tx.stockBalance.findUnique({
          where: {
            itemId_warehouseId: {
              itemId: it.itemId,
              warehouseId: data.warehouseId,
            },
          },
        });

        if (currentBalance) {
          await tx.stockBalance.update({
            where: { id: currentBalance.id },
            data: { quantity: currentBalance.quantity + qty },
          });
        } else {
          await tx.stockBalance.create({
            data: {
              itemId: it.itemId,
              warehouseId: data.warehouseId,
              quantity: qty,
            },
          });
        }

        // Record stock transaction
        await tx.stockTransaction.create({
          data: {
            itemId: it.itemId,
            warehouseId: data.warehouseId,
            type: 'PURCHASE',
            quantity: qty,
            unitCost: price,
            totalCost: qty * price,
            referenceType: 'PurchaseInvoice',
            referenceId: createdInvoice.id,
            notes: `شراء بموجب فاتورة مشتريات ${invoiceNumber}`,
          },
        });

        // Update item purchasePrice & weighted average cost
        const itemObj = await tx.item.findUnique({ where: { id: it.itemId } });
        if (itemObj) {
          const oldQty = currentBalance ? currentBalance.quantity : 0;
          const newAvgCost = oldQty + qty > 0 ? ((oldQty * itemObj.avgCost) + (qty * price)) / (oldQty + qty) : price;
          await tx.item.update({
            where: { id: it.itemId },
            data: {
              purchasePrice: price,
              avgCost: Math.round(newAvgCost * 100) / 100,
            },
          });
        }
      }

      // 3. Update Supplier balance (increase liability by remaining amount)
      if (remainingAmount > 0) {
        await tx.supplier.update({
          where: { id: data.supplierId },
          data: {
            currentBalance: { increment: remainingAmount },
          },
        });
      }

      return createdInvoice;
    });

    await logAudit({ action: 'POST', entity: 'PurchaseInvoice', entityId: invoice.id, details: `اعتماد فاتورة مشتريات ${invoiceNumber} بمبلغ ${grandTotal} ر.س` });

    res.status(201).json(invoice);
  } catch (err: any) {
    console.error('Purchase invoice error:', err);
    res.status(400).json({ error: err.message });
  }
});

// --- Supplier Statement of Account ---
router.get('/suppliers/:id/statement', async (req, res) => {
  try {
    const supplier = await prisma.supplier.findUnique({
      where: { id: req.params.id },
      include: {
        purchaseInvoices: { orderBy: { date: 'desc' } },
        purchaseReturns: { orderBy: { date: 'desc' } },
      },
    });

    if (!supplier) return res.status(404).json({ error: 'المورد غير موجود' });

    res.json({
      supplier,
      invoicesCount: supplier.purchaseInvoices.length,
      totalPurchases: supplier.purchaseInvoices.reduce((sum, i) => sum + i.grandTotal, 0),
      totalPaid: supplier.purchaseInvoices.reduce((sum, i) => sum + i.paidAmount, 0),
      totalRemaining: supplier.currentBalance,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
