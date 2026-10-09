import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { logAudit } from '../middleware/audit';
import { nextInvoiceNumber, withInvoiceTransaction } from '../services/documentNumbers';

const router = Router();

// --- List Job Cards with filters ---
router.get('/job-cards', async (req, res) => {
  try {
    const { status, customerId, vehicleId, technicianId, q } = req.query;
    let whereClause: any = {};

    if (status) {
      whereClause.status = String(status);
    }
    if (customerId) whereClause.customerId = String(customerId);
    if (vehicleId) whereClause.vehicleId = String(vehicleId);
    if (technicianId) whereClause.technicianId = String(technicianId);

    if (q) {
      const searchStr = String(q).trim();
      whereClause.OR = [
        { orderNumber: { contains: searchStr } },
        { customerComplaint: { contains: searchStr } },
        { customer: { name: { contains: searchStr } } },
        { customer: { phone: { contains: searchStr } } },
        { vehicle: { plateNumber: { contains: searchStr } } },
        { vehicle: { vin: { contains: searchStr } } },
      ];
    }

    const jobCards = await prisma.repairOrder.findMany({
      where: whereClause,
      include: {
        customer: true,
        vehicle: true,
        technician: true,
        serviceAdvisor: true,
        branch: true,
        _count: { select: { parts: true, labors: true, estimates: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(jobCards);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Get Single Job Card with ALL Relations (Section 23: Complete 10-tab screen) ---
router.get('/job-cards/:id', async (req, res) => {
  try {
    const jobCard = await prisma.repairOrder.findUnique({
      where: { id: req.params.id },
      include: {
        customer: true,
        vehicle: true,
        technician: true,
        serviceAdvisor: true,
        branch: true,
        inspections: { orderBy: { createdAt: 'desc' } },
        estimates: {
          include: {
            items: { include: { item: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        parts: {
          include: {
            item: true,
            warehouse: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        labors: {
          include: { technician: true },
          orderBy: { createdAt: 'asc' },
        },
        commissions: {
          include: { employee: true },
        },
        salesInvoice: {
          include: { items: true },
        },
      },
    });

    if (!jobCard) return res.status(404).json({ error: 'أمر الإصلاح غير موجود' });

    // Fetch related audit logs for this job card
    const auditLogs = await prisma.auditLog.findMany({
      where: { entity: 'RepairOrder', entityId: jobCard.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.json({
      jobCard,
      auditLogs,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Open New Job Card ---
router.post('/job-cards', async (req, res) => {
  try {
    const {
      customerId,
      vehicleId,
      currentOdometer,
      fuelLevel = '50%',
      technicianId,
      serviceAdvisorId,
      branchId,
      customerComplaint,
      intakeNotes,
      estimatedCompletion,
    } = req.body;

    if (!customerId || !vehicleId || !customerComplaint) {
      return res.status(400).json({ error: 'العميل والسيارة وشكوى العميل حقول إلزامية' });
    }

    const count = await prisma.repairOrder.count();
    const orderNumber = `JC-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;

    const jobCard = await prisma.repairOrder.create({
      data: {
        orderNumber,
        customerId,
        vehicleId,
        currentOdometer: parseInt(currentOdometer) || 0,
        fuelLevel,
        technicianId: technicianId || null,
        serviceAdvisorId: serviceAdvisorId || null,
        branchId: branchId || null,
        customerComplaint,
        intakeNotes: intakeNotes || null,
        estimatedCompletion: estimatedCompletion ? new Date(estimatedCompletion) : null,
        status: 'NEW',
      },
      include: { customer: true, vehicle: true, technician: true, serviceAdvisor: true },
    });

    // Update vehicle's current odometer and last service date
    if (currentOdometer) {
      await prisma.vehicle.update({
        where: { id: vehicleId },
        data: {
          currentOdometer: parseInt(currentOdometer),
          lastServiceDate: new Date(),
        },
      });
    }

    await logAudit({
      action: 'CREATE',
      entity: 'RepairOrder',
      entityId: jobCard.id,
      details: `فتح أمر إصلاح جديد رقم ${orderNumber} للسيارة ${jobCard.vehicle.plateNumber}`,
    });

    res.status(201).json(jobCard);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Update Job Card Status ---
router.patch('/job-cards/:id/status', async (req, res) => {
  try {
    const { status, notes } = req.body;

    const currentOrder = await prisma.repairOrder.findUnique({
      where: { id: req.params.id },
      include: { estimates: true },
    });

    if (!currentOrder) return res.status(404).json({ error: 'أمر الإصلاح غير موجود' });

    // Business Rule Section 19: Cannot approve job card without customer approval on estimate!
    if (status === 'APPROVED') {
      const hasApprovedEstimate = currentOrder.estimates.some((e) => e.isApprovedByCustomer);
      if (!hasApprovedEstimate && currentOrder.estimates.length > 0) {
        return res.status(400).json({
          error: 'لا يمكن اعتماد أمر الإصلاح ونقله للعمل إلا بعد تسجيل موافقة العميل على عرض السعر (Estimate)!',
        });
      }
    }

    const updated = await prisma.repairOrder.update({
      where: { id: req.params.id },
      data: {
        status,
        notes: notes || currentOrder.notes,
        actualCompletion: status === 'COMPLETED' ? new Date() : currentOrder.actualCompletion,
      },
    });

    await logAudit({
      action: 'UPDATE_STATUS',
      entity: 'RepairOrder',
      entityId: updated.id,
      details: `تحديث حالة أمر الإصلاح ${updated.orderNumber} من ${currentOrder.status} إلى ${status}`,
    });

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Save / Update 10-Point Technical Inspection Checklist (Section 6) ---
router.post('/job-cards/:id/inspection', async (req, res) => {
  try {
    const repairOrderId = req.params.id;
    const {
      engineCheck,
      oilsCheck,
      brakesCheck,
      tiresCheck,
      batteryCheck,
      electricalCheck,
      acCheck,
      suspensionCheck,
      coolingCheck,
      computerScanCheck,
      inspectorNotes,
      inspectionResults,
      imagesJson,
    } = req.body;

    const inspection = await prisma.repairInspection.create({
      data: {
        repairOrderId,
        engineCheck: engineCheck || 'GOOD',
        oilsCheck: oilsCheck || 'GOOD',
        brakesCheck: brakesCheck || 'GOOD',
        tiresCheck: tiresCheck || 'GOOD',
        batteryCheck: batteryCheck || 'GOOD',
        electricalCheck: electricalCheck || 'GOOD',
        acCheck: acCheck || 'GOOD',
        suspensionCheck: suspensionCheck || 'GOOD',
        coolingCheck: coolingCheck || 'GOOD',
        computerScanCheck: computerScanCheck || 'GOOD',
        inspectorNotes: inspectorNotes || null,
        inspectionResults: typeof inspectionResults === 'object' ? JSON.stringify(inspectionResults) : inspectionResults,
        imagesJson: typeof imagesJson === 'object' ? JSON.stringify(imagesJson) : imagesJson,
      },
    });

    // Update job card status to PENDING_APPROVAL or PENDING_INSPECTION
    await prisma.repairOrder.update({
      where: { id: repairOrderId },
      data: { status: 'PENDING_APPROVAL' },
    });

    await logAudit({
      action: 'INSPECTION',
      entity: 'RepairOrder',
      entityId: repairOrderId,
      details: 'تسجيل نتائج الفحص الفني الشامل للسيارة',
    });

    res.status(201).json(inspection);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Create Estimate / Quotation (Section 6) ---
router.post('/job-cards/:id/estimate', async (req, res) => {
  try {
    const repairOrderId = req.params.id;
    const { items, discount = 0, customerNotes } = req.body;

    const count = await prisma.repairEstimate.count();
    const estimateNumber = `EST-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;

    let subtotalParts = 0;
    let subtotalLabor = 0;

    items.forEach((it: any) => {
      const lineTotal = parseFloat(it.unitPrice) * parseInt(it.quantity || 1);
      if (it.type === 'PART') subtotalParts += lineTotal;
      else subtotalLabor += lineTotal;
    });

    const disc = parseFloat(discount) || 0;
    const subtotal = subtotalParts + subtotalLabor;
    const taxable = Math.max(0, subtotal - disc);
    const taxAmount = (taxable * 15) / 100;
    const grandTotal = taxable + taxAmount;

    const estimate = await prisma.repairEstimate.create({
      data: {
        estimateNumber,
        repairOrderId,
        subtotalParts,
        subtotalLabor,
        discount: disc,
        taxAmount,
        grandTotal,
        customerNotes: customerNotes || null,
        status: 'PENDING',
        items: {
          create: items.map((it: any) => ({
            type: it.type || 'PART',
            itemId: it.itemId || null,
            description: it.description,
            quantity: parseInt(it.quantity || 1),
            unitPrice: parseFloat(it.unitPrice || 0),
            total: parseFloat(it.unitPrice || 0) * parseInt(it.quantity || 1),
          })),
        },
      },
      include: { items: true },
    });

    await prisma.repairOrder.update({
      where: { id: repairOrderId },
      data: {
        status: 'PENDING_APPROVAL',
        totalParts: subtotalParts,
        totalLabor: subtotalLabor,
        discount: disc,
        taxAmount,
        grandTotal,
      },
    });

    await logAudit({
      action: 'CREATE_ESTIMATE',
      entity: 'RepairOrder',
      entityId: repairOrderId,
      details: `إنشاء عرض سعر مبدئي رقم ${estimateNumber} بإجمالي ${grandTotal} ر.س`,
    });

    res.status(201).json(estimate);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Record Customer Approval on Estimate (Rule: Unlocks Status to APPROVED / IN_PROGRESS) ---
router.post('/job-cards/:id/estimate/:estimateId/approve', async (req, res) => {
  try {
    const { approved, customerNotes } = req.body;

    const estimate = await prisma.repairEstimate.update({
      where: { id: req.params.estimateId },
      data: {
        isApprovedByCustomer: approved === true,
        approvedAt: approved === true ? new Date() : null,
        status: approved === true ? 'APPROVED' : 'REJECTED',
        customerNotes: customerNotes || null,
      },
      include: { items: true },
    });

    if (approved) {
      // Auto-populate RepairParts and RepairLabor from Estimate items!
      for (const it of estimate.items) {
        if (it.type === 'PART' && it.itemId) {
          const itemObj = await prisma.item.findUnique({ where: { id: it.itemId } });
          await prisma.repairPart.create({
            data: {
              repairOrderId: req.params.id,
              itemId: it.itemId,
              requestedQty: it.quantity,
              issuedQty: 0,
              usedQty: 0,
              unitPrice: it.unitPrice,
              costPrice: itemObj?.avgCost || 0,
              total: it.total,
              status: 'REQUESTED',
            },
          });
        } else if (it.type === 'LABOR') {
          await prisma.repairLabor.create({
            data: {
              repairOrderId: req.params.id,
              serviceName: it.description,
              hours: 1,
              rate: it.unitPrice,
              total: it.total,
              commissionRate: 10,
              commissionAmount: (it.total * 10) / 100,
              status: 'PENDING',
            },
          });
        }
      }

      await prisma.repairOrder.update({
        where: { id: req.params.id },
        data: { status: 'APPROVED' },
      });
    }

    await logAudit({
      action: approved ? 'APPROVE_ESTIMATE' : 'REJECT_ESTIMATE',
      entity: 'RepairOrder',
      entityId: req.params.id,
      details: approved ? 'تسجيل موافقة العميل الرسمية على عرض السعر' : 'تسجيل رفض العميل لعرض السعر',
    });

    res.json(estimate);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Request / Issue Parts to Workshop for Job Card (Section 9: إذن صرف داخلي) ---
router.post('/job-cards/:id/parts/issue', async (req, res) => {
  try {
    const repairOrderId = req.params.id;
    const { partId, warehouseId, quantity } = req.body;

    const qty = parseInt(quantity || 1);

    const part = await prisma.repairPart.findUnique({
      where: { id: partId },
      include: { item: true },
    });

    if (!part) return res.status(404).json({ error: 'طلب القطعة غير موجود' });

    const whId = warehouseId || part.warehouseId || (await prisma.warehouse.findFirst({ where: { code: 'WH-SHOP' } }))?.id;

    // Check stock
    const balance = await prisma.stockBalance.findUnique({
      where: {
        itemId_warehouseId: { itemId: part.itemId, warehouseId: whId! },
      },
    });

    if (!balance || balance.quantity < qty) {
      return res.status(400).json({
        error: `رصيد القطعة (${part.item.nameAr}) في المخزن غير كافٍ للصرف! المتاح: ${balance?.quantity || 0}`,
      });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Deduct stock from workshop warehouse
      await tx.stockBalance.update({
        where: { id: balance.id },
        data: { quantity: { decrement: qty } },
      });

      // 2. Record StockTransaction
      await tx.stockTransaction.create({
        data: {
          itemId: part.itemId,
          warehouseId: whId!,
          type: 'WORKSHOP_ISSUE',
          quantity: -qty,
          unitCost: part.item.avgCost,
          totalCost: -(qty * part.item.avgCost),
          referenceType: 'RepairOrder',
          referenceId: repairOrderId,
          notes: `صرف داخلي للورشة لأمر إصلاح رقم ${repairOrderId}`,
        },
      });

      // 3. Update RepairPart record
      await tx.repairPart.update({
        where: { id: partId },
        data: {
          warehouseId: whId,
          issuedQty: part.issuedQty + qty,
          usedQty: part.usedQty + qty,
          status: 'ISSUED',
          issuedAt: new Date(),
        },
      });
    });

    await logAudit({
      action: 'ISSUE_PART',
      entity: 'RepairOrder',
      entityId: repairOrderId,
      details: `صرف عدد ${qty} من القطعة ${part.item.nameAr} للورشة`,
    });

    res.json({ success: true, message: 'تم صرف القطعة للورشة وخصمها من المخزون بنجاح' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Final Maintenance Invoice Creation (Section 7: فاتورة الصيانة النهائية) ---
router.post('/job-cards/:id/invoice', async (req, res) => {
  try {
    const repairOrderId = req.params.id;
    const { paymentMethod = 'CASH', cashPaid = 0, cardPaid = 0, discount = 0 } = req.body;

    const jobCard = await prisma.repairOrder.findUnique({
      where: { id: repairOrderId },
      include: {
        customer: true,
        vehicle: true,
        parts: { include: { item: true } },
        labors: { include: { technician: true } },
      },
    });

    if (!jobCard) return res.status(404).json({ error: 'أمر الإصلاح غير موجود' });

    // Calculate totals
    const partsTotal = jobCard.parts.reduce((sum, p) => sum + (p.unitPrice * (p.usedQty || p.requestedQty)), 0);
    const laborTotal = jobCard.labors.reduce((sum, l) => sum + l.total, 0);
    const disc = parseFloat(discount) || jobCard.discount || 0;
    const subtotal = partsTotal + laborTotal;
    const taxable = Math.max(0, subtotal - disc);
    const taxAmount = (taxable * 15) / 100;
    const grandTotal = taxable + taxAmount;

    let paid = 0;
    let cash = parseFloat(cashPaid) || 0;
    let card = parseFloat(cardPaid) || 0;

    if (paymentMethod === 'CASH') {
      paid = grandTotal;
      cash = grandTotal;
    } else if (paymentMethod === 'CARD') {
      paid = grandTotal;
      card = grandTotal;
    } else if (paymentMethod === 'SPLIT') {
      paid = cash + card;
    }

    const remainingAmount = Math.max(0, grandTotal - paid);

    const invoice = await withInvoiceTransaction(prisma, async (tx) => {
      const invoiceNumber = await nextInvoiceNumber(tx, 'MINV');
      // 1. Create Final Sales Invoice
      const inv = await tx.salesInvoice.create({
        data: {
          invoiceNumber,
          customerId: jobCard.customerId,
          vehicleId: jobCard.vehicleId,
          repairOrderId: jobCard.id,
          branchId: jobCard.branchId,
          invoiceType: 'MAINTENANCE',
          subtotal,
          discount: disc,
          taxAmount,
          grandTotal,
          paidAmount: paid,
          remainingAmount,
          paymentMethod,
          cashPaid: cash,
          cardPaid: card,
          status: remainingAmount === 0 ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'POSTED',
          notes: `فاتورة صيانة شاملة لأمر الإصلاح رقم ${jobCard.orderNumber}`,
          items: {
            create: [
              ...jobCard.parts.map((p) => ({
                itemId: p.itemId,
                description: p.item.nameAr,
                quantity: p.usedQty || p.requestedQty,
                unitPrice: p.unitPrice,
                costPrice: p.costPrice,
                discount: 0,
                taxRate: 15.0,
                taxAmount: ((p.unitPrice * (p.usedQty || p.requestedQty)) * 15) / 100,
                total: (p.unitPrice * (p.usedQty || p.requestedQty)) * 1.15,
                itemType: 'PART',
              })),
              ...jobCard.labors.map((l) => ({
                description: l.serviceName,
                quantity: 1,
                unitPrice: l.total,
                costPrice: 0,
                discount: 0,
                taxRate: 15.0,
                taxAmount: (l.total * 15) / 100,
                total: l.total * 1.15,
                itemType: 'LABOR',
                technicianId: l.technicianId,
              })),
            ],
          },
        },
        include: { items: true, customer: true, vehicle: true },
      });

      // 2. Close Job Card and update totals
      await tx.repairOrder.update({
        where: { id: jobCard.id },
        data: {
          status: 'CLOSED',
          totalParts: partsTotal,
          totalLabor: laborTotal,
          discount: disc,
          taxAmount,
          grandTotal,
          paidAmount: paid,
          remainingAmount,
          actualCompletion: new Date(),
        },
      });

      // 3. Record technician commissions
      for (const l of jobCard.labors) {
        if (l.technicianId && l.commissionAmount > 0) {
          await tx.commission.create({
            data: {
              employeeId: l.technicianId,
              repairOrderId: jobCard.id,
              amount: l.commissionAmount,
              rate: l.commissionRate,
              calculatedOn: l.total,
              status: 'PENDING',
              notes: `عمولة خدمة ${l.serviceName} لأمر إصلاح ${jobCard.orderNumber}`,
            },
          });
        }
      }

      // 4. Update customer balance if remaining amount exists
      if (remainingAmount > 0) {
        await tx.customer.update({
          where: { id: jobCard.customerId },
          data: { currentBalance: { increment: remainingAmount } },
        });
      }

      // 5. Update Cashbox if cash received
      if (cash > 0) {
        const cashbox = await tx.cashbox.findFirst();
        if (cashbox) {
          await tx.cashbox.update({
            where: { id: cashbox.id },
            data: { balance: { increment: cash } },
          });

          await tx.cashTransaction.create({
            data: {
              cashboxId: cashbox.id,
              type: 'RECEIPT',
              amount: cash,
              referenceType: 'SALES',
              referenceId: inv.id,
              partyType: 'CUSTOMER',
              partyName: jobCard.customer.name,
              description: `تحصيل فاتورة صيانة أمر إصلاح ${jobCard.orderNumber}`,
            },
          });
        }
      }

      return inv;
    });

    await logAudit({
      action: 'INVOICE_JOB_CARD',
      entity: 'RepairOrder',
      entityId: jobCard.id,
      details: `إصدار فاتورة الصيانة النهائية ${invoice.invoiceNumber} وإغلاق أمر الإصلاح ${jobCard.orderNumber}`,
    });

    res.status(201).json(invoice);
  } catch (err: any) {
    console.error('Job Card Invoicing error:', err);
    res.status(400).json({ error: err.message });
  }
});

export default router;
