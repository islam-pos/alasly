import { existsSync } from 'fs';
import PDFDocument from 'pdfkit';
import { prisma } from '../lib/prisma';
import { getWhatsappQrStatus, sendWhatsappQrDocument } from './whatsappQr';
import { createEstimateApprovalToken, hashEstimateApprovalToken } from './estimateApprovalToken';

const createEstimatePdf = async (estimate: any) => {
  const fontPath = process.env.ARABIC_FONT_PATH || '/usr/share/fonts/ttf-dejavu/DejaVuSans.ttf';
  if (!existsSync(fontPath)) throw new Error('خط PDF العربي غير موجود على الخادم');

  const doc = new PDFDocument({ size: 'A4', margin: 42 });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const writeLine = (text: string, options: Record<string, unknown> = {}) => {
    doc.text(text, { align: 'right', features: ['rtla', 'liga'], ...options });
  };

  doc.font(fontPath);
  writeLine('مركز المحترف AutoCare', { fontSize: 18 });
  writeLine(`أمر شغل رقم: ${estimate.repairOrder.orderNumber}`);
  writeLine(`عرض سعر رقم: ${estimate.estimateNumber}`);
  writeLine(`التاريخ: ${new Date(estimate.date).toLocaleDateString('ar-EG')}`);
  writeLine(`العميل: ${estimate.repairOrder.customer.name}`);
  writeLine(`السيارة: ${estimate.repairOrder.vehicle.make} ${estimate.repairOrder.vehicle.model} ${estimate.repairOrder.vehicle.year}`);
  writeLine(`رقم اللوحة: ${estimate.repairOrder.vehicle.plateNumber}`);
  writeLine(`قراءة العداد: ${estimate.repairOrder.currentOdometer.toLocaleString('ar-EG')} كم`);
  writeLine(`شكوى العميل: ${estimate.repairOrder.customerComplaint}`);
  doc.moveDown();
  writeLine('الأعمال والقطع المقترحة', { fontSize: 14 });
  for (const item of estimate.items) {
    writeLine(`${item.type === 'PART' ? 'قطعة غيار' : 'خدمة'}: ${item.description} — ${item.quantity} × ${item.unitPrice} = ${item.total} ج.م`);
  }
  doc.moveDown();
  writeLine(`إجمالي القطع: ${estimate.subtotalParts} ج.م`);
  writeLine(`إجمالي المصنعية: ${estimate.subtotalLabor} ج.م`);
  if (estimate.discount > 0) writeLine(`الخصم: ${estimate.discount} ج.م`);
  writeLine(`الإجمالي المطلوب: ${estimate.grandTotal} ج.م`, { fontSize: 15 });
  if (estimate.customerNotes) writeLine(`ملاحظات: ${estimate.customerNotes}`);
  writeLine('الموافقة على العرض لا تعني بدء الإصلاح إلا بعد تسجيل الموافقة في النظام.');
  doc.end();
  return result;
};

export const sendEstimateApprovalRequest = async (estimateId: string) => {
  const estimate = await prisma.repairEstimate.findUnique({
    where: { id: estimateId },
    include: {
      items: true,
      repairOrder: { include: { customer: true, vehicle: true } },
    },
  });
  if (!estimate || estimate.status !== 'PENDING' || estimate.isApprovedByCustomer) {
    throw new Error('عرض السعر غير موجود أو لم يعد بانتظار الموافقة');
  }

  const customer = estimate.repairOrder.customer;
  if (!customer.whatsappOptIn || !customer.whatsappNumber) {
    return { sent: false as const, reason: 'no_opt_in_or_number' as const };
  }
  if (!(await getWhatsappQrStatus()).connected) {
    return { sent: false as const, reason: 'whatsapp_not_connected' as const };
  }

  const baseUrl = process.env.PUBLIC_APP_URL;
  if (!baseUrl) throw new Error('PUBLIC_APP_URL غير مضبوط لإرسال رابط الموافقة');

  const token = createEstimateApprovalToken();
  const tokenHash = hashEstimateApprovalToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const approvalUrl = new URL(`/api/public/estimate-approvals/${token}`, baseUrl).toString();
  await prisma.repairEstimate.update({
    where: { id: estimate.id },
    data: {
      approvalTokenHash: tokenHash,
      approvalTokenExpiresAt: expiresAt,
      approvalRequestedAt: new Date(),
    },
  });

  try {
    const pdf = await createEstimatePdf(estimate);
    await sendWhatsappQrDocument(
      customer.whatsappNumber,
      `${estimate.estimateNumber}.pdf`,
      pdf,
      `عرض السعر ${estimate.estimateNumber} لأمر الشغل ${estimate.repairOrder.orderNumber}. للموافقة أو الرفض افتح الرابط: ${approvalUrl}`,
    );
    return { sent: true as const, expiresAt };
  } catch (error) {
    await prisma.repairEstimate.updateMany({
      where: { id: estimate.id, approvalTokenHash: tokenHash },
      data: { approvalTokenHash: null, approvalTokenExpiresAt: null, approvalRequestedAt: null },
    });
    throw error;
  }
};