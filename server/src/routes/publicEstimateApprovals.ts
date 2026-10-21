import { Router } from 'express';
import { logAudit } from '../middleware/audit';
import { prisma } from '../lib/prisma';
import { hashEstimateApprovalToken } from '../services/estimateApprovalToken';
import { escapeWhatsAppHtml } from '../services/whatsapp';

const router = Router();

router.get('/:token', async (req, res) => {
  try {
    const estimate = await prisma.repairEstimate.findFirst({
      where: {
        approvalTokenHash: hashEstimateApprovalToken(req.params.token),
        approvalTokenExpiresAt: { gt: new Date() },
        status: 'PENDING',
        isApprovedByCustomer: false,
      },
      include: { items: true, repairOrder: { include: { customer: true, vehicle: true } } },
    });
    if (!estimate) return res.status(404).send('رابط الموافقة غير صالح أو انتهت صلاحيته.');

    const rows = estimate.items.map((item) => `<tr><td>${escapeWhatsAppHtml(item.description)}</td><td>${item.quantity}</td><td>${item.total.toLocaleString('ar-EG')} ج.م</td></tr>`).join('');
    res.type('html').send(`<!doctype html>
      <html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <title>موافقة عرض السعر ${escapeWhatsAppHtml(estimate.estimateNumber)}</title>
      <body style="font:16px Arial,sans-serif;max-width:720px;margin:32px auto;padding:16px;color:#0f172a">
        <h1>عرض السعر ${escapeWhatsAppHtml(estimate.estimateNumber)}</h1>
        <p>أمر الشغل: ${escapeWhatsAppHtml(estimate.repairOrder.orderNumber)}</p>
        <p>السيارة: ${escapeWhatsAppHtml(`${estimate.repairOrder.vehicle.make} ${estimate.repairOrder.vehicle.model} ${estimate.repairOrder.vehicle.year}`)}</p>
        <p>الشكوى: ${escapeWhatsAppHtml(estimate.repairOrder.customerComplaint)}</p>
        <table style="width:100%;border-collapse:collapse"><thead><tr><th>البيان</th><th>الكمية</th><th>الإجمالي</th></tr></thead><tbody>${rows}</tbody></table>
        <p style="font-weight:bold">الإجمالي المطلوب: ${estimate.grandTotal.toLocaleString('ar-EG')} ج.م</p>
        <label for="notes">ملاحظات (اختياري)</label><textarea id="notes" maxlength="1000" style="display:block;width:100%;min-height:80px;margin-top:8px"></textarea>
        <p id="result" role="status"></p>
        <div style="display:flex;gap:12px;margin-top:20px">
          <button onclick="respond('APPROVED')" style="padding:12px 18px;background:#15803d;color:white;border:0;border-radius:8px">أوافق على العرض</button>
          <button onclick="respond('REJECTED')" style="padding:12px 18px;background:#b91c1c;color:white;border:0;border-radius:8px">أرفض العرض</button>
        </div>
        <script>
          async function respond(decision) {
            const result = document.getElementById('result');
            const response = await fetch(location.pathname + '/respond', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ decision, notes: document.getElementById('notes').value })
            });
            const data = await response.json();
            result.textContent = response.ok ? data.message : (data.error || 'تعذر تسجيل الرد');
            if (response.ok) document.querySelectorAll('button').forEach((button) => { button.disabled = true; });
          }
        </script>
      </body></html>`);
  } catch (error) {
    console.error('Public estimate approval lookup failed:', error);
    res.status(500).send('تعذر فتح عرض السعر الآن.');
  }
});

router.post('/:token/respond', async (req, res) => {
  try {
    const decision = req.body.decision;
    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      return res.status(400).json({ error: 'اختيار الموافقة غير صالح' });
    }

    const now = new Date();
    const tokenHash = hashEstimateApprovalToken(req.params.token);
    const estimate = await prisma.repairEstimate.findFirst({
      where: {
        approvalTokenHash: tokenHash,
        approvalTokenExpiresAt: { gt: now },
        status: 'PENDING',
        isApprovedByCustomer: false,
      },
      include: { items: true },
    });
    if (!estimate) return res.status(404).json({ error: 'رابط الموافقة غير صالح أو تم استخدامه' });

    const notes = typeof req.body.notes === 'string' ? req.body.notes.trim().slice(0, 1000) : '';
    await prisma.$transaction(async (tx) => {
      const result = await tx.repairEstimate.updateMany({
        where: {
          id: estimate.id,
          approvalTokenHash: tokenHash,
          approvalTokenExpiresAt: { gt: now },
          status: 'PENDING',
          isApprovedByCustomer: false,
        },
        data: {
          isApprovedByCustomer: decision === 'APPROVED',
          approvedAt: decision === 'APPROVED' ? now : null,
          approvalMethod: 'CUSTOMER_WHATSAPP',
          approvalTokenHash: null,
          approvalTokenExpiresAt: null,
          status: decision,
          customerNotes: notes || estimate.customerNotes,
        },
      });
      if (!result.count) throw new Error('تم تسجيل الرد بالفعل');

      if (decision === 'APPROVED') {
        for (const item of estimate.items) {
          if (item.type === 'PART' && item.itemId) {
            const itemData = await tx.item.findUnique({ where: { id: item.itemId } });
            await tx.repairPart.create({
              data: {
                repairOrderId: estimate.repairOrderId,
                itemId: item.itemId,
                requestedQty: item.quantity,
                unitPrice: item.unitPrice,
                costPrice: itemData?.avgCost || 0,
                total: item.total,
                status: 'REQUESTED',
              },
            });
          } else if (item.type === 'LABOR') {
            await tx.repairLabor.create({
              data: {
                repairOrderId: estimate.repairOrderId,
                serviceName: item.description,
                hours: 1,
                rate: item.unitPrice,
                total: item.total,
                commissionRate: 10,
                commissionAmount: item.total * 0.1,
                status: 'PENDING',
              },
            });
          }
        }
        await tx.repairOrder.update({
          where: { id: estimate.repairOrderId },
          data: { status: 'APPROVED' },
        });
      }
    });

    await logAudit({
      action: decision === 'APPROVED' ? 'APPROVE_ESTIMATE' : 'REJECT_ESTIMATE',
      entity: 'RepairOrder',
      entityId: estimate.repairOrderId,
      details: `${decision === 'APPROVED' ? 'موافقة' : 'رفض'} العميل عبر رابط WhatsApp لعرض السعر ${estimate.estimateNumber}`,
      ipAddress: req.ip,
    });
    res.json({ message: decision === 'APPROVED' ? 'تم تسجيل موافقتك بنجاح.' : 'تم تسجيل رفض العرض.' });
  } catch (error) {
    if (error instanceof Error && error.message === 'تم تسجيل الرد بالفعل') {
      return res.status(409).json({ error: error.message });
    }
    console.error('Public estimate approval failed:', error);
    res.status(500).json({ error: 'تعذر تسجيل الرد الآن.' });
  }
});

export default router;