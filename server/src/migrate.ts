import 'dotenv/config';
import { prisma } from './lib/prisma';
import { migrateEgyptianLocationDefaults } from './migrations/egyptianLocationDefaults';

type Column = { name: string };

const ensureColumn = async (table: string, column: string, definition: string) => {
  const columns = await prisma.$queryRawUnsafe<Column[]>(`PRAGMA table_info("${table}")`);
  if (!columns.some((existing) => existing.name === column)) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
  }
};

const migrateLegacySchema = async () => {
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
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "NotificationDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channel" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "message" TEXT,
    "recipient" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`;
  await ensureColumn('NotificationDelivery', 'message', 'TEXT');
  await ensureColumn('NotificationDelivery', 'recipient', 'TEXT');
  await ensureColumn('NotificationDelivery', 'status', "TEXT NOT NULL DEFAULT 'SENT'");
  await ensureColumn('NotificationDelivery', 'attemptCount', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('NotificationDelivery', 'nextAttemptAt', "DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00'");
  await ensureColumn('NotificationDelivery', 'lastError', 'TEXT');
  await ensureColumn('NotificationDelivery', 'updatedAt', "DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00'");
  await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "NotificationDelivery_channel_eventKey_key" ON "NotificationDelivery"("channel", "eventKey")`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "NotificationDelivery_status_nextAttemptAt_idx" ON "NotificationDelivery"("status", "nextAttemptAt")`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "NotificationDelivery_status_updatedAt_idx" ON "NotificationDelivery"("status", "updatedAt")`;
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "MaintenanceReminder" ("id" TEXT NOT NULL PRIMARY KEY, "vehicleId" TEXT NOT NULL, "serviceName" TEXT NOT NULL, "dueDate" DATETIME, "dueOdometer" INTEGER, "status" TEXT NOT NULL DEFAULT 'PENDING', "notes" TEXT, "sentAt" DATETIME, "lastAttemptAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "MaintenanceReminder_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "MaintenanceReminder_status_dueDate_idx" ON "MaintenanceReminder"("status", "dueDate")`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "MaintenanceReminder_vehicleId_status_idx" ON "MaintenanceReminder"("vehicleId", "status")`;
  await ensureColumn('CompanySetting', 'nameEn', 'TEXT');
  await ensureColumn('SalesReturn', 'discount', 'REAL NOT NULL DEFAULT 0');
  await ensureColumn('SalesReturn', 'profitBasis', "TEXT NOT NULL DEFAULT 'LEGACY_ESTIMATE'");
  await ensureColumn('SalesReturnItem', 'costPrice', 'REAL NOT NULL DEFAULT 0');
  await ensureColumn('SalesReturnItem', 'costPriceIsEstimated', 'BOOLEAN NOT NULL DEFAULT true');
  await prisma.$executeRaw`
    UPDATE "SalesReturnItem"
    SET "costPrice" = COALESCE((
      SELECT "StockTransaction"."unitCost"
      FROM "StockTransaction"
      WHERE "StockTransaction"."referenceType" = 'SalesReturn'
        AND "StockTransaction"."referenceId" = "SalesReturnItem"."returnId"
        AND "StockTransaction"."itemId" = "SalesReturnItem"."itemId"
      ORDER BY "StockTransaction"."createdAt" ASC
      LIMIT 1
    ), 0)
    WHERE "costPriceIsEstimated" = true
  `;
  await prisma.$executeRaw`UPDATE "CompanySetting" SET "taxRate" = 0 WHERE "taxRate" <> 0`;
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
  await prisma.$executeRaw`UPDATE "CompanySetting" SET "currency" = 'EGP', "currencySymbol" = 'ج.م'`;
  await prisma.$executeRaw`UPDATE "Bank" SET "currency" = 'EGP'`;
  await ensureColumn('User', 'permissionOverrides', 'TEXT');
  await ensureColumn('SalesInvoice', 'quotationId', 'TEXT');
  await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "SalesInvoice_quotationId_key" ON "SalesInvoice"("quotationId")`;
  await ensureColumn('Employee', 'nationalId', 'TEXT');
  await ensureColumn('Item', 'fitment', 'TEXT');
  await ensureColumn('Item', 'leadTimeDays', 'INTEGER NOT NULL DEFAULT 7');
  await ensureColumn('RepairEstimate', 'approvalMethod', 'TEXT');
  await ensureColumn('RepairEstimate', 'approvalRequestedAt', 'DATETIME');
  await ensureColumn('RepairEstimate', 'approvalTokenHash', 'TEXT');
  await ensureColumn('RepairEstimate', 'approvalTokenExpiresAt', 'DATETIME');
  await ensureColumn('RepairEstimate', 'decisionByUserId', 'TEXT');
  await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "RepairEstimate_approvalTokenHash_key" ON "RepairEstimate"("approvalTokenHash")`;
  await prisma.$executeRaw`UPDATE "Item" SET "taxRate" = 0 WHERE "taxRate" <> 0`;
  await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "Employee_nationalId_key" ON "Employee"("nationalId")`;
  await ensureColumn('NotificationIntegration', 'whatsappPhone', 'TEXT');
  await ensureColumn('Supplier', 'customerId', 'TEXT REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE');
  await ensureColumn('CashTransaction', 'customerId', 'TEXT REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE');
  await ensureColumn('CashTransaction', 'supplierId', 'TEXT REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE');
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "HrSetting" ("id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1, "standardMonthlyHours" REAL NOT NULL DEFAULT 208, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`;
  await ensureColumn('Attendance', 'workMinutes', 'INTEGER');
  await ensureColumn('Payroll', 'standardMonthlyHours', 'REAL');
  await ensureColumn('Payroll', 'attendedMinutes', 'INTEGER');
  await ensureColumn('RepairOrder', 'deliveryOdometer', 'INTEGER');
  await ensureColumn('RepairOrder', 'deliveredAt', 'DATETIME');
  await ensureColumn('RepairOrder', 'handoverCustomerName', 'TEXT');
  await ensureColumn('RepairOrder', 'handoverSignatureData', 'TEXT');
  await ensureColumn('RepairOrder', 'handoverChecklist', 'TEXT');
  await ensureColumn('RepairOrder', 'warrantyMonths', 'INTEGER NOT NULL DEFAULT 1');
  await ensureColumn('RepairOrder', 'warrantyTerms', 'TEXT');
  await ensureColumn('RepairLabor', 'trackedMinutes', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('RepairLabor', 'timerStartedAt', 'DATETIME');
  await ensureColumn('RepairPart', 'requestedById', 'TEXT');
  await ensureColumn('BankTransaction', 'reconciledAt', 'DATETIME');
  await ensureColumn('BankTransaction', 'reconciledById', 'TEXT');
  await ensureColumn('BankTransaction', 'statementReference', 'TEXT');
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "BankReconciliation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bankId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "statementStart" DATETIME NOT NULL,
    "statementEnd" DATETIME NOT NULL,
    "importedById" TEXT,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankReconciliation_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`;
  await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "BankReconciliation_bankId_contentHash_key" ON "BankReconciliation"("bankId", "contentHash")`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "BankReconciliation_bankId_createdAt_idx" ON "BankReconciliation"("bankId", "createdAt")`;
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "BankStatementLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reconciliationId" TEXT NOT NULL,
    "transactionDate" DATETIME NOT NULL,
    "amount" REAL NOT NULL,
    "direction" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "description" TEXT,
    "matchedTransactionId" TEXT,
    "matchedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankStatementLine_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "BankReconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BankStatementLine_matchedTransactionId_fkey" FOREIGN KEY ("matchedTransactionId") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`;
  await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "BankStatementLine_matchedTransactionId_key" ON "BankStatementLine"("matchedTransactionId")`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "BankStatementLine_reconciliationId_transactionDate_idx" ON "BankStatementLine"("reconciliationId", "transactionDate")`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "BankTransaction_bankId_reconciledAt_date_idx" ON "BankTransaction"("bankId", "reconciledAt", "date")`;
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "RepairAttachment" ("id" TEXT NOT NULL PRIMARY KEY, "repairOrderId" TEXT NOT NULL, "storageName" TEXT NOT NULL UNIQUE, "fileName" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "byteSize" INTEGER NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY ("repairOrderId") REFERENCES "RepairOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "RepairAttachment_repairOrderId_createdAt_idx" ON "RepairAttachment"("repairOrderId", "createdAt")`;
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "InvoicePayment" ("id" TEXT NOT NULL PRIMARY KEY, "invoiceId" TEXT NOT NULL, "amount" REAL NOT NULL, "paymentMethod" TEXT NOT NULL, "cashboxId" TEXT, "notes" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE, FOREIGN KEY ("cashboxId") REFERENCES "Cashbox"("id") ON DELETE SET NULL ON UPDATE CASCADE)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "InvoicePayment_invoiceId_createdAt_idx" ON "InvoicePayment"("invoiceId", "createdAt")`;
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
  await ensureColumn('User', 'failedLoginAttempts', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('User', 'loginLockedUntil', 'DATETIME');
  await ensureColumn('User', 'mfaSecret', 'TEXT');
  await ensureColumn('User', 'mfaEnabled', 'BOOLEAN NOT NULL DEFAULT false');
  await ensureColumn('User', 'mustChangePassword', 'BOOLEAN NOT NULL DEFAULT false');
  await ensureColumn('PurchaseInvoice', 'approvedById', 'TEXT');
  await ensureColumn('PurchaseInvoice', 'approvedAt', 'DATETIME');
  await ensureColumn('InventoryCount', 'reviewedById', 'TEXT');
  await ensureColumn('InventoryCount', 'reviewedAt', 'DATETIME');
  await ensureColumn('InventoryCount', 'rejectionReason', 'TEXT');
  await ensureColumn('InvoicePayment', 'cashTransactionId', 'TEXT');
  await ensureColumn('Attendance', 'checkInPhotoUrl', 'TEXT');
  await ensureColumn('Attendance', 'checkOutPhotoUrl', 'TEXT');
  await ensureColumn('Attendance', 'checkInDevice', 'TEXT');
  await ensureColumn('Attendance', 'checkOutDevice', 'TEXT');
  await ensureColumn('PurchaseRequest', 'requestType', "TEXT NOT NULL DEFAULT 'SHORTAGE'");
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "Appointment" ("id" TEXT NOT NULL PRIMARY KEY, "appointmentNumber" TEXT NOT NULL UNIQUE, "customerId" TEXT NOT NULL, "vehicleId" TEXT NOT NULL, "branchId" TEXT, "startsAt" DATETIME NOT NULL, "endsAt" DATETIME NOT NULL, "serviceName" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'SCHEDULED', "notes" TEXT, "repairOrderId" TEXT, "reminderSentAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE, FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE, FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Appointment_startsAt_status_idx" ON "Appointment"("startsAt", "status")`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Appointment_customerId_startsAt_idx" ON "Appointment"("customerId", "startsAt")`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Appointment_vehicleId_startsAt_idx" ON "Appointment"("vehicleId", "startsAt")`;
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "Lead" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "phone" TEXT NOT NULL, "source" TEXT NOT NULL DEFAULT 'MANUAL', "status" TEXT NOT NULL DEFAULT 'NEW', "interest" TEXT, "notes" TEXT, "assignedToId" TEXT, "nextFollowUp" DATETIME, "convertedCustomerId" TEXT, "convertedVehicleId" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Lead_status_nextFollowUp_idx" ON "Lead"("status", "nextFollowUp")`;
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "Campaign" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "channel" TEXT NOT NULL DEFAULT 'WHATSAPP', "segment" TEXT NOT NULL DEFAULT 'ALL', "message" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'DRAFT', "scheduledAt" DATETIME, "sentCount" INTEGER NOT NULL DEFAULT 0, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Campaign_status_scheduledAt_idx" ON "Campaign"("status", "scheduledAt")`;
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "FixedAsset" ("id" TEXT NOT NULL PRIMARY KEY, "assetCode" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL, "category" TEXT NOT NULL, "purchaseDate" DATETIME NOT NULL, "purchaseCost" REAL NOT NULL, "salvageValue" REAL NOT NULL DEFAULT 0, "usefulLifeMonths" INTEGER NOT NULL, "location" TEXT, "serialNumber" TEXT, "status" TEXT NOT NULL DEFAULT 'ACTIVE', "accumulatedDepreciation" REAL NOT NULL DEFAULT 0, "lastDepreciationAt" DATETIME, "notes" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "FixedAsset_status_category_idx" ON "FixedAsset"("status", "category")`;
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "TaxSetting" ("id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1, "enabled" BOOLEAN NOT NULL DEFAULT false, "provider" TEXT NOT NULL DEFAULT 'ETA', "environment" TEXT NOT NULL DEFAULT 'SANDBOX', "taxpayerRin" TEXT, "activityCode" TEXT, "branchId" TEXT, "clientId" TEXT, "clientSecret" TEXT, "certificate" TEXT, "privateKey" TEXT, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`;
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "EtaDocument" ("id" TEXT NOT NULL PRIMARY KEY, "documentType" TEXT NOT NULL, "documentId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "submissionUuid" TEXT, "responseStatus" TEXT, "responsePayload" TEXT, "errorMessage" TEXT, "submittedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "EtaDocument_documentType_documentId_idx" ON "EtaDocument"("documentType", "documentId")`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "EtaDocument_status_createdAt_idx" ON "EtaDocument"("status", "createdAt")`;
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "CustomerPortalLink" ("id" TEXT NOT NULL PRIMARY KEY, "customerId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL UNIQUE, "expiresAt" DATETIME NOT NULL, "lastUsedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "CustomerPortalLink_customerId_expiresAt_idx" ON "CustomerPortalLink"("customerId", "expiresAt")`;
};

const migrations: { id: string; apply: () => Promise<void> }[] = [
  { id: '0001-legacy-schema-sync', apply: migrateLegacySchema },
  { id: '0002-egyptian-location-defaults', apply: migrateEgyptianLocationDefaults },
  {
    id: '0003-temporary-admin-password',
    apply: async () => {
      await ensureColumn('User', 'mustChangePassword', 'BOOLEAN NOT NULL DEFAULT false');
    },
  },
  {
    id: '0004-offline-mutation-receipts',
    apply: async () => {
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "OfflineMutationReceipt" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL,
          "key" TEXT NOT NULL,
          "requestHash" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'PROCESSING',
          "responseStatus" INTEGER,
          "responseBody" TEXT,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `;
      await prisma.$executeRaw`
        CREATE UNIQUE INDEX IF NOT EXISTS "OfflineMutationReceipt_userId_key_key"
        ON "OfflineMutationReceipt"("userId", "key")
      `;
      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "OfflineMutationReceipt_createdAt_idx"
        ON "OfflineMutationReceipt"("createdAt")
      `;
    },
  },
  {
    id: '0005-password-reset-approval',
    apply: async () => {
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "PasswordResetRequest" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'PENDING',
          "approvalTokenHash" TEXT,
          "resetTokenHash" TEXT,
          "expiresAt" DATETIME NOT NULL,
          "resetExpiresAt" DATETIME,
          "approvedAt" DATETIME,
          "usedAt" DATETIME,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "PasswordResetRequest_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `;
      await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetRequest_approvalTokenHash_key" ON "PasswordResetRequest"("approvalTokenHash")`;
      await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetRequest_resetTokenHash_key" ON "PasswordResetRequest"("resetTokenHash")`;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "PasswordResetRequest_userId_status_idx" ON "PasswordResetRequest"("userId", "status")`;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "PasswordResetRequest_status_expiresAt_idx" ON "PasswordResetRequest"("status", "expiresAt")`;
    },
  },
];

const runMigrations = async () => {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "_AppMigration" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;

  for (const migration of migrations) {
    const applied = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "_AppMigration" WHERE "id" = ${migration.id} LIMIT 1
    `;
    if (applied.length > 0) continue;

    console.log(`Applying database migration ${migration.id}`);
    await migration.apply();
    await prisma.$executeRaw`
      INSERT INTO "_AppMigration" ("id", "appliedAt") VALUES (${migration.id}, CURRENT_TIMESTAMP)
    `;
  }
};

runMigrations()
  .catch((error) => {
    console.error('Database migration failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
