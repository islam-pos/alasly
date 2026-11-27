import { describe, expect, it } from 'vitest';
import { getWorkshopEmployeesForRole, toWorkshopEmployeeOption } from './workshopEmployees';

const employees = [
  { id: 'tech-ar', name: 'أحمد فني', active: true, department: 'صيانة', job: { nameAr: 'فني ميكانيكا' } },
  { id: 'tech-en', name: 'Sam', active: true, department: 'Workshop', job: { name: 'Technician' } },
  { id: 'advisor', name: 'منى', active: true, department: 'الإدارة الفنية', job: { nameAr: 'مهندسة خدمة' } },
  { id: 'inactive', name: 'فني سابق', active: false, department: 'الورشة', job: { nameAr: 'فني' } },
  { id: 'cashier', name: 'أمين', active: true, department: 'الحسابات', job: { nameAr: 'محاسب' } },
];

describe('workshop employee role selection', () => {
  it('recognizes Arabic job.nameAr and English technician titles while excluding inactive staff', () => {
    const result = getWorkshopEmployeesForRole(employees, 'technician');
    expect(result.employees.map((employee) => employee.id)).toEqual(['tech-ar', 'tech-en']);
    expect(result.usedFallback).toBe(false);
  });

  it('recognizes service advisors by department or job title', () => {
    const result = getWorkshopEmployeesForRole(employees, 'serviceAdvisor');
    expect(result.employees.map((employee) => employee.id)).toEqual(['advisor']);
    expect(result.usedFallback).toBe(false);
  });

  it('recognizes a feminine Arabic service-engineer title without relying on department', () => {
    const result = getWorkshopEmployeesForRole([
      { id: 'advisor-title', name: 'سلمى', active: true, job: { name: 'مهندسة خدمة' } },
    ], 'serviceAdvisor');
    expect(result.employees.map((employee) => employee.id)).toEqual(['advisor-title']);
    expect(result.usedFallback).toBe(false);
  });

  it('falls back to active employees when role labels are missing so the picker is not empty', () => {
    const result = getWorkshopEmployeesForRole([
      { id: 'one', name: 'موظف', active: true, department: 'الإدارة', job: { name: 'موظف' } },
      { id: 'two', name: 'معطل', active: false, department: 'الورشة' },
    ], 'technician');
    expect(result.employees.map((employee) => employee.id)).toEqual(['one']);
    expect(result.usedFallback).toBe(true);
  });

  it('includes the Arabic job title in the displayed label and search text', () => {
    const option = toWorkshopEmployeeOption(employees[0]);
    expect(option.label).toBe('أحمد فني (فني ميكانيكا)');
    expect(option.searchText).toContain('فني ميكانيكا');
  });
});
