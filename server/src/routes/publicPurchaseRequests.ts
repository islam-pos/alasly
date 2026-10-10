import { Router } from 'express';
import {
  escapeWhatsAppHtml,
  findPublicPurchaseRequest,
} from '../services/whatsapp';
import { prisma } from '../lib/prisma';

const router = Router();

router.get('/:token', async (req, res) => {
  try {
    const request = await findPublicPurchaseRequest(req.params.token);
    if (!request) return res.status(404).send('رابط طلب الشراء غير صالح أو انتهت صلاحيته.');
    const rows = request.items.map((row) =>
      `<tr><td>${escapeWhatsAppHtml(row.item.nameAr)}</td><td>${row.quantity}</td></tr>`,
    ).join('');
    const responseText = request.supplierResponse === 'ACCEPTED'
      ? 'تم تأكيد استلام الطلب.'
      : request.supplierResponse === 'DECLINED'
        ? 'تم تسجيل الاعتذار عن الطلب.'
        : '';
    res.type('html').send(`<!doctype html>
      <html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
      <title>طلب نواقص ${escapeWhatsAppHtml(request.requestNumber)}</title>
      <body style="font:16px Arial,sans-serif;max-width:720px;margin:32px auto;padding:16px;color:#0f172a">
        <h1>طلب نواقص ${escapeWhatsAppHtml(request.requestNumber)}</h1>
        <p>المورد: ${escapeWhatsAppHtml(request.supplier?.name || '')}</p>
        <p>المخزن: ${escapeWhatsAppHtml(request.warehouse.name)}</p>
        <table style="width:100%;border-collapse:collapse"><thead><tr><th>الصنف</th><th>الكمية المطلوبة</th></tr></thead><tbody>${rows}</tbody></table>
        <p id="result" role="status">${responseText}</p>
        ${request.supplierResponse ? '' : `<div style="display:flex;gap:12px;margin-top:24px">
          <button onclick="respond('ACCEPTED')" style="padding:12px 18px;background:#15803d;color:white;border:0;border-radius:8px">تأكيد الطلب</button>
          <button onclick="respond('DECLINED')" style="padding:12px 18px;background:#b91c1c;color:white;border:0;border-radius:8px">الاعتذار عن الطلب</button>
        </div>
        <script>
          async function respond(response) {
            const result = document.getElementById('result');
            const responseData = await fetch(location.pathname + '/respond', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ response })
            });
            const data = await responseData.json();
            result.textContent = responseData.ok ? data.message : (data.error || 'تعذر تسجيل الرد');
            if (responseData.ok) location.reload();
          }
        </script>`}
      </body></html>`);
  } catch (error) {
    console.error('Public purchase request lookup failed:', error);
    res.status(500).send('تعذر فتح طلب الشراء الآن.');
  }
});

router.post('/:token/respond', async (req, res) => {
  try {
    const request = await findPublicPurchaseRequest(req.params.token);
    if (!request) return res.status(404).json({ error: 'رابط طلب الشراء غير صالح أو انتهت صلاحيته' });
    if (request.supplierResponse) return res.status(409).json({ error: 'تم تسجيل رد على هذا الطلب بالفعل' });
    if (req.body.response !== 'ACCEPTED' && req.body.response !== 'DECLINED') {
      return res.status(400).json({ error: 'نوع الرد غير صالح' });
    }
    await prisma.purchaseRequest.update({
      where: { id: request.id },
      data: {
        supplierResponse: req.body.response,
        status: req.body.response === 'ACCEPTED' ? 'SUPPLIER_CONFIRMED' : 'SUPPLIER_DECLINED',
      },
    });
    res.json({ message: req.body.response === 'ACCEPTED' ? 'تم تأكيد الطلب بنجاح' : 'تم تسجيل الاعتذار عن الطلب' });
  } catch (error) {
    console.error('Public purchase request response failed:', error);
    res.status(500).json({ error: 'تعذر تسجيل الرد الآن' });
  }
});

export default router;
