export type WorkshopEmployee = {
  id: string;
  name: string;
  code?: string | null;
  phone?: string | null;
  department?: string | null;
  active?: boolean;
  job?: { name?: string | null; nameAr?: string | null } | null;
};

export type WorkshopEmployeeRole = 'technician' | 'serviceAdvisor';

export type WorkshopEmployeeOption = {
  value: string;
  label: string;
  searchText: string;
};

const normalizeRoleText = (value: unknown): string => String(value || '')
  .normalize('NFKC')
  .toLocaleLowerCase('ar')
  .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
  .replace(/[أإآ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/ة/g, 'ه')
  .trim();

const getRoleText = (employee: WorkshopEmployee) => ({
  department: normalizeRoleText(employee.department),
  title: normalizeRoleText([employee.job?.nameAr, employee.job?.name].filter(Boolean).join(' ')),
});

const isTechnician = (employee: WorkshopEmployee): boolean => {
  const { department, title } = getRoleText(employee);
  return /الورشه|الصيانه|workshop|maintenance/.test(department)
    || /(^|\s)فني($|\s)|ميكانيك|كهربائ|تشخيص|technician|mechanic|electrician|automotive tech/.test(title);
};

const isServiceAdvisor = (employee: WorkshopEmployee): boolean => {
  const { department, title } = getRoleText(employee);
  return /استقبال|اداره فنيه|خدمه عملاء|service/.test(department)
    || /استقبال|مهندس(ه)? خدمه|مستشار خدمه|service advisor|service engineer|reception/.test(title);
};

export const getWorkshopEmployeesForRole = (
  employees: WorkshopEmployee[],
  role: WorkshopEmployeeRole,
): { employees: WorkshopEmployee[]; usedFallback: boolean } => {
  const activeEmployees = employees.filter((employee) => employee.active !== false);
  const matches = activeEmployees.filter(role === 'technician' ? isTechnician : isServiceAdvisor);
  const selected = matches.length > 0 ? matches : activeEmployees;

  return {
    employees: [...selected].sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    usedFallback: matches.length === 0 && activeEmployees.length > 0,
  };
};

export const toWorkshopEmployeeOption = (employee: WorkshopEmployee): WorkshopEmployeeOption => {
  const jobTitle = employee.job?.nameAr || employee.job?.name || '';
  const department = employee.department || '';
  const descriptor = jobTitle || department;
  return {
    value: employee.id,
    label: descriptor ? `${employee.name} (${descriptor})` : employee.name,
    searchText: [employee.code, employee.phone, employee.department, employee.job?.nameAr, employee.job?.name]
      .filter(Boolean)
      .join(' '),
  };
};
