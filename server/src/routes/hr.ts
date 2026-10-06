import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { logAudit } from '../middleware/audit';

const router = Router();

// --- Attendance ---
router.get('/attendance', async (req, res) => {
  try {
    const { employeeId, date } = req.query;
    let whereClause: any = {};
    if (employeeId) whereClause.employeeId = String(employeeId);

    const attendances = await prisma.attendance.findMany({
      where: whereClause,
      include: { employee: { include: { job: true } } },
      orderBy: { date: 'desc' },
    });
    res.json(attendances);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/attendance/check-in', async (req, res) => {
  try {
    const { employeeId, notes } = req.body;
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    let record = await prisma.attendance.findFirst({
      where: {
        employeeId,
        date: { gte: startOfDay },
      },
    });

    if (record) {
      return res.status(400).json({ error: 'تم تسجيل حضور هذا الموظف بالفعل اليوم' });
    }

    record = await prisma.attendance.create({
      data: {
        employeeId,
        date: today,
        checkIn: today,
        status: 'PRESENT',
        notes: notes || null,
      },
      include: { employee: true },
    });

    res.status(201).json(record);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/attendance/check-out', async (req, res) => {
  try {
    const { attendanceId } = req.body;
    const now = new Date();

    const record = await prisma.attendance.findUnique({ where: { id: attendanceId } });
    if (!record || !record.checkIn) {
      return res.status(404).json({ error: 'سجل الحضور غير موجود' });
    }

    const diffMs = now.getTime() - new Date(record.checkIn).getTime();
    const hours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;

    const updated = await prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        checkOut: now,
        workHours: hours,
      },
    });

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Technician Commissions (Section 11: عمولات الفنيين) ---
router.get('/commissions', async (req, res) => {
  try {
    const { employeeId, status } = req.query;
    let whereClause: any = {};
    if (employeeId) whereClause.employeeId = String(employeeId);
    if (status) whereClause.status = String(status);

    const commissions = await prisma.commission.findMany({
      where: whereClause,
      include: {
        employee: { include: { job: true } },
        repairOrder: { include: { vehicle: true, customer: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(commissions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Payroll Management (Section 11: مسير الرواتب) ---
router.get('/payroll', async (req, res) => {
  try {
    const { month, year } = req.query;
    let whereClause: any = {};
    if (month) whereClause.month = parseInt(String(month));
    if (year) whereClause.year = parseInt(String(year));

    const payrolls = await prisma.payroll.findMany({
      where: whereClause,
      include: { employee: { include: { job: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(payrolls);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/payroll/generate', async (req, res) => {
  try {
    const { month, year } = req.body;
    const m = parseInt(month) || new Date().getMonth() + 1;
    const y = parseInt(year) || new Date().getFullYear();

    const employees = await prisma.employee.findMany({
      where: { active: true },
      include: {
        commissions: {
          where: { status: 'PENDING' },
        },
      },
    });

    const generatedPayrolls = [];

    for (const emp of employees) {
      // Calculate pending commissions
      const totalCommissions = emp.commissions.reduce((sum, c) => sum + c.amount, 0);
      const basic = emp.salary;
      const allowances = Math.round(basic * 0.1); // 10% demo allowance
      const deductions = 0;
      const netSalary = basic + allowances + totalCommissions - deductions;

      const payroll = await prisma.payroll.create({
        data: {
          employeeId: emp.id,
          month: m,
          year: y,
          basicSalary: basic,
          allowances,
          commissions: totalCommissions,
          overtimeAmount: 0,
          deductions,
          advances: 0,
          netSalary,
          status: 'DRAFT',
          notes: `مسير رواتب شهر ${m}/${y}`,
        },
        include: { employee: true },
      });

      generatedPayrolls.push(payroll);
    }

    await logAudit({
      action: 'GENERATE_PAYROLL',
      entity: 'Payroll',
      details: `توليد مسير الرواتب لشهر ${m}/${y} لعدد ${employees.length} موظف`,
    });

    res.status(201).json(generatedPayrolls);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
