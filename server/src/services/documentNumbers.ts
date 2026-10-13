import type { Prisma, PrismaClient } from '@prisma/client';

type InvoiceSeries = 'POS' | 'MINV' | 'PINV' | 'QUO';

let invoiceTransactionQueue: Promise<void> = Promise.resolve();

export const withInvoiceTransaction = async <T>(
  prisma: PrismaClient,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
) => {
  const previous = invoiceTransactionQueue;
  let release: () => void = () => {};
  invoiceTransactionQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await prisma.$transaction(operation);
  } finally {
    release();
  }
};

export const nextInvoiceNumber = async (
  tx: Prisma.TransactionClient,
  series: InvoiceSeries,
  year = new Date().getFullYear(),
) => {
  const key = `${series}-${year}`;
  const prefix = `${series}-${year}-`;
  const suffixStart = prefix.length + 1;
  const pattern = `${prefix}%`;

  if (series === 'PINV') {
    await tx.$executeRaw`
      INSERT INTO "NumberSequence" ("key", "lastValue")
      VALUES (
        ${key},
        COALESCE((
          SELECT MAX(CAST(substr("invoiceNumber", ${suffixStart}) AS INTEGER))
          FROM "PurchaseInvoice"
          WHERE "invoiceNumber" LIKE ${pattern}
        ), 0) + 1
      )
      ON CONFLICT("key") DO UPDATE SET "lastValue" = "NumberSequence"."lastValue" + 1
    `;
  } else {
    await tx.$executeRaw`
      INSERT INTO "NumberSequence" ("key", "lastValue")
      VALUES (
        ${key},
        COALESCE((
          SELECT MAX(CAST(substr("invoiceNumber", ${suffixStart}) AS INTEGER))
          FROM "SalesInvoice"
          WHERE "invoiceNumber" LIKE ${pattern}
        ), 0) + 1
      )
      ON CONFLICT("key") DO UPDATE SET "lastValue" = "NumberSequence"."lastValue" + 1
    `;
  }

  const sequence = await tx.numberSequence.findUniqueOrThrow({ where: { key } });
  return `${prefix}${String(sequence.lastValue).padStart(series === 'PINV' ? 3 : 4, '0')}`;
};
