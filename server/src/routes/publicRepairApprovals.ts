import { createHash } from 'crypto';
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { approveRepairEstimate } from '../services/repairEstimates';

const router = Router();
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[character] || character);

router.get('/:token', async (req, res) => {
  try {
    const estimate = await prisma.repairEstimate.findFirst({
      where: { approvalTokenHash: hashToken(req.params.token) },
      include: {
        items: true,
        repairOrder: { include: { customer: true, vehicle: true } },
      },
    });
    if (!estimate || !estimate.approvalTokenExpiresAt || estimate.approvalTokenExpiresAt < new Date()) {
      return res.status(404).type('html').send('<h1 dir="rtl">رابط الموافقة غير صالح أو انتهت صلاحيته.</h1>');
    }
    if (estimate.status !== 'PENDING') {
      return res.status(409).type('html').send('<h1 dir="rtl">تم الرد على عرض السعر مسبقًا.</h1>');
    }

    const rows = estimate.items.map((item) => (
      `<tr><td>${escapeHtml(item.description)}</td><td>${item.quantity}</td><td>${item.unitPrice.toFixed(2)} ج.م</td><td>${item.total.toFixed(2)} ج.م</td></tr>`
    )).join('');
    const html = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1"><title>موافقة عرض السعر</title>
      <body style="font:16px Arial,sans-serif;max-width:760px;margin:24px auto;padding:16px;color:#0f172a">
        <h1>مراجعة عرض السعر ${escapeHtml(estimate.estimateNumber)}</h1>
        <p>أمر الإصلاح: ${escapeHtml(estimate.repairOrder.orderNumber)}</p>
        <p>العميل: ${escapeHtml(estimate.repairOrder.customer.name)}</p>
        <p>المركبة: ${escapeHtml(`${estimate.repairOrder.vehicle.make} ${estimate.repairOrder.vehicle.model} - ${estimate.repairOrder.vehicle.plateNumber}`)}</p>
        <table style="width:100%;border-collapse:collapse"><thead><tr><th>البيان</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead><tbody>${rows}</tbody></table>
        <p>الإجمالي شامل الضريبة: <strong>${estimate.grandTotal.toFixed(2)} ج.م</strong></p>
        <label>ملاحظات (اختياري)<br><textarea id="notes" rows="3" style="width:100%;margin-top:8px"></textarea></label>
        <p id="result" role="status"></p>
        <div style="display:flex;gap:12px;margin-top:18px">
          <button onclick="respond(true)" style="padding:12px 18px;background:#15803d;color:white;border:0;border-radius:8px">أوافق على عرض السعر</button>
          <button onclick="respond(false)" style="padding:12px 18px;background:#b91c1c;color:white;border:0;border-radius:8px">أرفض العرض</button>
        </div>
        <script>
          async function respond(approved) {
            const result = document.getElementById('result');
            const response = await fetch(location.pathname, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ approved, customerNotes: document.getElementById('notes').value })
            });
            const data = await response.json();
            result.textContent = response.ok ? data.message : (data.error || 'تعذر تسجيل الرد');
            if (response.ok) document.querySelectorAll('button').forEach(button => button.disabled = true);
          }
        </script>
      </body></html>`;
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(html);
  } catch (error) {
    console.error('Public repair estimate lookup failed:', error);
    res.status(500).type('html').send('<h1 dir="rtl">تعذر تحميل عرض السعر الآن.</h1>');
  }
});

router.post('/:token', async (req, res) => {
  try {
    if (typeof req.body?.approved !== 'boolean') {
      return res.status(400).json({ error: 'يرجى اختيار الموافقة أو الرفض' });
    }
    const estimate = await prisma.repairEstimate.findFirst({
      where: {
        approvalTokenHash: hashToken(req.params.token),
        approvalTokenExpiresAt: { gt: new Date() },
        status: 'PENDING',
      },
      select: { id: true, repairOrderId: true },
    });
    if (!estimate) return res.status(404).json({ error: 'رابط الموافقة غير صالح أو انتهت صلاحيته أو تم استخدامه' });

    await prisma.$transaction((tx) => approveRepairEstimate(
      tx,
      estimate.repairOrderId,
      estimate.id,
      req.body.approved,
      typeof req.body.customerNotes === 'string' ? req.body.customerNotes.slice(0, 1000) : undefined,
    ));
    res.json({ message: req.body.approved ? 'تم تسجيل موافقتك على عرض السعر.' : 'تم تسجيل رفض عرض السعر.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذر تسجيل الرد';
    res.status(message.includes('مسبقًا') ? 409 : 400).json({ error: message });
  }
});

export default router;
