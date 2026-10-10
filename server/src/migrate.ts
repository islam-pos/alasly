import { prisma } from './lib/prisma';

type Column = { name: string };

const ensureColumn = async (table: string, column: string, definition: string) => {
  const columns = await prisma.$queryRawUnsafe<Column[]>(`PRAGMA table_info("${table}")`);
  if (!columns.some((existing) => existing.name === column)) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
  }
};

const migrate = async () => {
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "NumberSequence" ("key" TEXT NOT NULL PRIMARY KEY, "lastValue" INTEGER NOT NULL DEFAULT 0)`;
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "NotificationIntegration" ("id" INTEGER NOT NULL PRIMARY KEY, "whatsapp" TEXT, "whatsappPhone" TEXT, "telegram" TEXT, "options" TEXT NOT NULL DEFAULT '{}', "shiftEndTime" TEXT NOT NULL DEFAULT '23:00', "timeZone" TEXT NOT NULL DEFAULT 'Africa/Cairo', "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`;
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "WhatsappAuthData" ("key" TEXT NOT NULL PRIMARY KEY, "encryptedValue" TEXT NOT NULL)`;
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "TelegramAuthSession" ("id" INTEGER NOT NULL PRIMARY KEY, "encryptedSession" TEXT)`;
  await prisma.$executeRaw`UPDATE "NotificationIntegration" SET "telegram" = NULL WHERE "telegram" IS NOT NULL`;
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "NotificationDelivery" ("id" TEXT NOT NULL PRIMARY KEY, "channel" TEXT NOT NULL, "eventKey" TEXT NOT NULL, "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`;
  await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "NotificationDelivery_channel_eventKey_key" ON "NotificationDelivery"("channel", "eventKey")`;
  await ensureColumn('CompanySetting', 'nameEn', 'TEXT');
  await ensureColumn('CompanySetting', 'supportTitle', "TEXT NOT NULL DEFAULT 'الدعم الفني والخدمات'");
  await ensureColumn('CompanySetting', 'supportDescription', "TEXT NOT NULL DEFAULT 'مركز صيانة متكامل 24/7 مع نظام فحص إلكتروني دقيق.'");
  await ensureColumn('CompanySetting', 'supportPhoneLabel', "TEXT NOT NULL DEFAULT 'الرقم الموحد'");
  await ensureColumn('CompanySetting', 'supportPhone', "TEXT NOT NULL DEFAULT '920000000'");
  await ensureColumn('Supplier', 'whatsappNumber', 'TEXT');
  await ensureColumn('Supplier', 'whatsappOptIn', 'BOOLEAN NOT NULL DEFAULT false');
  await ensureColumn('Customer', 'whatsappNumber', 'TEXT');
  await ensureColumn('Customer', 'whatsappOptIn', 'BOOLEAN NOT NULL DEFAULT false');
  await ensureColumn('PurchaseRequest', 'publicTokenHash', 'TEXT');
  await ensureColumn('PurchaseRequest', 'publicTokenExpiresAt', 'DATETIME');
  await ensureColumn('PurchaseRequest', 'supplierResponse', 'TEXT');
  await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseRequest_publicTokenHash_key" ON "PurchaseRequest"("publicTokenHash")`;
  await ensureColumn('CompanySetting', 'printSettings', "TEXT NOT NULL DEFAULT '{}'");
  await ensureColumn('User', 'permissionOverrides', 'TEXT');
  await ensureColumn('Employee', 'nationalId', 'TEXT');
  await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "Employee_nationalId_key" ON "Employee"("nationalId")`;
  await ensureColumn('NotificationIntegration', 'whatsappPhone', 'TEXT');
  await ensureColumn('Supplier', 'customerId', 'TEXT REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE');
  await ensureColumn('CashTransaction', 'customerId', 'TEXT REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE');
  await ensureColumn('CashTransaction', 'supplierId', 'TEXT REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE');
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "HrSetting" ("id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1, "standardMonthlyHours" REAL NOT NULL DEFAULT 208, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`;
  await ensureColumn('Attendance', 'workMinutes', 'INTEGER');
  await ensureColumn('Payroll', 'standardMonthlyHours', 'REAL');
  await ensureColumn('Payroll', 'attendedMinutes', 'INTEGER');
  const payrollDuplicates = await prisma.$queryRaw<{ duplicateCount: number }[]>`
    SELECT COUNT(*) AS duplicateCount FROM (
      SELECT "employeeId", "year", "month" FROM "Payroll"
      GROUP BY "employeeId", "year", "month" HAVING COUNT(*) > 1
    )
  `;
  if (Number(payrollDuplicates[0]?.duplicateCount || 0) === 0) {
    await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "Payroll_employeeId_year_month_key" ON "Payroll"("employeeId", "year", "month")`;
  } else {
    console.warn('HR migration: existing duplicate payrolls were preserved; unique payroll index was not created.');
  }
  const openShiftDuplicates = await prisma.$queryRaw<{ duplicateCount: number }[]>`
    SELECT COUNT(*) AS duplicateCount FROM (
      SELECT "employeeId" FROM "Attendance"
      WHERE "checkIn" IS NOT NULL AND "checkOut" IS NULL
      GROUP BY "employeeId" HAVING COUNT(*) > 1
    )
  `;
  if (Number(openShiftDuplicates[0]?.duplicateCount || 0) === 0) {
    await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "Attendance_one_open_shift_per_employee" ON "Attendance"("employeeId") WHERE "checkIn" IS NOT NULL AND "checkOut" IS NULL`;
  } else {
    console.warn('HR migration: existing duplicate open shifts were preserved; open-shift unique index was not created.');
  }
  await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "Supplier_customerId_key" ON "Supplier"("customerId")`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "CashTransaction_customerId_idx" ON "CashTransaction"("customerId")`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "CashTransaction_supplierId_idx" ON "CashTransaction"("supplierId")`;
};

migrate()
  .catch((error) => {
    console.error('Database schema update failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
