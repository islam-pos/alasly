import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting AutoCare ERP Database Seeding...');

  // 0. Clean all tables in reverse dependency order
  await prisma.auditLog.deleteMany({});
  await prisma.salesInvoiceItem.deleteMany({});
  await prisma.salesReturnItem.deleteMany({});
  await prisma.salesReturn.deleteMany({});
  await prisma.salesInvoice.deleteMany({});
  await prisma.repairLabor.deleteMany({});
  await prisma.repairPart.deleteMany({});
  await prisma.repairEstimateItem.deleteMany({});
  await prisma.repairEstimate.deleteMany({});
  await prisma.repairInspection.deleteMany({});
  await prisma.commission.deleteMany({});
  await prisma.repairOrder.deleteMany({});
  await prisma.purchaseInvoiceItem.deleteMany({});
  await prisma.purchaseReturnItem.deleteMany({});
  await prisma.purchaseReturn.deleteMany({});
  await prisma.purchaseInvoice.deleteMany({});
  await prisma.purchaseRequestItem.deleteMany({});
  await prisma.purchaseRequest.deleteMany({});
  await prisma.stockTransaction.deleteMany({});
  await prisma.stockBalance.deleteMany({});
  await prisma.warehouseTransferItem.deleteMany({});
  await prisma.warehouseTransfer.deleteMany({});
  await prisma.inventoryCountItem.deleteMany({});
  await prisma.inventoryAdjustment.deleteMany({});
  await prisma.inventoryCount.deleteMany({});
  await prisma.item.deleteMany({});
  await prisma.warehouseLocation.deleteMany({});
  await prisma.vehicle.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.supplier.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.attendance.deleteMany({});
  await prisma.payroll.deleteMany({});
  await prisma.employee.deleteMany({});
  await prisma.jobTitle.deleteMany({});
  await prisma.role.deleteMany({});
  await prisma.expense.deleteMany({});
  await prisma.expenseCategory.deleteMany({});
  await prisma.revenue.deleteMany({});
  await prisma.revenueCategory.deleteMany({});
  await prisma.cashShift.deleteMany({});
  await prisma.cashTransaction.deleteMany({});
  await prisma.cashbox.deleteMany({});
  await prisma.bankTransaction.deleteMany({});
  await prisma.bank.deleteMany({});
  await prisma.warehouse.deleteMany({});
  await prisma.branch.deleteMany({});
  await prisma.unit.deleteMany({});
  await prisma.itemCategory.deleteMany({});
  await prisma.companySetting.deleteMany({});

  // 1. Company Settings
  const company = await prisma.companySetting.create({
    data: {
      name: 'مركز المحترف لصيانة السيارات وقطع الغيار',
      taxNumber: '310245897100003',
      commercialRegister: '1010892341',
      address: 'القاهرة، جمهورية مصر العربية',
      city: 'القاهرة',
      country: 'جمهورية مصر العربية',
      phone: '0112345678',
      mobile: '0501234567',
      email: 'info@autocare-center.com',
      website: 'www.autocare-center.com',
      currency: 'SAR',
      currencySymbol: 'ر.س',
      taxRate: 15.0,
      invoiceHeader: 'أهلاً بكم في مركز المحترف لخدمات وصيانة السيارات المتكاملة',
      invoiceFooter: 'ضمان قطع الغيار 30 يوماً واليد العاملة 14 يوماً من تاريخ الفاتورة',
      termsAndConditions: 'تطبق الشروط والأحكام. الفاتورة الضريبية الصادرة معتمدة من هيئة الزكاة والضريبة والجمارك.',
    },
  });

  // 2. Branches
  await prisma.branch.deleteMany({});
  const branchRiyadh = await prisma.branch.create({
    data: {
      code: 'BR-01',
      name: 'الفرع الرئيسي - القاهرة',
      address: 'القاهرة، جمهورية مصر العربية',
      phone: '0112345678',
      isMain: true,
      active: true,
    },
  });

  const branchJeddah = await prisma.branch.create({
    data: {
      code: 'BR-02',
      name: 'فرع الصيانة السريعة - الإسكندرية',
      address: 'الإسكندرية، جمهورية مصر العربية',
      phone: '0129876543',
      isMain: false,
      active: true,
    },
  });

  // 3. Roles & Permissions
  await prisma.role.deleteMany({});
  const allPermissions = JSON.stringify([
    'view_dashboard', 'manage_items', 'manage_item_prices', 'manage_purchases', 'manage_sales',
    'pos_access', 'manage_workshop', 'manage_jobcards', 'approve_estimate',
    'issue_parts', 'manage_inventory', 'manage_expenses', 'manage_employees',
    'manage_payroll', 'manage_cashbox', 'manage_banks', 'view_reports',
    'view_profits', 'manage_settings', 'view_audit_logs'
  ]);

  const roleAdmin = await prisma.role.create({
    data: {
      name: 'admin',
      nameAr: 'مدير النظام / المدير العام',
      description: 'كامل الصلاحيات على كافة أقسام النظام والفروع',
      permissions: allPermissions,
    },
  });

  const roleWorkshopMgr = await prisma.role.create({
    data: {
      name: 'workshop_manager',
      nameAr: 'مدير الورشة',
      description: 'إدارة أوامر الإصلاح، الفحص، تعيين الفنيين، واعتماد العروض',
      permissions: JSON.stringify([
        'view_dashboard', 'manage_workshop', 'manage_jobcards', 'approve_estimate',
        'issue_parts', 'manage_employees', 'view_reports'
      ]),
    },
  });

  const roleStorekeeper = await prisma.role.create({
    data: {
      name: 'storekeeper',
      nameAr: 'أمين المستودع',
      description: 'إدارة المخازن، صرف القطع، استلام المشتريات والجرد',
      permissions: JSON.stringify([
        'view_dashboard', 'manage_items', 'manage_purchases', 'issue_parts',
        'manage_inventory', 'view_reports'
      ]),
    },
  });

  const roleCashier = await prisma.role.create({
    data: {
      name: 'cashier',
      nameAr: 'كاشير ومسؤول مبيعات',
      description: 'شاشة نقاط البيع السريعة، الفواتير، سندات القبض وإغلاق الوردية',
      permissions: JSON.stringify([
        'view_dashboard', 'manage_sales', 'pos_access', 'manage_cashbox', 'view_reports'
      ]),
    },
  });

  const roleAccountant = await prisma.role.create({
    data: {
      name: 'accountant',
      nameAr: 'محاسب مالي',
      description: 'إدارة الحسابات، الخزينة، البنوك، المصروفات، الأرباح والتقارير المالية',
      permissions: JSON.stringify([
        'view_dashboard', 'manage_purchases', 'manage_sales', 'manage_expenses',
        'manage_cashbox', 'manage_banks', 'view_reports', 'view_profits'
      ]),
    },
  });

  // 4. Job Titles
  await prisma.jobTitle.deleteMany({});
  const jobsData = [
    { name: 'مدير الورشة', description: 'الإشراف الفني وإدارة سير العمل' },
    { name: 'مهندس استقبال / مستشار خدمة', description: 'استقبال العملاء وتشخيص المشاكل وفتح أمر الإصلاح' },
    { name: 'فني ميكانيكا سيارات', description: 'فحص وإصلاح المحركات والقير ونظام التعليق' },
    { name: 'فني كهرباء وتشخيص إلكتروني', description: 'فحص كمبيوتر، برمجة، وصيانة الدوائر الكهربائية' },
    { name: 'فني تكييف وتبريد', description: 'صيانة مكيفات السيارات، غاز الفريون، والرديترات' },
    { name: 'فني فرامل وسفايف', description: 'خرط الهوبات واستبدال الفحمات ونظام ABS' },
    { name: 'أمين مستودع قطع غيار', description: 'إدارة المخزون وصرف القطع واستلام الشحنات' },
    { name: 'كاشير مبيعات', description: 'إصدار فواتير البيع وتحصيل المبالغ' },
    { name: 'محاسب عام', description: 'القيود المالية، تسوية البنوك والمصروفات' },
  ];

  const jobsMap: Record<string, string> = {};
  for (const j of jobsData) {
    const job = await prisma.jobTitle.create({ data: j });
    jobsMap[j.name] = job.id;
  }

  // 5. Employees (10 Employees)
  await prisma.employee.deleteMany({});
  const employeesData = [
    { code: 'EMP-101', name: 'م. أحمد منصور الشمري', phone: '0501112233', email: 'ahmed.m@autocare.com', job: 'مدير الورشة', dept: 'الإدارة الفنية', salary: 12000, comType: 'PERCENTAGE', comRate: 2 },
    { code: 'EMP-102', name: 'م. خالد عبدالرحمن العتيبي', phone: '0502223344', email: 'khaled.o@autocare.com', job: 'مهندس استقبال / مستشار خدمة', dept: 'الاستقبال', salary: 8500, comType: 'PERCENTAGE', comRate: 1.5 },
    { code: 'EMP-103', name: 'طارق صلاح الزهراني', phone: '0503334455', email: 'tariq.z@autocare.com', job: 'فني ميكانيكا سيارات', dept: 'الورشة', salary: 6000, comType: 'PERCENTAGE', comRate: 10 },
    { code: 'EMP-104', name: 'محمود كمال السعيد', phone: '0504445566', email: 'mahmoud.k@autocare.com', job: 'فني ميكانيكا سيارات', dept: 'الورشة', salary: 5800, comType: 'PERCENTAGE', comRate: 10 },
    { code: 'EMP-105', name: 'عصام الدين فؤاد', phone: '0505556677', email: 'issam.f@autocare.com', job: 'فني كهرباء وتشخيص إلكتروني', dept: 'الورشة', salary: 6500, comType: 'PERCENTAGE', comRate: 12 },
    { code: 'EMP-106', name: 'سالم مبارك الدوسري', phone: '0506667788', email: 'salem.d@autocare.com', job: 'فني تكييف وتبريد', dept: 'الورشة', salary: 5500, comType: 'PERCENTAGE', comRate: 10 },
    { code: 'EMP-107', name: 'يوسف جمال الدين', phone: '0507778899', email: 'youssef.j@autocare.com', job: 'فني فرامل وسفايف', dept: 'الورشة', salary: 5200, comType: 'PERCENTAGE', comRate: 8 },
    { code: 'EMP-108', name: 'عبدالله ناصر القحطاني', phone: '0508889900', email: 'abdullah.q@autocare.com', job: 'أمين مستودع قطع غيار', dept: 'المستودعات', salary: 6000, comType: 'PERCENTAGE', comRate: 0 },
    { code: 'EMP-109', name: 'فهد سليمان المطيري', phone: '0509990011', email: 'fahad.m@autocare.com', job: 'كاشير مبيعات', dept: 'المبيعات', salary: 5000, comType: 'PERCENTAGE', comRate: 0.5 },
    { code: 'EMP-110', name: 'بشير عمر النجار', phone: '0500001122', email: 'basheer.n@autocare.com', job: 'محاسب عام', dept: 'المالية', salary: 7500, comType: 'PERCENTAGE', comRate: 0 },
  ];

  const empMap: Record<string, string> = {};
  for (const ed of employeesData) {
    const emp = await prisma.employee.create({
      data: {
        code: ed.code,
        name: ed.name,
        phone: ed.phone,
        email: ed.email,
        jobId: jobsMap[ed.job],
        department: ed.dept,
        salary: ed.salary,
        commissionType: ed.comType,
        commissionRate: ed.comRate,
        branchId: branchRiyadh.id,
      },
    });
    empMap[ed.code] = emp.id;
  }

  // 6. Users (5 System Users with secure password 'admin123')
  await prisma.user.deleteMany({});
  const salt = await bcrypt.genSalt(10);
  const defaultPasswordHash = await bcrypt.hash('admin123', salt);

  const usersData = [
    { username: 'admin', name: 'المدير العام', roleId: roleAdmin.id, empCode: null },
    { username: 'workshop', name: 'م. أحمد - مدير الورشة', roleId: roleWorkshopMgr.id, empCode: 'EMP-101' },
    { username: 'store', name: 'عبدالله - أمين المستودع', roleId: roleStorekeeper.id, empCode: 'EMP-108' },
    { username: 'cashier', name: 'فهد - كاشير المبيعات', roleId: roleCashier.id, empCode: 'EMP-109' },
    { username: 'accountant', name: 'بشير - المحاسب', roleId: roleAccountant.id, empCode: 'EMP-110' },
  ];

  for (const u of usersData) {
    await prisma.user.create({
      data: {
        username: u.username,
        passwordHash: defaultPasswordHash,
        fullName: u.name,
        roleId: u.roleId,
        branchId: branchRiyadh.id,
        employeeId: u.empCode ? empMap[u.empCode] : null,
        active: true,
      },
    });
  }

  // 7. Units
  await prisma.unit.deleteMany({});
  const unitsData = [
    { name: 'حبة', symbol: 'حبة' },
    { name: 'طقم', symbol: 'طقم' },
    { name: 'كرتون', symbol: 'كرتون' },
    { name: 'لتر', symbol: 'لتر' },
    { name: 'جالون', symbol: 'جالون' },
    { name: 'متر', symbol: 'متر' },
  ];
  const unitMap: Record<string, string> = {};
  for (const u of unitsData) {
    const un = await prisma.unit.create({ data: u });
    unitMap[u.name] = un.id;
  }

  // 8. Categories (8 Categories)
  await prisma.itemCategory.deleteMany({});
  const categoriesData = [
    { name: 'فلاتر وسوائل', description: 'فلاتر الزيت والهواء والمكيف وسوائل التبريد' },
    { name: 'نظام الفرامل', description: 'أقمشة، فحمات، هوبات، ليات وزيوت فرامل' },
    { name: 'أجزاء المحرك', description: 'بواجي، كويلات، سيور، بساتم وطرمبات ماء وزيت' },
    { name: 'كهرباء وإلكترونيات', description: 'دينامو، سلف، حساسات، ضفائر ولمبات' },
    { name: 'زيوت ومواد تشحيم', description: 'زيوت محركات صناعية ومعدنية وزيوت جيربوكس ودفرنس' },
    { name: 'إطارات وبطاريات', description: 'بطاريات جافة ومائية وإطارات لكافة المقاسات' },
    { name: 'نظام التكييف والتبريد', description: 'كمبروسرات، رديترات، خراطيش، وبلف تكييف' },
    { name: 'نظام التعليق والمساعدات', description: 'مساعدات أمامية وخلفية، مقصات، جلب وأذرعة' },
  ];

  const catMap: Record<string, string> = {};
  for (const c of categoriesData) {
    const cat = await prisma.itemCategory.create({ data: c });
    catMap[c.name] = cat.id;
  }
  catMap['تكييف وتبريد'] = catMap['نظام التكييف والتبريد'];

  // 9. Warehouses (3 Warehouses)
  await prisma.warehouse.deleteMany({});
  const whMain = await prisma.warehouse.create({
    data: {
      code: 'WH-MAIN',
      name: 'المستودع الرئيسي (قطع الغيار)',
      location: 'مبنى المستودعات - مبنى A',
      branchId: branchRiyadh.id,
      active: true,
    },
  });

  const whWorkshop = await prisma.warehouse.create({
    data: {
      code: 'WH-SHOP',
      name: 'مخزن صالة الورشة',
      location: 'داخل صالة الورشة المركزية',
      branchId: branchRiyadh.id,
      active: true,
    },
  });

  const whExpress = await prisma.warehouse.create({
    data: {
      code: 'WH-EXP',
      name: 'رفوف الصيانة الدورية السريعة',
      location: 'منطقة استقبال الغيار السريع',
      branchId: branchRiyadh.id,
      active: true,
    },
  });

  // 10. Suppliers (10 Suppliers)
  await prisma.supplier.deleteMany({});
  const suppliersData = [
    { code: 'SUP-01', name: 'شركة الزيوت المتحدة المحدودة', company: 'المتحدة للبترول', phone: '0114012345', mobile: '0551234567', taxNumber: '300123456700003', balance: 15400, terms: 30 },
    { code: 'SUP-02', name: 'وكالة قطع الغيار الأصلية تويوتا', company: 'مجموعة التوزيع الأصلي', phone: '0114023456', mobile: '0552345678', taxNumber: '300234567800003', balance: 32000, terms: 45 },
    { code: 'SUP-03', name: 'مؤسسة الفرامل الذهبية للتجارة', company: 'بريمبو وسنيرك', phone: '0114034567', mobile: '0553456789', taxNumber: '300345678900003', balance: 8750, terms: 30 },
    { code: 'SUP-04', name: 'شركة الإطارات العالمية (ميشلان وبريدجستون)', company: 'العالمية للإطارات', phone: '0114045678', mobile: '0554567890', taxNumber: '300456789000003', balance: 24500, terms: 30 },
    { code: 'SUP-05', name: 'مصنع الفلاتر الوطنية الأوتوماتيكية', company: 'فلاتر بوش السعودية', phone: '0114056789', mobile: '0555678901', taxNumber: '300567890100003', balance: 4100, terms: 15 },
    { code: 'SUP-06', name: 'شركة البطاريات المتقدمة (هانكوك وإيه سي ديلكو)', company: 'المتقدمة للطاقة', phone: '0114067890', mobile: '0556789012', taxNumber: '300678901200003', balance: 12800, terms: 30 },
    { code: 'SUP-07', name: 'مؤسسة قطع محركات هيونداي وكيا المعتمدة', company: 'موبيس الخليج', phone: '0114078901', mobile: '0557890123', taxNumber: '300789012300003', balance: 19400, terms: 45 },
    { code: 'SUP-08', name: 'شركة أنظمة التكييف والرديترات الحرارية', company: 'دينسو الشرق الأوسط', phone: '0114089012', mobile: '0558901234', taxNumber: '300890123400003', balance: 6900, terms: 30 },
    { code: 'SUP-09', name: 'مؤسسة أنظمة التعليق والمساعدات KYB', company: 'كاي بي أوتو', phone: '0114090123', mobile: '0559012345', taxNumber: '300901234500003', balance: 11200, terms: 30 },
    { code: 'SUP-10', name: 'مؤسسة التوريد السريع للقطع الأمريكية فورد وجي إم', company: 'موتوركرافت المباشر', phone: '0114101234', mobile: '0550123456', taxNumber: '301012345600003', balance: 14600, terms: 30 },
  ];

  const supMap: Record<string, string> = {};
  for (const s of suppliersData) {
    const sup = await prisma.supplier.create({
      data: {
        code: s.code,
        name: s.name,
        company: s.company,
        phone: s.phone,
        mobile: s.mobile,
        taxNumber: s.taxNumber,
        openingBalance: s.balance,
        currentBalance: s.balance,
        paymentTermsDays: s.terms,
        creditLimit: 50000,
        address: 'الرياض - المنطقة الصناعية',
      },
    });
    supMap[s.code] = sup.id;
  }

  // 11. Customers (20 Customers: Individuals & Corporate)
  await prisma.customer.deleteMany({});
  const customersData = [
    { code: 'CUS-101', name: 'عبدالعزيز إبراهيم الراجحي', phone: '0541112233', type: 'INDIVIDUAL', balance: 0 },
    { code: 'CUS-102', name: 'سلطان محمد الغامدي', phone: '0542223344', type: 'INDIVIDUAL', balance: 450 },
    { code: 'CUS-103', name: 'م. عمر بن خالد الدوسري', phone: '0543334455', type: 'INDIVIDUAL', balance: 0 },
    { code: 'CUS-104', name: 'فيصل نايف السبيعي', phone: '0544445566', type: 'INDIVIDUAL', balance: 1200 },
    { code: 'CUS-105', name: 'د. هند بنت عبدالله العتيبي', phone: '0545556677', type: 'INDIVIDUAL', balance: 0 },
    { code: 'CUS-106', name: 'محمد صالح القحطاني', phone: '0546667788', type: 'INDIVIDUAL', balance: 350 },
    { code: 'CUS-107', name: 'ماجد ناصر الحارثي', phone: '0547778899', type: 'INDIVIDUAL', balance: 0 },
    { code: 'CUS-108', name: 'بندر سعد العريفي', phone: '0548889900', type: 'INDIVIDUAL', balance: 0 },
    { code: 'CUS-109', name: 'سعود عبدالعزيز الشايع', phone: '0549990011', type: 'INDIVIDUAL', balance: 800 },
    { code: 'CUS-110', name: 'رائد فهد المالكي', phone: '0540001122', type: 'INDIVIDUAL', balance: 0 },
    { code: 'CUS-111', name: 'تركي منصور الشهري', phone: '0561112233', type: 'INDIVIDUAL', balance: 150 },
    { code: 'CUS-112', name: 'نواف عادل العواد', phone: '0562223344', type: 'INDIVIDUAL', balance: 0 },
    { code: 'CUS-113', name: 'وليد حمد اليحيى', phone: '0563334455', type: 'INDIVIDUAL', balance: 0 },
    { code: 'CUS-114', name: 'سامي مبارك الحربي', phone: '0564445566', type: 'INDIVIDUAL', balance: 620 },
    { code: 'CUS-115', name: 'أنس جاسم الخاطر', phone: '0565556677', type: 'INDIVIDUAL', balance: 0 },
    // Corporate Accounts
    { code: 'CUS-201', name: 'شركة نقليات الرواد اللوجستية', phone: '0112901111', type: 'COMPANY', balance: 8500, taxNumber: '310999888100003' },
    { code: 'CUS-202', name: 'مؤسسة درب الأمان لتأجير السيارات', phone: '0112902222', type: 'COMPANY', balance: 14200, taxNumber: '310888777100003' },
    { code: 'CUS-203', name: 'شركة عبر الخليج للتوزيع السريع', phone: '0112903333', type: 'COMPANY', balance: 4800, taxNumber: '310777666100003' },
    { code: 'CUS-204', name: 'مدارس الفرسان الأهلية (حافلات)', phone: '0112904444', type: 'COMPANY', balance: 6300, taxNumber: '310666555100003' },
    { code: 'CUS-205', name: 'شركة أفق المقاولات المحدودة', phone: '0112905555', type: 'COMPANY', balance: 3100, taxNumber: '310555444100003' },
  ];

  const cusMap: Record<string, string> = {};
  for (const c of customersData) {
    const cust = await prisma.customer.create({
      data: {
        code: c.code,
        name: c.name,
        phone: c.phone,
        mobile: c.phone,
        customerType: c.type,
        openingBalance: c.balance,
        currentBalance: c.balance,
        creditLimit: c.type === 'COMPANY' ? 30000 : 5000,
        address: 'الرياض',
        taxNumber: c.taxNumber || null,
      },
    });
    cusMap[c.code] = cust.id;
  }

  // 12. Vehicles (15 Realistic Vehicles)
  await prisma.vehicle.deleteMany({});
  const vehiclesData = [
    { plate: 'أ ب ج 1234', vin: 'JTDKN3DU5N1234501', make: 'تويوتا', model: 'كامري GLE', year: 2022, color: 'أبيض لؤلؤي', odo: 65400, cusCode: 'CUS-101' },
    { plate: 'د هـ و 5678', vin: 'KMHCT4AE8NU234502', make: 'هيونداي', model: 'سوناتا سمارت', year: 2021, color: 'فضي معدني', odo: 88200, cusCode: 'CUS-102' },
    { plate: 'ر ز س 9012', vin: '1FA6P8CF4N5345603', make: 'فورد', model: 'تورس تيتانيوم', year: 2023, color: 'أسود ملوكي', odo: 34100, cusCode: 'CUS-103' },
    { plate: 'ص ض ط 3456', vin: 'JTMHY7AJ6M4456704', make: 'تويوتا', model: 'لاندكروزر VXR', year: 2020, color: 'أبيض', odo: 125000, cusCode: 'CUS-104' },
    { plate: 'ع غ ف 7890', vin: 'WBA5A5C58M5567805', make: 'مرسيدس', model: 'E300 AMG', year: 2022, color: 'رمادي مطفي', odo: 42000, cusCode: 'CUS-105' },
    { plate: 'ق ك ل 2345', vin: 'JN1AZ4EH9M6678906', make: 'نيسان', model: 'باترول بلاتينيوم', year: 2021, color: 'ذهبي بيج', odo: 98000, cusCode: 'CUS-106' },
    { plate: 'م ن هـ 6789', vin: '1GKS2CKC6R7789007', make: 'جي إم سي', model: 'يوكن دالي', year: 2022, color: 'كحلي غامق', odo: 56000, cusCode: 'CUS-107' },
    { plate: 'و ي أ 1357', vin: '2T2HZMDA2N8890108', make: 'لكزس', model: 'ES 350', year: 2023, color: 'تيتانيوم', odo: 29000, cusCode: 'CUS-108' },
    { plate: 'ب ح د 2468', vin: 'KMHD84LF7N9901209', make: 'هيونداي', model: 'النترا GL', year: 2022, color: 'أحمر ماروني', odo: 73000, cusCode: 'CUS-109' },
    { plate: 'س ع ص 3579', vin: '3N1AB8CV6L0012310', make: 'نيسان', model: 'صني كومفورت', year: 2020, color: 'أبيض', odo: 110000, cusCode: 'CUS-110' },
    { plate: 'ط ق م 4680', vin: 'JTJBAMCA8N1123411', make: 'تويوتا', model: 'هايلكس غمارتين', year: 2021, color: 'أبيض', odo: 145000, cusCode: 'CUS-201' },
    { plate: 'ن هـ و 5791', vin: 'JTJBAMCA9N1123412', make: 'تويوتا', model: 'هايلكس ديزل', year: 2022, color: 'فضي', odo: 95000, cusCode: 'CUS-201' },
    { plate: 'ل ب ك 6802', vin: 'KMHCT4AE9NU234513', make: 'هيونداي', model: 'أكسنت سمارت', year: 2022, color: 'أبيض', odo: 84000, cusCode: 'CUS-202' },
    { plate: 'ي ر ف 7913', vin: 'KMHCT4AE0NU234514', make: 'هيونداي', model: 'أكسنت سمارت', year: 2023, color: 'أصفر تكسي', odo: 51000, cusCode: 'CUS-202' },
    { plate: 'د م س 8024', vin: '1FTFW1ED5PFA34515', make: 'فورد', model: 'F-150 SuperCrew', year: 2022, color: 'رمادي صخري', odo: 67000, cusCode: 'CUS-205' },
  ];

  const vehMap: Record<string, string> = {};
  for (const v of vehiclesData) {
    const veh = await prisma.vehicle.create({
      data: {
        plateNumber: v.plate,
        vin: v.vin,
        make: v.make,
        model: v.model,
        year: v.year,
        color: v.color,
        currentOdometer: v.odo,
        customerId: cusMap[v.cusCode],
        engineType: 'بنزين',
      },
    });
    vehMap[v.plate] = veh.id;
  }

  // 13. Items (50 Comprehensive Spare Parts Items)
  await prisma.item.deleteMany({});
  const itemsData = [
    // فلاتر وسوائل (8 items)
    { sku: 'FLT-001', barcode: '628100100001', nameAr: 'فلتر زيت تويوتا أصلي كامري / راف فور', nameEn: 'Toyota Genuine Oil Filter', cat: 'فلاتر وسوائل', unit: 'حبة', partNo: '04152-YZZA1', cost: 18, price: 35, loc: 'A-01-01', minStock: 20 },
    { sku: 'FLT-002', barcode: '628100100002', nameAr: 'فلتر هواء محرك تويوتا كامري 2018-2024', nameEn: 'Toyota Engine Air Filter', cat: 'فلاتر وسوائل', unit: 'حبة', partNo: '17801-F0020', cost: 45, price: 85, loc: 'A-01-02', minStock: 10 },
    { sku: 'FLT-003', barcode: '628100100003', nameAr: 'فلتر مكيف هواء تويوتا لكزس كاربون', nameEn: 'Cabin AC Charcoal Filter', cat: 'فلاتر وسوائل', unit: 'حبة', partNo: '87139-58010', cost: 35, price: 70, loc: 'A-01-03', minStock: 15 },
    { sku: 'FLT-004', barcode: '628100100004', nameAr: 'فلتر زيت هيونداي كيا أصلي 26300-35505', nameEn: 'Hyundai Genuine Oil Filter', cat: 'فلاتر وسوائل', unit: 'حبة', partNo: '26300-35505', cost: 15, price: 30, loc: 'A-01-04', minStock: 25 },
    { sku: 'FLT-005', barcode: '628100100005', nameAr: 'فلتر هواء هيونداي سوناتا / أوبتيما', nameEn: 'Hyundai Engine Air Filter', cat: 'فلاتر وسوائل', unit: 'حبة', partNo: '28113-C1100', cost: 40, price: 75, loc: 'A-01-05', minStock: 10 },
    { sku: 'FLT-006', barcode: '628100100006', nameAr: 'فلتر بنزين داخلي تانكي لاندكروزر / باترول', nameEn: 'In-Tank Fuel Filter V8', cat: 'فلاتر وسوائل', unit: 'حبة', partNo: '77024-60140', cost: 120, price: 210, loc: 'A-02-01', minStock: 5 },
    { sku: 'FLT-007', barcode: '628100100007', nameAr: 'سائل تبريد رديتر تويوتا سوبر لونج لايف وردي 4L', nameEn: 'Toyota Super Long Life Coolant 4L', cat: 'فلاتر وسوائل', unit: 'جالون', partNo: '08889-80072', cost: 55, price: 95, loc: 'A-03-01', minStock: 15 },
    { sku: 'FLT-008', barcode: '628100100008', nameAr: 'سائل فرامل دوت 4 ألماني بوش 500ml', nameEn: 'Bosch DOT 4 Brake Fluid', cat: 'فلاتر وسوائل', unit: 'حبة', partNo: '1987476036', cost: 16, price: 32, loc: 'A-03-02', minStock: 20 },

    // نظام الفرامل (7 items)
    { sku: 'BRK-001', barcode: '628100200001', nameAr: 'طقم أقمشة فرامل أمامية تويوتا كامري سيراميك', nameEn: 'Front Ceramic Brake Pads Camry', cat: 'نظام الفرامل', unit: 'طقم', partNo: '04465-33480', cost: 110, price: 220, loc: 'B-01-01', minStock: 10 },
    { sku: 'BRK-002', barcode: '628100200002', nameAr: 'طقم أقمشة فرامل خلفية تويوتا كامري', nameEn: 'Rear Brake Pads Camry', cat: 'نظام الفرامل', unit: 'طقم', partNo: '04466-33200', cost: 90, price: 180, loc: 'B-01-02', minStock: 10 },
    { sku: 'BRK-003', barcode: '628100200003', nameAr: 'فحمات فرامل أمامية هيونداي سوناتا موبيس', nameEn: 'Front Brake Pads Sonata Mobis', cat: 'نظام الفرامل', unit: 'طقم', partNo: '58101-C1A00', cost: 95, price: 195, loc: 'B-01-03', minStock: 12 },
    { sku: 'BRK-004', barcode: '628100200004', nameAr: 'فحمات فرامل أمامية فورد تورس أصلي موتوركرافت', nameEn: 'Motorcraft Front Pads Taurus', cat: 'نظام الفرامل', unit: 'طقم', partNo: 'BRF-1443', cost: 180, price: 320, loc: 'B-02-01', minStock: 6 },
    { sku: 'BRK-005', barcode: '628100200005', nameAr: 'هوب فرامل أمامي ياباني بريمبو كامري (حبة)', nameEn: 'Brembo Front Brake Rotor Camry', cat: 'نظام الفرامل', unit: 'حبة', partNo: '09.A417.11', cost: 140, price: 240, loc: 'B-03-01', minStock: 8 },
    { sku: 'BRK-006', barcode: '628100200006', nameAr: 'هوب فرامل خلفي تويوتا لاندكروزر أصلي', nameEn: 'Toyota Genuine Rear Rotor LC200', cat: 'نظام الفرامل', unit: 'حبة', partNo: '42431-60290', cost: 260, price: 420, loc: 'B-03-02', minStock: 4 },
    { sku: 'BRK-007', barcode: '628100200007', nameAr: 'حساس تيل فرامل أمامي مرسيدس E300', nameEn: 'Mercedes Brake Wear Sensor', cat: 'نظام الفرامل', unit: 'حبة', partNo: 'A2115401717', cost: 30, price: 65, loc: 'B-02-02', minStock: 10 },

    // زيوت ومواد تشحيم (6 items)
    { sku: 'OIL-001', barcode: '628100300001', nameAr: 'زيت محرك كاسترول إيدج 5W-30 تخليقي بالكامل 1L', nameEn: 'Castrol EDGE 5W-30 Full Synthetic 1L', cat: 'زيوت ومواد تشحيم', unit: 'لتر', partNo: 'CAS-5W30-1L', cost: 32, price: 55, loc: 'C-01-01', minStock: 60 },
    { sku: 'OIL-002', barcode: '628100300002', nameAr: 'زيت محرك موبيل وان 0W-20 تخليقي متطور 1L', nameEn: 'Mobil 1 Advanced Fuel Economy 0W-20', cat: 'زيوت ومواد تشحيم', unit: 'لتر', partNo: 'MOB-0W20-1L', cost: 35, price: 60, loc: 'C-01-02', minStock: 50 },
    { sku: 'OIL-003', barcode: '628100300003', nameAr: 'زيت بترومين سوبر جي تي 20W-50 معدني 1L', nameEn: 'Petromin Super G-T 20W-50 1L', cat: 'زيوت ومواد تشحيم', unit: 'لتر', partNo: 'PET-20W50-1L', cost: 14, price: 25, loc: 'C-01-03', minStock: 80 },
    { sku: 'OIL-004', barcode: '628100300004', nameAr: 'زيت جيربوكس تويوتا أصلي ATF WS أوتوماتيك 4L', nameEn: 'Toyota Genuine ATF WS 4L', cat: 'زيوت ومواد تشحيم', unit: 'جالون', partNo: '08886-02305', cost: 135, price: 210, loc: 'C-02-01', minStock: 20 },
    { sku: 'OIL-005', barcode: '628100300005', nameAr: 'زيت دفرنس ودبل شل سبيركس 80W-90 1L', nameEn: 'Shell Spirax 80W-90 Axle Oil', cat: 'زيوت ومواد تشحيم', unit: 'لتر', partNo: 'SHL-80W90-1L', cost: 22, price: 40, loc: 'C-02-02', minStock: 25 },
    { sku: 'OIL-006', barcode: '628100300006', nameAr: 'شحم كراسي وعكوس مقاوم للحرارة العالية 450g', nameEn: 'High-Temp Bearing Grease', cat: 'زيوت ومواد تشحيم', unit: 'حبة', partNo: 'GRS-HT-450', cost: 15, price: 30, loc: 'C-03-01', minStock: 30 },

    // أجزاء المحرك (7 items)
    { sku: 'ENG-001', barcode: '628100400001', nameAr: 'طقم بواجي إيريديوم ليزر NGK ياباني (4 حبات)', nameEn: 'NGK Laser Iridium Spark Plugs (Set 4)', cat: 'أجزاء المحرك', unit: 'طقم', partNo: 'ILKAR7B11', cost: 120, price: 220, loc: 'D-01-01', minStock: 15 },
    { sku: 'ENG-002', barcode: '628100400002', nameAr: 'طقم بواجي تويوتا أصلي دنسو (4 حبات)', nameEn: 'Denso Genuine Toyota Spark Plugs', cat: 'أجزاء المحرك', unit: 'طقم', partNo: '90919-01253', cost: 140, price: 240, loc: 'D-01-02', minStock: 12 },
    { sku: 'ENG-003', barcode: '628100400003', nameAr: 'كويل إشعال محرك كامري / راف فور دنسو ياباني', nameEn: 'Ignition Coil Denso Camry', cat: 'أجزاء المحرك', unit: 'حبة', partNo: '099700-2500', cost: 95, price: 175, loc: 'D-02-01', minStock: 10 },
    { sku: 'ENG-004', barcode: '628100400004', nameAr: 'سير مكينة رئيسي مروحة دينامو كامري جيتس أمريكي', nameEn: 'Gates Micro-V Serpentine Belt', cat: 'أجزاء المحرك', unit: 'حبة', partNo: '6PK1235', cost: 50, price: 95, loc: 'D-02-02', minStock: 10 },
    { sku: 'ENG-005', barcode: '628100400005', nameAr: 'طلمبة مياه تبريد محرك هيونداي سوناتا 2.4L', nameEn: 'Engine Water Pump Sonata', cat: 'أجزاء المحرك', unit: 'حبة', partNo: '25100-2G500', cost: 130, price: 230, loc: 'D-03-01', minStock: 5 },
    { sku: 'ENG-006', barcode: '628100400006', nameAr: 'بلف حرارة ثرموستات محرك تويوتا أصلي 82C', nameEn: 'Toyota Thermostat 82C', cat: 'أجزاء المحرك', unit: 'حبة', partNo: '90916-03129', cost: 45, price: 85, loc: 'D-03-02', minStock: 10 },
    { sku: 'ENG-007', barcode: '628100400007', nameAr: 'كرسي مكينة سفلي كامري هيدروليك أصلي', nameEn: 'Camry Lower Engine Mount Hydraulic', cat: 'أجزاء المحرك', unit: 'حبة', partNo: '12361-0V040', cost: 180, price: 310, loc: 'D-04-01', minStock: 6 },

    // إطارات وبطاريات (6 items)
    { sku: 'BAT-001', barcode: '628100500001', nameAr: 'بطارية هانكوك كوري 70 أمبير جافة 12V 80D26L', nameEn: 'Hankook Battery 70Ah MF', cat: 'إطارات وبطاريات', unit: 'حبة', partNo: 'HK-80D26L', cost: 230, price: 350, loc: 'E-01-01', minStock: 8 },
    { sku: 'BAT-002', barcode: '628100500002', nameAr: 'بطارية إيه سي ديلكو 60 أمبير 12V أمريكي', nameEn: 'ACDelco 60Ah Maintenance Free', cat: 'إطارات وبطاريات', unit: 'حبة', partNo: 'ACD-55D23L', cost: 195, price: 295, loc: 'E-01-02', minStock: 10 },
    { sku: 'BAT-003', barcode: '628100500003', nameAr: 'بطارية بوش AGM متطورة لنظام التشغيل والإيقاف 80Ah', nameEn: 'Bosch AGM S5 Start-Stop 80Ah', cat: 'إطارات وبطاريات', unit: 'حبة', partNo: '0092S5A110', cost: 480, price: 720, loc: 'E-01-03', minStock: 4 },
    { sku: 'TIR-001', barcode: '628100500004', nameAr: 'إطار ميشلان بريميسي 4 مقاس 215/55R17 فرنسي', nameEn: 'Michelin Primacy 4 215/55R17', cat: 'إطارات وبطاريات', unit: 'حبة', partNo: 'MICH-2155517', cost: 380, price: 540, loc: 'E-02-01', minStock: 8 },
    { sku: 'TIR-002', barcode: '628100500005', nameAr: 'إطار هانكوك فنتوس برايم 225/45R18 كوري', nameEn: 'Hankook Ventus Prime 225/45R18', cat: 'إطارات وبطاريات', unit: 'حبة', partNo: 'HK-2254518', cost: 290, price: 420, loc: 'E-02-02', minStock: 12 },
    { sku: 'TIR-003', barcode: '628100500006', nameAr: 'إطار يوكوهاما جيولاندر للجيوب 285/60R18 ياباني', nameEn: 'Yokohama Geolandar A/T 285/60R18', cat: 'إطارات وبطاريات', unit: 'حبة', partNo: 'YOKO-2856018', cost: 520, price: 760, loc: 'E-02-03', minStock: 8 },

    // تكييف وتبريد (6 items)
    { sku: 'AC-001', barcode: '628100600001', nameAr: 'كمبروسر مكيف كامري 2018-2023 دنسو ياباني', nameEn: 'Denso AC Compressor Camry', cat: 'تكييف وتبريد', unit: 'حبة', partNo: 'DCP50095', cost: 850, price: 1350, loc: 'F-01-01', minStock: 4 },
    { sku: 'AC-002', barcode: '628100600002', nameAr: 'رديتر تكييف كوندنسر هيونداي سوناتا أصلي موبيس', nameEn: 'Hyundai AC Condenser Sonata', cat: 'تكييف وتبريد', unit: 'حبة', partNo: '97606-C1000', cost: 280, price: 450, loc: 'F-01-02', minStock: 4 },
    { sku: 'AC-003', barcode: '628100600003', nameAr: 'رديتر ماء تبريد محرك ألمنيوم تويوتا كامري ياباني', nameEn: 'Koyo Cooling Radiator Camry', cat: 'تكييف وتبريد', unit: 'حبة', partNo: 'PL012133', cost: 320, price: 520, loc: 'F-02-01', minStock: 5 },
    { sku: 'AC-004', barcode: '628100600004', nameAr: 'غاز فريون ريبور الأمريكي R134a أسطوانة 13.6 كجم', nameEn: 'Refron R134a Refrigerant 13.6kg', cat: 'تكييف وتبريد', unit: 'جالون', partNo: 'R134A-USA', cost: 240, price: 390, loc: 'F-03-01', minStock: 6 },
    { sku: 'AC-005', barcode: '628100600005', nameAr: 'بلف تكييف ثلاجة إكسبانشن فالف كامري / أفالون', nameEn: 'Expansion Valve AC Denso', cat: 'تكييف وتبريد', unit: 'حبة', partNo: '88515-33060', cost: 85, price: 155, loc: 'F-02-02', minStock: 8 },
    { sku: 'AC-006', barcode: '628100600006', nameAr: 'مروحة رديتر كهربائية كاملة بالدينامو سوناتا', nameEn: 'Cooling Fan Assembly Sonata', cat: 'تكييف وتبريد', unit: 'حبة', partNo: '25380-C1000', cost: 240, price: 390, loc: 'F-02-03', minStock: 4 },

    // نظام التعليق والمساعدات (6 items)
    { sku: 'SUS-001', barcode: '628100700001', nameAr: 'مساعد أمامي غازي KYB إكسل جي كامري (حبة)', nameEn: 'KYB Excel-G Front Strut Camry', cat: 'نظام التعليق والمساعدات', unit: 'حبة', partNo: '339243', cost: 160, price: 270, loc: 'G-01-01', minStock: 8 },
    { sku: 'SUS-002', barcode: '628100700002', nameAr: 'مساعد خلفي غازي KYB إكسل جي كامري (حبة)', nameEn: 'KYB Excel-G Rear Shock Camry', cat: 'نظام التعليق والمساعدات', unit: 'حبة', partNo: '349071', cost: 130, price: 220, loc: 'G-01-02', minStock: 8 },
    { sku: 'SUS-003', barcode: '628100700003', nameAr: 'مقص أمامي سفلي يمين تويوتا كامري أصلي', nameEn: 'Right Lower Control Arm Camry', cat: 'نظام التعليق والمساعدات', unit: 'حبة', partNo: '48068-06170', cost: 220, price: 380, loc: 'G-02-01', minStock: 4 },
    { sku: 'SUS-004', barcode: '628100700004', nameAr: 'مقص أمامي سفلي يسار تويوتا كامري أصلي', nameEn: 'Left Lower Control Arm Camry', cat: 'نظام التعليق والمساعدات', unit: 'حبة', partNo: '48069-06170', cost: 220, price: 380, loc: 'G-02-02', minStock: 4 },
    { sku: 'SUS-005', barcode: '628100700005', nameAr: 'جوزة ذراع دركسون خارجي تايواني 555 كامري (طقم)', nameEn: 'Three Five Tie Rod End Outer (Pair)', cat: 'نظام التعليق والمساعدات', unit: 'طقم', partNo: 'SE-3881', cost: 75, price: 140, loc: 'G-03-01', minStock: 10 },
    { sku: 'SUS-006', barcode: '628100700006', nameAr: 'مسمار توازن أمامي ياباني 555 كامري (حبة)', nameEn: 'Front Stabilizer Link Camry', cat: 'نظام التعليق والمساعدات', unit: 'حبة', partNo: 'SL-3880', cost: 45, price: 85, loc: 'G-03-02', minStock: 15 },

    // كهرباء وإلكترونيات (4 items)
    { sku: 'ELE-001', barcode: '628100800001', nameAr: 'دينامو شحن بطارية كامري 130A دنسو أصلي', nameEn: 'Alternator 130A Denso Camry', cat: 'كهرباء وإلكترونيات', unit: 'حبة', partNo: '27060-0V010', cost: 650, price: 1050, loc: 'H-01-01', minStock: 3 },
    { sku: 'ELE-002', barcode: '628100800002', nameAr: 'سلف تشغيل محرك أصلي هيونداي سوناتا 1.2kW', nameEn: 'Starter Motor Mobis Sonata', cat: 'كهرباء وإلكترونيات', unit: 'حبة', partNo: '36100-2G100', cost: 420, price: 680, loc: 'H-01-02', minStock: 3 },
    { sku: 'ELE-003', barcode: '628100800003', nameAr: 'حساس أكسجين شكمان علوي تويوتا دنسو أصلي', nameEn: 'Upstream Oxygen Sensor Denso', cat: 'كهرباء وإلكترونيات', unit: 'حبة', partNo: '89467-33170', cost: 260, price: 420, loc: 'H-02-01', minStock: 4 },
    { sku: 'ELE-004', barcode: '628100800004', nameAr: 'طقم لمبات ليد فيليبس ألماني H7 إضاءة بيضاء 6000K', nameEn: 'Philips Ultinon Pro9000 LED H7', cat: 'كهرباء وإلكترونيات', unit: 'طقم', partNo: '11972U90CWX2', cost: 180, price: 310, loc: 'H-03-01', minStock: 8 },
  ];

  const itemMap: Record<string, string> = {};
  for (const it of itemsData) {
    const createdItem = await prisma.item.create({
      data: {
        sku: it.sku,
        barcode: it.barcode,
        nameAr: it.nameAr,
        nameEn: it.nameEn,
        categoryId: catMap[it.cat],
        unitId: unitMap[it.unit],
        partNumber: it.partNo,
        purchasePrice: it.cost,
        avgCost: it.cost,
        sellPrice: it.price,
        specialSellPrice: Math.round(it.price * 0.9),
        taxRate: 15.0,
        defaultLocation: it.loc,
        minStock: it.minStock,
        maxStock: it.minStock * 5,
        active: true,
      },
    });
    itemMap[it.sku] = createdItem.id;

    // Seed stock balances across warehouses
    // Main warehouse gets large stock, workshop gets small stock, express gets fast moving stock
    const qtyMain = Math.floor(it.minStock * 2.5);
    const qtyShop = Math.floor(it.minStock * 0.8);
    const qtyExp = Math.floor(it.minStock * 0.4);

    await prisma.stockBalance.create({
      data: {
        itemId: createdItem.id,
        warehouseId: whMain.id,
        quantity: qtyMain,
        reservedQty: 0,
      },
    });

    await prisma.stockBalance.create({
      data: {
        itemId: createdItem.id,
        warehouseId: whWorkshop.id,
        quantity: qtyShop,
        reservedQty: 0,
      },
    });

    await prisma.stockBalance.create({
      data: {
        itemId: createdItem.id,
        warehouseId: whExpress.id,
        quantity: qtyExp,
        reservedQty: 0,
      },
    });

    // Record opening stock transaction
    await prisma.stockTransaction.create({
      data: {
        itemId: createdItem.id,
        warehouseId: whMain.id,
        type: 'ADJUSTMENT',
        quantity: qtyMain,
        unitCost: it.cost,
        totalCost: qtyMain * it.cost,
        referenceType: 'InitialBalance',
        notes: 'رصيد افتتاحي تأسيسي في المستودع الرئيسي',
      },
    });
  }

  // 14. Cashboxes & Bank Accounts
  await prisma.cashbox.deleteMany({});
  const mainCashbox = await prisma.cashbox.create({
    data: {
      name: 'خزينة الكاشير والاستقبال الرئيسية',
      branchId: branchRiyadh.id,
      balance: 18450,
      active: true,
    },
  });

  const workshopCashbox = await prisma.cashbox.create({
    data: {
      name: 'عهدة مدير الورشة للمشتريات العاجلة',
      branchId: branchRiyadh.id,
      balance: 3000,
      active: true,
    },
  });

  await prisma.bank.deleteMany({});
  const bankAlRajhi = await prisma.bank.create({
    data: {
      bankName: 'مصرف الراجحي (حساب الشركات الرئيسي)',
      accountNumber: 'SA4580000214608010012345',
      iban: 'SA4580000214608010012345',
      currency: 'SAR',
      openingBalance: 120000,
      currentBalance: 154800,
      active: true,
    },
  });

  const bankSNB = await prisma.bank.create({
    data: {
      bankName: 'البنك الأهلي السعودي (حساب نقاط البيع والشبكة)',
      accountNumber: 'SA1210000012345678901234',
      iban: 'SA1210000012345678901234',
      currency: 'SAR',
      openingBalance: 85000,
      currentBalance: 98650,
      active: true,
    },
  });

  // 15. Expense & Revenue Categories & Records
  await prisma.expenseCategory.deleteMany({});
  const expCategories = [
    { name: 'إيجار المقر والورشة', desc: 'إيجار مبنى المركز والمستودعات' },
    { name: 'فواتير الكهرباء والمياه والإنترنت', desc: 'فواتير المرافق الحكومية والاتصالات' },
    { name: 'رواتب وأجور ومكافآت', desc: 'مسير الرواتب الشهرية والبدلات' },
    { name: 'أدوات ومستهلكات الورشة', desc: 'شراء مفاتيح، بخاخات صداء، قفازات، فحمات خراطة' },
    { name: 'صيانة دورية للمعدات والرافعات', desc: 'صيانة رافعات السيارات، كمبروسر الهواء وجهاز الفحص' },
    { name: 'مصروفات حكومية وتراخيص', desc: 'رخص البلدية، الدفاع المدني والغرفة التجارية' },
    { name: 'ضيافة وبوفيه المركز', desc: 'مشروبات وضيافة العملاء واستراحة الفنيين' },
  ];
  const expCatMap: Record<string, string> = {};
  for (const ec of expCategories) {
    const created = await prisma.expenseCategory.create({ data: { name: ec.name, description: ec.desc } });
    expCatMap[ec.name] = created.id;
  }

  await prisma.expense.deleteMany({});
  await prisma.expense.create({
    data: {
      expenseNumber: 'EXP-2026-001',
      categoryId: expCatMap['فواتير الكهرباء والمياه والإنترنت'],
      beneficiary: 'الشركة السعودية للكهرباء',
      amount: 4200,
      taxAmount: 630,
      totalAmount: 4830,
      paymentMethod: 'BANK',
      bankId: bankAlRajhi.id,
      description: 'سداد فاتورة كهرباء شهر أغسطس لمبنى الورشة الرئيسي',
    },
  });

  await prisma.expense.create({
    data: {
      expenseNumber: 'EXP-2026-002',
      categoryId: expCatMap['أدوات ومستهلكات الورشة'],
      beneficiary: 'مؤسسة العدد الصناعية',
      amount: 1450,
      taxAmount: 217.5,
      totalAmount: 1667.5,
      paymentMethod: 'CASH',
      cashboxId: mainCashbox.id,
      description: 'شراء كرتون بخاخ تنظيف فرامل وكرتون بخاخ صداء ومجموعات كواشف',
    },
  });

  // Revenue Categories
  await prisma.revenueCategory.deleteMany({});
  const revCat = await prisma.revenueCategory.create({
    data: { name: 'إيرادات خدمات فحص خارجي واستشارات', description: 'رسوم فحص شامل كمبيوتر بدون صيانة' },
  });

  await prisma.revenue.deleteMany({});
  await prisma.revenue.create({
    data: {
      revenueNumber: 'REV-2026-001',
      categoryId: revCat.id,
      source: 'عميل فحص كمبيوتر خارجي',
      amount: 350,
      paymentMethod: 'CASH',
      cashboxId: mainCashbox.id,
      description: 'فحص كمبيوتر وبرمجة سنسور ضغط الإطارات لسيارة لكزس خارجية',
    },
  });

  // 16. Purchase Invoices (Sample Realistic Invoices)
  await prisma.purchaseInvoice.deleteMany({});
  const pInv1 = await prisma.purchaseInvoice.create({
    data: {
      invoiceNumber: 'PINV-2026-001',
      supplierInvoiceNumber: 'INV-MOB-8821',
      supplierId: supMap['SUP-01'],
      warehouseId: whMain.id,
      branchId: branchRiyadh.id,
      date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      subtotal: 5000,
      discount: 200,
      taxAmount: 720,
      grandTotal: 5520,
      paidAmount: 5520,
      remainingAmount: 0,
      paymentMethod: 'BANK',
      status: 'PAID',
      notes: 'شحنة زيوت تخليقية وفلاتر سريعة',
      items: {
        create: [
          {
            itemId: itemMap['OIL-001'],
            quantity: 100,
            unitPrice: 32,
            discount: 0,
            taxRate: 15,
            taxAmount: 480,
            total: 3680,
          },
          {
            itemId: itemMap['OIL-002'],
            quantity: 50,
            unitPrice: 35,
            discount: 0,
            taxRate: 15,
            taxAmount: 262.5,
            total: 2012.5,
          },
        ],
      },
    },
  });

  // 17. Repair Orders (Job Cards) with full lifecycle data!
  await prisma.repairOrder.deleteMany({});

  // Job Card 1: CLOSED / INVOICED with final maintenance sales invoice
  const jo1 = await prisma.repairOrder.create({
    data: {
      orderNumber: 'JC-2026-001',
      customerId: cusMap['CUS-101'],
      vehicleId: vehMap['أ ب ج 1234'],
      currentOdometer: 65400,
      fuelLevel: '75%',
      technicianId: empMap['EMP-103'], // طارق ميكانيكا
      serviceAdvisorId: empMap['EMP-102'], // خالد استقبال
      branchId: branchRiyadh.id,
      customerComplaint: 'صوت صرير قوي عند الضغط على الفرامل مع رجة خفيفة، وصوت ونه في المكيف',
      intakeNotes: 'يوجد خدش خفيف في الصدام الأمامي جهة اليمين مثبت في بطاقة الدخول',
      status: 'CLOSED',
      totalParts: 635,
      totalLabor: 350,
      discount: 35,
      taxAmount: 142.5,
      grandTotal: 1092.5,
      paidAmount: 1092.5,
      remainingAmount: 0,
      notes: 'تم فحص الفرامل وخرط الهوبات وتغيير الفحمات وتنظيف ثلاجة المكيف بنجاح',
      inspections: {
        create: {
          engineCheck: 'GOOD',
          oilsCheck: 'GOOD',
          brakesCheck: 'BAD',
          tiresCheck: 'GOOD',
          batteryCheck: 'GOOD',
          electricalCheck: 'GOOD',
          acCheck: 'FAIR',
          suspensionCheck: 'GOOD',
          coolingCheck: 'GOOD',
          computerScanCheck: 'GOOD',
          inspectorNotes: 'أقمشة الفرامل الأمامية متآكلة تماماً بنسبة 90% وتحتاج استبدال فوري مع خرط هوبات',
        },
      },
      estimates: {
        create: {
          estimateNumber: 'EST-2026-001',
          subtotalParts: 635,
          subtotalLabor: 350,
          discount: 35,
          taxAmount: 142.5,
          grandTotal: 1092.5,
          isApprovedByCustomer: true,
          approvedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          status: 'APPROVED',
          items: {
            create: [
              { type: 'PART', itemId: itemMap['BRK-001'], description: 'طقم أقمشة فرامل أمامية كامري سيراميك', quantity: 1, unitPrice: 220, total: 220 },
              { type: 'PART', itemId: itemMap['BRK-002'], description: 'طقم أقمشة فرامل خلفية كامري', quantity: 1, unitPrice: 180, total: 180 },
              { type: 'PART', itemId: itemMap['FLT-003'], description: 'فلتر مكيف هواء كاربون', quantity: 1, unitPrice: 70, total: 70 },
              { type: 'PART', itemId: itemMap['OIL-001'], description: 'زيت كاسترول إيدج 5W-30 (3 لتر تكميل)', quantity: 3, unitPrice: 55, total: 165 },
              { type: 'LABOR', description: 'أجور فك وتركيب فحمات أمامية وخلفية وخرط هوبات', quantity: 1, unitPrice: 250, total: 250 },
              { type: 'LABOR', description: 'أجور تنظيف ثلاجة المكيف وتغيير الفلتر وفحص الضغط', quantity: 1, unitPrice: 100, total: 100 },
            ],
          },
        },
      },
      parts: {
        create: [
          { itemId: itemMap['BRK-001'], warehouseId: whWorkshop.id, requestedQty: 1, issuedQty: 1, usedQty: 1, unitPrice: 220, costPrice: 110, total: 220, status: 'USED' },
          { itemId: itemMap['BRK-002'], warehouseId: whWorkshop.id, requestedQty: 1, issuedQty: 1, usedQty: 1, unitPrice: 180, costPrice: 90, total: 180, status: 'USED' },
          { itemId: itemMap['FLT-003'], warehouseId: whWorkshop.id, requestedQty: 1, issuedQty: 1, usedQty: 1, unitPrice: 70, costPrice: 35, total: 70, status: 'USED' },
          { itemId: itemMap['OIL-001'], warehouseId: whWorkshop.id, requestedQty: 3, issuedQty: 3, usedQty: 3, unitPrice: 55, costPrice: 32, total: 165, status: 'USED' },
        ],
      },
      labors: {
        create: [
          {
            serviceName: 'خرط هوبات واستبدال فحمات أمامية وخلفية',
            technicianId: empMap['EMP-107'], // يوسف فني فرامل
            hours: 2,
            rate: 125,
            total: 250,
            commissionRate: 8,
            commissionAmount: 20,
            status: 'COMPLETED',
          },
          {
            serviceName: 'صيانة دورية للمكيف وفحص التسريب',
            technicianId: empMap['EMP-106'], // سالم فني تكييف
            hours: 1,
            rate: 100,
            total: 100,
            commissionRate: 10,
            commissionAmount: 10,
            status: 'COMPLETED',
          },
        ],
      },
      commissions: {
        create: [
          { employeeId: empMap['EMP-107'], amount: 20, rate: 8, calculatedOn: 250, status: 'PENDING' },
          { employeeId: empMap['EMP-106'], amount: 10, rate: 10, calculatedOn: 100, status: 'PENDING' },
        ],
      },
    },
  });

  // Create Final Sales Invoice for Job Card 1
  await prisma.salesInvoice.create({
    data: {
      invoiceNumber: 'SINV-2026-001',
      customerId: cusMap['CUS-101'],
      vehicleId: vehMap['أ ب ج 1234'],
      repairOrderId: jo1.id,
      warehouseId: whWorkshop.id,
      branchId: branchRiyadh.id,
      invoiceType: 'MAINTENANCE',
      subtotal: 985,
      discount: 35,
      taxAmount: 142.5,
      grandTotal: 1092.5,
      paidAmount: 1092.5,
      remainingAmount: 0,
      paymentMethod: 'SPLIT',
      cashPaid: 500,
      cardPaid: 592.5,
      status: 'PAID',
      notes: 'فاتورة صيانة شاملة لأمر الإصلاح رقم JC-2026-001',
      items: {
        create: [
          { itemId: itemMap['BRK-001'], description: 'طقم أقمشة فرامل أمامية كامري سيراميك', quantity: 1, unitPrice: 220, costPrice: 110, taxRate: 15, taxAmount: 33, total: 253, itemType: 'PART' },
          { itemId: itemMap['BRK-002'], description: 'طقم أقمشة فرامل خلفية كامري', quantity: 1, unitPrice: 180, costPrice: 90, taxRate: 15, taxAmount: 27, total: 207, itemType: 'PART' },
          { itemId: itemMap['FLT-003'], description: 'فلتر مكيف هواء كاربون', quantity: 1, unitPrice: 70, costPrice: 35, taxRate: 15, taxAmount: 10.5, total: 80.5, itemType: 'PART' },
          { itemId: itemMap['OIL-001'], description: 'زيت كاسترول إيدج 5W-30 (3 لتر)', quantity: 3, unitPrice: 55, costPrice: 32, taxRate: 15, taxAmount: 24.75, total: 189.75, itemType: 'PART' },
          { description: 'أجور فك وتركيب فحمات أمامية وخلفية وخرط هوبات', quantity: 1, unitPrice: 250, costPrice: 0, taxRate: 15, taxAmount: 37.5, total: 287.5, itemType: 'LABOR', technicianId: empMap['EMP-107'] },
          { description: 'أجور تنظيف ثلاجة المكيف وتغيير الفلتر وفحص الضغط', quantity: 1, unitPrice: 100, costPrice: 0, taxRate: 15, taxAmount: 15, total: 115, itemType: 'LABOR', technicianId: empMap['EMP-106'] },
        ],
      },
    },
  });

  // Job Card 2: IN PROGRESS (قيد الإصلاح)
  await prisma.repairOrder.create({
    data: {
      orderNumber: 'JC-2026-002',
      customerId: cusMap['CUS-102'],
      vehicleId: vehMap['د هـ و 5678'],
      currentOdometer: 88200,
      fuelLevel: '50%',
      technicianId: empMap['EMP-104'], // محمود ميكانيكا
      serviceAdvisorId: empMap['EMP-102'],
      branchId: branchRiyadh.id,
      customerComplaint: 'حرارة ترتفع عند الوقوف في الزحمة، مع نقص ماء الرديتر كل أسبوع',
      intakeNotes: 'تم فحص غطاء الرديتر ووجد تهريب بلف ومروحة التبريد تصدر صوتاً مرتفعاً',
      status: 'IN_PROGRESS',
      totalParts: 620,
      totalLabor: 280,
      discount: 20,
      taxAmount: 132,
      grandTotal: 1012,
      paidAmount: 0,
      remainingAmount: 1012,
      notes: 'تمت موافقة العميل تليفونياً وجاري استبدال طلمبة الماء والمروحة',
      inspections: {
        create: {
          engineCheck: 'FAIR',
          oilsCheck: 'GOOD',
          brakesCheck: 'GOOD',
          tiresCheck: 'GOOD',
          batteryCheck: 'GOOD',
          electricalCheck: 'GOOD',
          acCheck: 'GOOD',
          suspensionCheck: 'GOOD',
          coolingCheck: 'BAD',
          computerScanCheck: 'GOOD',
          inspectorNotes: 'تهريب واضح من صوفة طلمبة الماء مع ضعف في محرك مروحة الرديتر',
        },
      },
      estimates: {
        create: {
          estimateNumber: 'EST-2026-002',
          subtotalParts: 620,
          subtotalLabor: 280,
          discount: 20,
          taxAmount: 132,
          grandTotal: 1012,
          isApprovedByCustomer: true,
          approvedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          status: 'APPROVED',
          items: {
            create: [
              { type: 'PART', itemId: itemMap['ENG-005'], description: 'طلمبة مياه تبريد محرك سوناتا', quantity: 1, unitPrice: 230, total: 230 },
              { type: 'PART', itemId: itemMap['AC-006'], description: 'مروحة رديتر كهربائية كاملة سوناتا', quantity: 1, unitPrice: 390, total: 390 },
              { type: 'LABOR', description: 'أجور فك وتركيب طلمبة ماء ومروحة وغسيل دورة التبريد', quantity: 1, unitPrice: 280, total: 280 },
            ],
          },
        },
      },
      parts: {
        create: [
          { itemId: itemMap['ENG-005'], warehouseId: whWorkshop.id, requestedQty: 1, issuedQty: 1, usedQty: 0, unitPrice: 230, costPrice: 130, total: 230, status: 'ISSUED' },
          { itemId: itemMap['AC-006'], warehouseId: whWorkshop.id, requestedQty: 1, issuedQty: 1, usedQty: 0, unitPrice: 390, costPrice: 240, total: 390, status: 'ISSUED' },
        ],
      },
      labors: {
        create: [
          {
            serviceName: 'استبدال طلمبة ماء ومروحة تبريد وتفريغ الهواء',
            technicianId: empMap['EMP-104'],
            hours: 3,
            rate: 93.3,
            total: 280,
            commissionRate: 10,
            commissionAmount: 28,
            status: 'IN_PROGRESS',
          },
        ],
      },
    },
  });

  // Job Card 3: PENDING CUSTOMER APPROVAL (بانتظار موافقة العميل)
  await prisma.repairOrder.create({
    data: {
      orderNumber: 'JC-2026-003',
      customerId: cusMap['CUS-104'],
      vehicleId: vehMap['ص ض ط 3456'],
      currentOdometer: 125000,
      fuelLevel: '25%',
      technicianId: empMap['EMP-105'], // عصام كهرباء
      serviceAdvisorId: empMap['EMP-102'],
      branchId: branchRiyadh.id,
      customerComplaint: 'تفتفة وتقطيع في المحرك عند التسارع وعزم ضعيف، مع إضاءة لمبة Check Engine',
      intakeNotes: 'فحص كمبيوتر أظهر أكواد P0300 و P0302 (MisFire سلندر 2)',
      status: 'PENDING_APPROVAL',
      totalParts: 460,
      totalLabor: 200,
      discount: 0,
      taxAmount: 99,
      grandTotal: 759,
      notes: 'تم إعداد عرض السعر وبانتظار اتصال وتأكيد العميل للمباشرة في العمل',
      inspections: {
        create: {
          engineCheck: 'BAD',
          oilsCheck: 'GOOD',
          brakesCheck: 'GOOD',
          tiresCheck: 'GOOD',
          batteryCheck: 'GOOD',
          electricalCheck: 'BAD',
          acCheck: 'GOOD',
          suspensionCheck: 'GOOD',
          coolingCheck: 'GOOD',
          computerScanCheck: 'BAD',
          inspectorNotes: 'كويل رقم 2 تالف تماماً، والبواجي مستهلكة ومنتهية الصلاحية',
          inspectionResults: JSON.stringify(['P0300 Random/Multiple Cylinder Misfire', 'P0302 Cylinder 2 Misfire Detected']),
        },
      },
      estimates: {
        create: {
          estimateNumber: 'EST-2026-003',
          subtotalParts: 460,
          subtotalLabor: 200,
          discount: 0,
          taxAmount: 99,
          grandTotal: 759,
          isApprovedByCustomer: false,
          status: 'PENDING',
          items: {
            create: [
              { type: 'PART', itemId: itemMap['ENG-002'], description: 'طقم بواجي دنسو أصلي (4 حبات)', quantity: 1, unitPrice: 240, total: 240 },
              { type: 'PART', itemId: itemMap['ENG-003'], description: 'كويل إشعال محرك دنسو أصلي', quantity: 1, unitPrice: 175, total: 175 },
              { type: 'PART', itemId: itemMap['FLT-002'], description: 'فلتر هواء محرك', quantity: 1, unitPrice: 85, total: 85 },
              { type: 'LABOR', description: 'أجور فحص وبرمجة كمبيوتر وتغيير بواجي وكويل', quantity: 1, unitPrice: 200, total: 200 },
            ],
          },
        },
      },
    },
  });

  // Job Card 4: READY FOR DELIVERY (جاهز للتسليم)
  await prisma.repairOrder.create({
    data: {
      orderNumber: 'JC-2026-004',
      customerId: cusMap['CUS-103'],
      vehicleId: vehMap['ر ز س 9012'],
      currentOdometer: 34100,
      fuelLevel: '50%',
      technicianId: empMap['EMP-103'],
      serviceAdvisorId: empMap['EMP-102'],
      branchId: branchRiyadh.id,
      customerComplaint: 'صيانة دورية 35 ألف كم: تغيير زيت وفلاتر وفحص تكييف وتربيط عام',
      intakeNotes: 'السيارة بحالة ممتازة وكالة',
      status: 'READY_FOR_DELIVERY',
      totalParts: 340,
      totalLabor: 150,
      discount: 20,
      taxAmount: 70.5,
      grandTotal: 540.5,
      paidAmount: 540.5,
      remainingAmount: 0,
      notes: 'تمت الصيانة وغسيل السيارة بالكامل وجاهزة للاستلام',
      inspections: {
        create: {
          engineCheck: 'GOOD',
          oilsCheck: 'GOOD',
          brakesCheck: 'GOOD',
          tiresCheck: 'GOOD',
          batteryCheck: 'GOOD',
          electricalCheck: 'GOOD',
          acCheck: 'GOOD',
          suspensionCheck: 'GOOD',
          coolingCheck: 'GOOD',
          computerScanCheck: 'GOOD',
          inspectorNotes: 'فحص دوري سليم بنسبة 100%',
        },
      },
      parts: {
        create: [
          { itemId: itemMap['OIL-001'], warehouseId: whWorkshop.id, requestedQty: 5, issuedQty: 5, usedQty: 5, unitPrice: 55, costPrice: 32, total: 275, status: 'USED' },
          { itemId: itemMap['FLT-004'], warehouseId: whWorkshop.id, requestedQty: 1, issuedQty: 1, usedQty: 1, unitPrice: 30, costPrice: 15, total: 30, status: 'USED' },
          { itemId: itemMap['FLT-003'], warehouseId: whWorkshop.id, requestedQty: 1, issuedQty: 1, usedQty: 1, unitPrice: 70, costPrice: 35, total: 70, status: 'USED' },
        ],
      },
      labors: {
        create: [
          {
            serviceName: 'أجور صيانة دورية سريعة وفحص نقاط الأمان',
            technicianId: empMap['EMP-103'],
            hours: 1,
            rate: 150,
            total: 150,
            commissionRate: 10,
            commissionAmount: 15,
            status: 'COMPLETED',
          },
        ],
      },
    },
  });

  // Job Card 5: NEW (جديد بانتظار الفحص)
  await prisma.repairOrder.create({
    data: {
      orderNumber: 'JC-2026-005',
      customerId: cusMap['CUS-105'],
      vehicleId: vehMap['ع غ ف 7890'],
      currentOdometer: 42000,
      fuelLevel: '100%',
      technicianId: empMap['EMP-105'],
      serviceAdvisorId: empMap['EMP-102'],
      branchId: branchRiyadh.id,
      customerComplaint: 'إضاءة لمبة فحص البطارية في الطبلون، وضعف في الأنوار الأمامية أثناء التوقف',
      intakeNotes: 'تم استقبال السيارة بانتظار إدخالها لرافعة الفحص الكهربائي',
      status: 'NEW',
      notes: 'سيارة مرسيدس E300 تحتاج فحص دينامو الشحن والبطارية المساعدة',
    },
  });

  // 18. POS Sales Invoices (Direct retail counter sales)
  await prisma.salesInvoice.create({
    data: {
      invoiceNumber: 'POS-2026-001',
      customerId: cusMap['CUS-106'],
      warehouseId: whMain.id,
      branchId: branchRiyadh.id,
      invoiceType: 'POS',
      date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      subtotal: 540,
      discount: 0,
      taxAmount: 81,
      grandTotal: 621,
      paidAmount: 621,
      remainingAmount: 0,
      paymentMethod: 'CARD',
      cardPaid: 621,
      status: 'PAID',
      notes: 'بيع مباشر من الكاشير - إطار ميشلان فرنسي',
      items: {
        create: [
          {
            itemId: itemMap['TIR-001'],
            description: 'إطار ميشلان بريميسي 4 مقاس 215/55R17 فرنسي',
            quantity: 1,
            unitPrice: 540,
            costPrice: 380,
            taxRate: 15,
            taxAmount: 81,
            total: 621,
            itemType: 'PART',
          },
        ],
      },
    },
  });

  await prisma.salesInvoice.create({
    data: {
      invoiceNumber: 'POS-2026-002',
      customerId: cusMap['CUS-108'],
      warehouseId: whMain.id,
      branchId: branchRiyadh.id,
      invoiceType: 'POS',
      date: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      subtotal: 350,
      discount: 20,
      taxAmount: 49.5,
      grandTotal: 379.5,
      paidAmount: 379.5,
      remainingAmount: 0,
      paymentMethod: 'CASH',
      cashPaid: 379.5,
      status: 'PAID',
      notes: 'بيع نقدي سريع - بطارية هانكوك 70 أمبير',
      items: {
        create: [
          {
            itemId: itemMap['BAT-001'],
            description: 'بطارية هانكوك كوري 70 أمبير جافة 12V',
            quantity: 1,
            unitPrice: 350,
            costPrice: 230,
            taxRate: 15,
            taxAmount: 49.5,
            total: 379.5,
            itemType: 'PART',
          },
        ],
      },
    },
  });

  // 19. Cash Shift & Transactions
  await prisma.cashShift.deleteMany({});
  await prisma.cashShift.create({
    data: {
      shiftNumber: 'SHF-2026-001',
      cashboxId: mainCashbox.id,
      cashierId: empMap['EMP-109'],
      cashierName: 'فهد سليمان المطيري',
      openingBalance: 1500,
      cashSales: 879.5,
      cardSales: 1213.5,
      returnsAmount: 0,
      expensesAmount: 1450,
      expectedCash: 929.5,
      actualCash: 929.5,
      difference: 0,
      status: 'OPEN',
      notes: 'وردية صباحية منتظمة بدون فروقات',
    },
  });

  // 20. Attendance Records for current month
  await prisma.attendance.deleteMany({});
  const today = new Date();
  for (const empCode of Object.keys(empMap)) {
    await prisma.attendance.create({
      data: {
        employeeId: empMap[empCode],
        date: today,
        checkIn: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 0, 0),
        checkOut: null,
        workHours: 8,
        delayMinutes: 0,
        overtimeMinutes: 0,
        status: 'PRESENT',
      },
    });
  }

  // 21. Audit Log entries
  await prisma.auditLog.deleteMany({});
  await prisma.auditLog.create({
    data: {
      action: 'SEED',
      entity: 'System',
      details: 'تم تأسيس وتغذية قاعدة بيانات AutoCare ERP بنجاح بكافة الثوابت والعمليات التجريبية الحية',
    },
  });

  console.log('✅ AutoCare ERP Database Seeding Finished Successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
