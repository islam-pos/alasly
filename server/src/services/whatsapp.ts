import { createHash, randomBytes } from 'crypto';
import { existsSync } from 'fs';
import PDFDocument from 'pdfkit';
import { prisma } from '../lib/prisma';

const getWhatsAppConfig = () => ({
  graphVersion: process.env.WHATSAPP_API_VERSION,
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
});
const isWhatsAppConfigured = () => {
  const config = getWhatsAppConfig();
  return Boolean(config.graphVersion && config.phoneNumberId && config.accessToken);
};

const normalizePhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  const international = digits.startsWith('0') ? `20${digits.slice(1)}` : digits;
  if (international.length < 10 || international.length > 15) {
    throw new Error('رقم واتساب غير صالح؛ أدخله بصيغة دولية');
  }
  return international;
};

const createInvoicePdf = async (
  invoiceType: 'sales' | 'supplier',
  invoice: any,
  company: any,
): Promise<Buffer> => {
  const fontPath = process.env.ARABIC_FONT_PATH || '/usr/share/fonts/ttf-dejavu/DejaVuSans.ttf';
  if (!existsSync(fontPath)) throw new Error('خط PDF العربي غير موجود على الخادم');

  const doc = new PDFDocument({ size: 'A4', margin: 42 });
  const chunks: Buffer[] = [];
  const pdf = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.font(fontPath);
  const writeLine = (text: string, options: Record<string, unknown> = {}) => {
    doc.text(text, { align: 'right', features: ['rtla', 'liga'], ...options });
  };

  writeLine(company?.name || 'فاتورة', { fontSize: 18 });
  if (company?.invoiceHeader) writeLine(company.invoiceHeader);
  writeLine(`${invoiceType === 'sales' ? 'فاتورة مبيعات' : 'فاتورة مشتريات'} رقم: ${invoice.invoiceNumber}`);
  writeLine(`التاريخ: ${new Date(invoice.createdAt || Date.now()).toLocaleDateString('ar-EG')}`);
  writeLine(`${invoiceType === 'sales' ? 'العميل' : 'المورد'}: ${invoiceType === 'sales' ? invoice.customer?.name || 'عميل نقدي' : invoice.supplier?.name || ''}`);
  if (company?.address) writeLine(company.address);
  if (company?.phone) writeLine(`الهاتف: ${company.phone}`);
  doc.moveDown();
  writeLine('الأصناف', { fontSize: 14 });
  for (const row of invoice.items || []) {
    const name = row.item?.nameAr || row.description || 'صنف';
    writeLine(`${name} — ${row.quantity} × ${row.unitPrice} = ${row.total}`);
  }
  doc.moveDown();
  writeLine(`المجموع الفرعي: ${invoice.subtotal}`);
  if (invoice.discount) writeLine(`الخصم: ${invoice.discount}`);
  writeLine(`الإجمالي: ${invoice.grandTotal} ${company?.currencySymbol || ''}`, { fontSize: 14 });
  if (company?.invoiceFooter) {
    doc.moveDown();
    writeLine(company.invoiceFooter);
  }
  if (company?.termsAndConditions) writeLine(company.termsAndConditions);
  doc.end();
  return pdf;
};

const uploadPdf = async (phoneNumberId: string, fileName: string, content: Buffer) => {
  const config = getWhatsAppConfig();
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', 'application/pdf');
  form.append('file', new Blob([new Uint8Array(content)], { type: 'application/pdf' }), fileName);
  const response = await fetch(`https://graph.facebook.com/${config.graphVersion}/${phoneNumberId}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.accessToken}` },
    body: form,
  });
  const body = await response.json() as { id?: string; error?: { message?: string } };
  if (!response.ok || !body.id) throw new Error(body.error?.message || 'فشل رفع ملف الفاتورة إلى واتساب');
  return body.id;
};

const sendTemplate = async (
  recipient: string,
  templateName: string,
  bodyParameters: string[],
  documentId?: string,
) => {
  const config = getWhatsAppConfig();
  if (!config.graphVersion || !config.phoneNumberId || !config.accessToken) {
    return { sent: false, reason: 'not_configured' as const };
  }
  const components: Array<Record<string, unknown>> = [];
  if (documentId) {
    components.push({
      type: 'header',
      parameters: [{ type: 'document', document: { id: documentId, filename: 'invoice.pdf' } }],
    });
  }
  if (bodyParameters.length) {
    components.push({
      type: 'body',
      parameters: bodyParameters.map((text) => ({ type: 'text', text })),
    });
  }
  const response = await fetch(`https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: normalizePhone(recipient),
      type: 'template',
      template: {
        name: templateName,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'ar' },
        components,
      },
    }),
  });
  const body = await response.json() as { messages?: unknown[]; error?: { message?: string } };
  if (!response.ok || !body.messages?.length) throw new Error(body.error?.message || 'رفض واتساب إرسال الرسالة');
  return { sent: true as const };
};

export const sendInvoicePdf = async (
  type: 'sales' | 'supplier',
  invoice: any,
  company: any,
  recipient: { whatsappNumber?: string | null; whatsappOptIn?: boolean },
) => {
  if (!recipient.whatsappOptIn || !recipient.whatsappNumber) return { sent: false, reason: 'no_opt_in_or_number' as const };
  if (!isWhatsAppConfigured()) return { sent: false, reason: 'not_configured' as const };
  const pdf = await createInvoicePdf(type, invoice, company);
  const config = getWhatsAppConfig();
  const mediaId = await uploadPdf(
    config.phoneNumberId!,
    `${invoice.invoiceNumber}.pdf`,
    pdf,
  );
  const template = type === 'sales'
    ? process.env.WHATSAPP_SALES_INVOICE_TEMPLATE || 'sales_invoice_pdf_ar'
    : process.env.WHATSAPP_SUPPLIER_INVOICE_TEMPLATE || 'supplier_invoice_pdf_ar';
  const recipientName = type === 'sales' ? invoice.customer?.name : invoice.supplier?.name;
  return sendTemplate(recipient.whatsappNumber, template, [
    recipientName || '',
    invoice.invoiceNumber,
    String(invoice.grandTotal ?? ''),
  ], mediaId);
};

export const createPublicPurchaseRequestLink = async (requestId: string) => {
  const baseUrl = process.env.PUBLIC_APP_URL;
  if (!baseUrl) throw new Error('PUBLIC_APP_URL غير مضبوط لإنشاء رابط المورد');
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  await prisma.purchaseRequest.update({
    where: { id: requestId },
    data: {
      publicTokenHash: createHash('sha256').update(token).digest('hex'),
      publicTokenExpiresAt: expiresAt,
    },
  });
  return `${baseUrl.replace(/\/+$/, '')}/api/public/purchase-requests/${token}`;
};

export const sendShortageRequest = async (
  request: any,
  recipient: { whatsappNumber?: string | null; whatsappOptIn?: boolean },
) => {
  if (!recipient.whatsappOptIn || !recipient.whatsappNumber) return { sent: false, reason: 'no_opt_in_or_number' as const };
  if (!isWhatsAppConfigured()) return { sent: false, reason: 'not_configured' as const };
  const link = await createPublicPurchaseRequestLink(request.id);
  const config = getWhatsAppConfig();
  if (!config.graphVersion || !config.phoneNumberId || !config.accessToken) {
    return { sent: false, reason: 'not_configured' as const };
  }
  const phone = normalizePhone(recipient.whatsappNumber);
  const template = process.env.WHATSAPP_SHORTAGE_TEMPLATE || 'stock_shortage_request_ar';
  const response = await fetch(`https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: template,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'ar' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: request.supplier?.name || '' },
              { type: 'text', text: request.requestNumber },
              { type: 'text', text: String(request.items?.length || 0) },
            ],
          },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: link.split('/').pop() || '' }],
          },
        ],
      },
    }),
  });
  const body = await response.json() as { messages?: unknown[]; error?: { message?: string } };
  if (!response.ok || !body.messages?.length) throw new Error(body.error?.message || 'تعذر إرسال طلب النواقص عبر واتساب');
  return { sent: true as const };
};

export const findPublicPurchaseRequest = async (token: string) => {
  const hash = createHash('sha256').update(token).digest('hex');
  return prisma.purchaseRequest.findFirst({
    where: {
      publicTokenHash: hash,
      publicTokenExpiresAt: { gt: new Date() },
    },
    include: { supplier: true, items: { include: { item: true } }, warehouse: true },
  });
};

export const hashPublicToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const escapeWhatsAppHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character);
