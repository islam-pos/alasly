import type { Prisma } from '@prisma/client';

export const approveRepairEstimate = async (
  tx: Prisma.TransactionClient,
  repairOrderId: string,
  estimateId: string,
  approved: boolean,
  customerNotes?: string,
) => {
  const estimate = await tx.repairEstimate.findFirst({
    where: { id: estimateId, repairOrderId },
    include: { items: true },
  });
  if (!estimate) throw new Error('عرض السعر غير موجود في أمر الإصلاح المحدد');
  if (estimate.status !== 'PENDING') throw new Error('تم الرد على عرض السعر مسبقًا');

  const updatedEstimate = await tx.repairEstimate.update({
    where: { id: estimate.id },
    data: {
      isApprovedByCustomer: approved,
      approvedAt: approved ? new Date() : null,
      status: approved ? 'APPROVED' : 'REJECTED',
      customerNotes: customerNotes?.trim() || estimate.customerNotes,
      approvalTokenHash: null,
      approvalTokenExpiresAt: null,
    },
    include: { items: true },
  });

  if (approved) {
    for (const item of estimate.items) {
      if (item.type === 'PART' && item.itemId) {
        const catalogItem = await tx.item.findUnique({ where: { id: item.itemId } });
        await tx.repairPart.create({
          data: {
            repairOrderId,
            itemId: item.itemId,
            requestedQty: item.quantity,
            unitPrice: item.unitPrice,
            costPrice: catalogItem?.avgCost || 0,
            total: item.total,
          },
        });
      } else if (item.type === 'LABOR') {
        await tx.repairLabor.create({
          data: {
            repairOrderId,
            serviceName: item.description,
            hours: 1,
            rate: item.unitPrice,
            total: item.total,
            commissionRate: 10,
            commissionAmount: (item.total * 10) / 100,
          },
        });
      }
    }

    await tx.repairOrder.update({
      where: { id: repairOrderId },
      data: { status: 'APPROVED' },
    });
  }

  return updatedEstimate;
};
