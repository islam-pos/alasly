type OriginalInvoiceLine = {
  itemId: string | null;
  itemType: string;
  quantity: number;
  unitPrice: number;
  total: number;
  costPrice: number;
};

type ExistingReturnLine = {
  itemId: string;
  quantity: number;
};

type ReturnRequestLine = {
  itemId: string;
  quantity: number;
};

const roundMoney = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;

export const buildSalesReturnSnapshot = (input: {
  subtotal: number;
  discount: number;
  taxAmount: number;
  items: OriginalInvoiceLine[];
  existingReturns: ExistingReturnLine[];
  requestedItems: ReturnRequestLine[];
}) => {
  if (!Array.isArray(input.requestedItems) || input.requestedItems.length === 0) {
    throw new Error('حدد صنفاً واحداً على الأقل لإرجاعه');
  }
  const requestedByItem = new Map<string, number>();
  for (const request of input.requestedItems) {
    if (
      typeof request.itemId !== 'string' || !request.itemId
      || !Number.isSafeInteger(request.quantity) || request.quantity <= 0
    ) {
      throw new Error('الصنف أو كمية المرتجع غير صالحة');
    }
    requestedByItem.set(request.itemId, (requestedByItem.get(request.itemId) || 0) + request.quantity);
  }

  const existingByItem = new Map<string, number>();
  for (const returned of input.existingReturns) {
    existingByItem.set(returned.itemId, (existingByItem.get(returned.itemId) || 0) + returned.quantity);
  }
  const allocations: Array<{
    itemId: string;
    quantity: number;
    unitPrice: number;
    total: number;
    costPrice: number;
  }> = [];

  for (const [itemId, requestedQuantity] of requestedByItem) {
    const sourceLines = input.items.filter((line) => line.itemType === 'PART' && line.itemId === itemId);
    let alreadyReturned = existingByItem.get(itemId) || 0;
    let remainingToAllocate = requestedQuantity;
    for (const source of sourceLines) {
      const alreadyReturnedFromLine = Math.min(source.quantity, alreadyReturned);
      alreadyReturned -= alreadyReturnedFromLine;
      const availableFromLine = source.quantity - alreadyReturnedFromLine;
      const quantity = Math.min(availableFromLine, remainingToAllocate);
      if (quantity <= 0) continue;
      const total = roundMoney((source.total / source.quantity) * quantity);
      allocations.push({
        itemId,
        quantity,
        unitPrice: roundMoney(source.unitPrice),
        total,
        costPrice: source.costPrice,
      });
      remainingToAllocate -= quantity;
      if (remainingToAllocate === 0) break;
    }
    if (remainingToAllocate > 0) {
      throw new Error(`كمية المرتجع للصنف ${itemId} تتجاوز الكمية المتبقية في الفاتورة`);
    }
  }

  const subtotal = roundMoney(allocations.reduce((sum, item) => sum + item.total, 0));
  const invoiceSubtotal = input.subtotal;
  const discount = invoiceSubtotal > 0
    ? roundMoney(input.discount * subtotal / invoiceSubtotal)
    : 0;
  const taxAmount = invoiceSubtotal > 0
    ? roundMoney(input.taxAmount * subtotal / invoiceSubtotal)
    : 0;

  return {
    items: allocations,
    subtotal,
    discount,
    taxAmount,
    totalAmount: roundMoney(subtotal - discount + taxAmount),
  };
};
