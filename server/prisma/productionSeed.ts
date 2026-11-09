import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../generated/prisma';
import { isValidPassword } from '../src/lib/passwordPolicy';

const permissions = {
  admin: [
    'view_dashboard', 'manage_items', 'manage_item_prices', 'manage_purchases', 'manage_sales',
    'pos_access', 'manage_workshop', 'manage_jobcards', 'approve_estimate', 'issue_parts',
    'manage_inventory', 'manage_expenses', 'manage_employees', 'manage_payroll', 'manage_cashbox',
    'manage_banks', 'manage_accounting', 'view_reports', 'view_profits', 'manage_settings',
    'view_audit_logs',
  ],
  workshop_manager: [
    'view_dashboard', 'manage_workshop', 'manage_jobcards', 'approve_estimate', 'issue_parts',
    'manage_employees', 'view_reports',
  ],
  storekeeper: [
    'view_dashboard', 'manage_items', 'manage_purchases', 'issue_parts', 'manage_inventory',
    'view_reports',
  ],
  cashier: ['view_dashboard', 'manage_sales', 'pos_access', 'manage_cashbox', 'view_reports'],
  accountant: [
    'view_dashboard', 'manage_purchases', 'manage_sales', 'manage_expenses', 'manage_cashbox',
    'manage_banks', 'manage_accounting', 'view_reports', 'view_profits',
  ],
} satisfies Record<string, string[]>;

export const seedProduction = async (prisma: PrismaClient) => {
  const branch = await prisma.branch.upsert({
    where: { code: 'BR-01' },
    create: {
      code: 'BR-01',
      name: 'الفرع الرئيسي - القاهرة',
      address: 'القاهرة، جمهورية مصر العربية',
      isMain: true,
    },
    update: {},
  });

  for (const [name, rolePermissions] of Object.entries(permissions)) {
    await prisma.role.upsert({
      where: { name },
      create: {
        name,
        nameAr: name === 'admin' ? 'مدير النظام' : name,
        permissions: JSON.stringify(rolePermissions),
      },
      update: {},
    });
  }

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
  const configuredAdminPassword = process.env.INITIAL_ADMIN_PASSWORD || 'admin';
  if (!isValidPassword(configuredAdminPassword)) {
    throw new Error('INITIAL_ADMIN_PASSWORD must be 4-15 alphanumeric characters');
  }
  await prisma.user.upsert({
    where: { username: 'admin' },
    create: {
      username: 'admin',
      fullName: 'مدير النظام',
      passwordHash: await bcrypt.hash(
        configuredAdminPassword,
        12,
      ),
      mustChangePassword: true,
      roleId: adminRole.id,
      branchId: branch.id,
    },
    update: {},
  });

  if (!(await prisma.companySetting.findFirst())) {
    await prisma.companySetting.create({
      data: {
        name: 'المؤسسة',
        taxNumber: '',
        commercialRegister: '',
        address: '',
        city: '',
        country: 'مصر',
        phone: '',
        mobile: '',
        email: '',
        website: '',
      },
    });
  }

  await prisma.hrSetting.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });

  const units = [
    { name: 'حبة', symbol: 'حبة' },
    { name: 'طقم', symbol: 'طقم' },
    { name: 'كرتون', symbol: 'كرتون' },
    { name: 'لتر', symbol: 'لتر' },
    { name: 'جالون', symbol: 'جالون' },
    { name: 'متر', symbol: 'متر' },
  ];
  for (const unit of units) {
    await prisma.unit.upsert({ where: { name: unit.name }, create: unit, update: {} });
  }

  const categories = [
    'فلاتر وسوائل',
    'نظام الفرامل',
    'أجزاء المحرك',
    'كهرباء وإلكترونيات',
    'زيوت ومواد تشحيم',
    'إطارات وبطاريات',
    'نظام التكييف والتبريد',
    'نظام التعليق والمساعدات',
  ];
  for (const name of categories) {
    await prisma.itemCategory.upsert({ where: { name }, create: { name }, update: {} });
  }

  await prisma.warehouse.upsert({
    where: { code: 'WH-MAIN' },
    create: {
      code: 'WH-MAIN',
      name: 'المستودع الرئيسي',
      branchId: branch.id,
      active: true,
    },
    update: {},
  });
  await prisma.cashbox.upsert({
    where: { name: 'الخزينة الرئيسية' },
    create: { name: 'الخزينة الرئيسية', branchId: branch.id, active: true },
    update: {},
  });
};

const main = async () => {
  const prisma = new PrismaClient();
  try {
    await seedProduction(prisma);
  } finally {
    await prisma.$disconnect();
  }
};

if (require.main === module) {
  main().catch((error) => {
    console.error('Production starter database setup failed:', error);
    process.exitCode = 1;
  });
}
