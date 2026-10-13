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
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "Account" ("id" TEXT NOT NULL PRIMARY KEY, "code" TEXT NOT NULL, "nameAr" TEXT NOT NULL, "nameEn" TEXT, "type" TEXT NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true, "isSystem" BOOLEAN NOT NULL DEFAULT false, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`;
  await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "Account_code_key" ON "Account"("code")`;
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "AccountingJournal" ("id" TEXT NOT NULL PRIMARY KEY, "code" TEXT NOT NULL, "nameAr" TEXT NOT NULL, "type" TEXT NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`;
  await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "AccountingJournal_code_key" ON "AccountingJournal"("code")`;
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "JournalEntry" ("id" TEXT NOT NULL PRIMARY KEY, "number" TEXT NOT NULL, "journalId" TEXT NOT NULL, "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "memo" TEXT NOT NULL, "referenceType" TEXT, "referenceId" TEXT, "status" TEXT NOT NULL DEFAULT 'POSTED', "branchId" TEXT, "createdById" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "JournalEntry_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "AccountingJournal"("id") ON DELETE RESTRICT ON UPDATE CASCADE)`;
  await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "JournalEntry_number_key" ON "JournalEntry"("number")`;
  await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "JournalEntry_referenceType_referenceId_key" ON "JournalEntry"("referenceType", "referenceId")`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "JournalEntry_date_idx" ON "JournalEntry"("date")`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "JournalEntry_branchId_date_idx" ON "JournalEntry"("branchId", "date")`;
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "JournalEntryLine" ("id" TEXT NOT NULL PRIMARY KEY, "entryId" TEXT NOT NULL, "accountId" TEXT NOT NULL, "label" TEXT, "debit" REAL NOT NULL DEFAULT 0, "credit" REAL NOT NULL DEFAULT 0, "partnerType" TEXT, "partnerId" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "JournalEntryLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "JournalEntryLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "JournalEntryLine_accountId_createdAt_idx" ON "JournalEntryLine"("accountId", "createdAt")`;
  const defaultAccounts = [
    ['acc-1000', '1000', 'الصندوق النقدي', 'Cash on Hand', 'ASSET'],
    ['acc-1010', '1010', 'متحصلات البطاقات', 'Card Clearing', 'ASSET'],
    ['acc-1020', '1020', 'الحسابات البنكية', 'Bank Accounts', 'ASSET'],
    ['acc-1100', '1100', 'العملاء المدينون', 'Accounts Receivable', 'ASSET'],
    ['acc-1200', '1200', 'المخزون', 'Inventory', 'ASSET'],
    ['acc-1300', '1300', 'ضريبة القيمة المضافة - مدخلات', 'Input VAT', 'ASSET'],
    ['acc-2000', '2000', 'الموردون الدائنون', 'Accounts Payable', 'LIABILITY'],
    ['acc-2100', '2100', 'ضريبة القيمة المضافة - مخرجات', 'Output VAT', 'LIABILITY'],
    ['acc-2990', '2990', 'حساب تسوية مؤقت', 'Suspense', 'LIABILITY'],
    ['acc-3000', '3000', 'رأس المال والأرصدة الافتتاحية', 'Equity and Opening Balances', 'EQUITY'],
    ['acc-4000', '4000', 'إيرادات بيع قطع الغيار', 'Parts Sales', 'INCOME'],
    ['acc-4100', '4100', 'إيرادات خدمات الصيانة', 'Maintenance Revenue', 'INCOME'],
    ['acc-4900', '4900', 'إيرادات أخرى', 'Other Income', 'INCOME'],
    ['acc-5000', '5000', 'تكلفة البضاعة المباعة', 'Cost of Goods Sold', 'EXPENSE'],
    ['acc-6000', '6000', 'مصروفات تشغيلية', 'Operating Expenses', 'EXPENSE'],
  ] as const;
  for (const [id, code, nameAr, nameEn, type] of defaultAccounts) {
    await prisma.$executeRaw`
      INSERT OR IGNORE INTO "Account" ("id", "code", "nameAr", "nameEn", "type", "isSystem", "createdAt", "updatedAt")
      VALUES (${id}, ${code}, ${nameAr}, ${nameEn}, ${type}, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
  }
  const defaultJournals = [
    ['journal-general', 'GEN', 'القيود العامة', 'GENERAL'],
    ['journal-sales', 'SAL', 'المبيعات', 'SALES'],
    ['journal-purchases', 'PUR', 'المشتريات', 'PURCHASES'],
    ['journal-cash', 'CSH', 'الخزينة', 'CASH'],
    ['journal-bank', 'BNK', 'البنوك', 'BANK'],
  ] as const;
  for (const [id, code, nameAr, type] of defaultJournals) {
    await prisma.$executeRaw`
      INSERT OR IGNORE INTO "AccountingJournal" ("id", "code", "nameAr", "type")
      VALUES (${id}, ${code}, ${nameAr}, ${type})
    `;
  }
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "NotificationIntegration" ("id" INTEGER NOT NULL PRIMARY KEY, "whatsapp" TEXT, "whatsappPhone" TEXT, "telegram" TEXT, "options" TEXT NOT NULL DEFAULT '{}', "shiftEndTime" TEXT NOT NULL DEFAULT '23:00', "timeZone" TEXT NOT NULL DEFAULT 'Africa/Cairo', "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`;
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "WhatsappAuthData" ("key" TEXT NOT NULL PRIMARY KEY, "encryptedValue" TEXT NOT NULL)`;
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "TelegramAuthSession" ("id" INTEGER NOT NULL PRIMARY KEY, "encryptedSession" TEXT)`;
  await prisma.$executeRaw`UPDATE "NotificationIntegration" SET "telegram" = NULL WHERE "telegram" IS NOT NULL`;
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "NotificationDelivery" ("id" TEXT NOT NULL PRIMARY KEY, "channel" TEXT NOT NULL, "eventKey" TEXT NOT NULL, "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`;
  await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "NotificationDelivery_channel_eventKey_key" ON "NotificationDelivery"("channel", "eventKey")`;
  await ensureColumn('CompanySetting', 'nameEn', 'TEXT');
  await prisma.$executeRaw`UPDATE "CompanySetting" SET "currency" = 'EGP', "currencySymbol" = 'ج.م'`;
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
