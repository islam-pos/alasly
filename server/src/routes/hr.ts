import { Router } from 'express';
import { Prisma } from '../lib/prisma-client';
import { prisma } from '../lib/prisma';
import { logAudit } from '../middleware/audit';

const router = Router();
const CAIRO_TIME_ZONE = 'Africa/Cairo';
const DEFAULT_STANDARD_MONTHLY_HOURS = 208;
const fs = require('fs');
const path = require('path');

const saveAttendanceFaceImage = (employeeId: string, kind: 'check-in' | 'check-out', dataUrl: string) => {
  const match = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error('صيغة صورة الوردية غير مدعومة');
  const extension = match[1] === 'jpeg' ? 'jpg' : match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 4 * 1024 * 1024) throw new Error('صورة الوردية غير صالحة');
  const dataDirectory = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.resolve(require('os').homedir(), 'autocare-erp-data');
  const directory = path.join(dataDirectory, 'attendance-faces');
  fs.mkdirSync(directory, { recursive: true });
  const fileName = `${kind}-${employeeId}-${Date.now()}.${extension}`;
  const filePath = path.join(directory, fileName);
  fs.writeFileSync(filePath, buffer, { mode: 0o600 });
  return path.relative(dataDirectory, filePath).replace(/\\/g, '/');
};

const cairoParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CAIRO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => Number(parts.find((value) => value.type === type)?.value);
  return { year: part('year'), month: part('month'), day: part('day') };
};

const cairoOffsetAt = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CAIRO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: string) => Number(parts.find((value) => value.type === type)?.value);
  const asUtc = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
  return asUtc - date.getTime();
};

const cairoMidnightUtc = (year: number, month: number, day: number) => {
  const nominalUtc = new Date(Date.UTC(year, month - 1, day));
  return new Date(nominalUtc.getTime() - cairoOffsetAt(nominalUtc));
};

const monthRangeUtc = (year: number, month: number) => ({
  start: cairoMidnightUtc(year, month, 1),
  end: month === 12 ? cairoMidnightUtc(year + 1, 1, 1) : cairoMidnightUtc(year, month + 1, 1),
});

const roundMoney = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;
const isUniqueConstraintError = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

const getHrSetting = async () => {
  const setting = await prisma.hrSetting.upsert({
    where: { id: 1 },
    create: { id: 1, standardMonthlyHours: DEFAULT_STANDARD_MONTHLY_HOURS },
    update: {},
  });
  return setting;
};

const generatePayrollForMonth = async (month: number, year: number) => {
  const setting = await getHrSetting();
  const { start, end } = monthRangeUtc(year, month);
  const employees = await prisma.employee.findMany({
    where: { active: true },
  });
  const generated: any[] = [];

  for (const employee of employees) {
    try {
      const payroll = await prisma.$transaction(async (transaction) => {
        const existing = await transaction.payroll.findFirst({
          where: { employeeId: employee.id, month, year },
        });
        if (existing) return null;

        const [attendance, pendingCommissions] = await Promise.all([
          transaction.attendance.findMany({
            where: {
              employeeId: employee.id,
              date: { gte: start, lt: end },
              checkIn: { not: null },
              checkOut: { not: null },
            },
            select: { checkIn: true, checkOut: true, workMinutes: true },
          }),
          transaction.commission.findMany({
            where: {
              employeeId: employee.id,
              status: 'PENDING',
              createdAt: { gte: start, lt: end },
            },
            select: { amount: true },
          }),
        ]);
        const attendedMinutes = attendance.reduce((total, record) => {
          if (record.workMinutes !== null) return total + Math.max(0, record.workMinutes);
          if (!record.checkIn || !record.checkOut) return total;
          return total + Math.max(0, Math.floor((record.checkOut.getTime() - record.checkIn.getTime()) / 60_000));
        }, 0);
        const hourlyRate = employee.salary / setting.standardMonthlyHours;
        const regularPay = roundMoney((hourlyRate * attendedMinutes) / 60);
        const commissions = roundMoney(pendingCommissions.reduce((sum, commission) => sum + commission.amount, 0));
        const netSalary = roundMoney(regularPay + commissions);

        return transaction.payroll.create({
          data: {
            employeeId: employee.id,
            month,
            year,
            basicSalary: regularPay,
            standardMonthlyHours: setting.standardMonthlyHours,
            attendedMinutes,
            allowances: 0,
            commissions,
            overtimeAmount: 0,
            deductions: 0,
            advances: 0,
            netSalary,
            status: 'DRAFT',
            notes: `أجر الساعات الفعلية ${attendedMinutes} دقيقة من ${setting.standardMonthlyHours} ساعة معيارية، بالإضافة إلى العمولات المستحقة خلال الشهر`,
          },
          include: { employee: true },
        });
      });
      if (payroll) generated.push(payroll);
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      // A concurrent request or scheduler already created this employee's monthly payroll.
    }
  }
  return generated;
};

// --- HR payroll settings ---
router.get('/settings', async (_req, res) => {
  try {
    res.json(await getHrSetting());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const standardMonthlyHours = Number(req.body?.standardMonthlyHours);
    if (!Number.isFinite(standardMonthlyHours) || standardMonthlyHours < 1 || standardMonthlyHours > 744) {
      return res.status(400).json({ error: 'يجب أن تكون ساعات العمل الشهرية بين 1 و744 ساعة' });
    }
    const setting = await prisma.hrSetting.upsert({
      where: { id: 1 },
      create: { id: 1, standardMonthlyHours },
      update: { standardMonthlyHours },
    });
    return res.json(setting);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// --- Attendance ---
router.get('/attendance', async (req, res) => {
  try {
    const { employeeId, date } = req.query;
    const whereClause: any = {};
    if (employeeId) whereClause.employeeId = String(employeeId);
    if (date) {
      const parsed = new Date(String(date));
      if (Number.isNaN(parsed.getTime())) return res.status(400).json({ error: 'تاريخ الحضور غير صالح' });
      const parts = cairoParts(parsed);
      whereClause.date = { gte: cairoMidnightUtc(parts.year, parts.month, parts.day), lt: cairoMidnightUtc(parts.year, parts.month, parts.day + 1) };
    }

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
    const employeeId = typeof req.body?.employeeId === 'string' ? req.body.employeeId.trim() : '';
    if (!employeeId) return res.status(400).json({ error: 'يجب اختيار موظف صالح' });
    const faceImage = typeof req.body?.faceImage === 'string' ? req.body.faceImage : '';
    if (!faceImage || !faceImage.startsWith('data:image/')) {
      return res.status(400).json({ error: 'يجب فتح الكاميرا والتقاط صورة الوجه لبدء الوردية' });
    }
    if (faceImage.length > 6_000_000) {
      return res.status(400).json({ error: 'صورة الوردية كبيرة جدًا' });
    }
    const employeeRecord = await prisma.employee.findFirst({
      where: { id: employeeId, active: true },
      select: { id: true, name: true },
    });
    if (!employeeRecord) return res.status(404).json({ error: 'الموظف غير موجود أو غير نشط' });
    const employee = await prisma.employee.findFirst({ where: { id: employeeId, active: true }, select: { id: true } });
    if (!employee) return res.status(404).json({ error: 'الموظف غير موجود أو غير نشط' });

    const now = new Date();
    const { year, month, day } = cairoParts(now);
    const dayStart = cairoMidnightUtc(year, month, day);
    const dayEnd = cairoMidnightUtc(year, month, day + 1);
    const openShift = await prisma.attendance.findFirst({ where: { employeeId, checkIn: { not: null }, checkOut: null } });
    if (openShift) return res.status(409).json({ error: 'لدى الموظف وردية مفتوحة؛ سجّل الانصراف أولاً' });
    const existingToday = await prisma.attendance.findFirst({
      where: { employeeId, date: { gte: dayStart, lt: dayEnd } },
    });
    if (existingToday) return res.status(409).json({ error: 'تم تسجيل حضور هذا الموظف بالفعل اليوم' });

    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';
    const checkInPhotoUrl = saveAttendanceFaceImage(employeeId, 'check-in', faceImage);
    const record = await prisma.attendance.create({
      data: {
        employeeId,
        date: now,
        checkIn: now,
        checkInPhotoUrl,
        checkInDevice: typeof req.body?.deviceName === 'string' ? req.body.deviceName.trim().slice(0, 200) : null,
        status: 'PRESENT',
        notes: notes || null,
      },
      include: { employee: true },
    });
    return res.status(201).json(record);
  } catch (err: any) {
    if (isUniqueConstraintError(err)) return res.status(409).json({ error: 'لدى الموظف وردية مفتوحة بالفعل' });
    return res.status(400).json({ error: err.message });
  }
});

router.post('/attendance/check-out', async (req, res) => {
  try {
    const attendanceId = typeof req.body?.attendanceId === 'string' ? req.body.attendanceId.trim() : '';
    if (!attendanceId) return res.status(400).json({ error: 'معرّف سجل الحضور مطلوب' });
    const faceImage = typeof req.body?.faceImage === 'string' ? req.body.faceImage : '';
    if (!faceImage || !faceImage.startsWith('data:image/')) {
      return res.status(400).json({ error: 'يجب فتح الكاميرا والتقاط صورة الوجه لإنهاء الوردية' });
    }
    const record = await prisma.attendance.findUnique({ where: { id: attendanceId } });
    if (!record || !record.checkIn) return res.status(404).json({ error: 'سجل الحضور غير موجود' });
    if (record.checkOut) return res.status(409).json({ error: 'تم تسجيل الانصراف لهذا السجل بالفعل' });

    const now = new Date();
    const workMinutes = Math.floor((now.getTime() - record.checkIn.getTime()) / 60_000);
    if (workMinutes <= 0) return res.status(400).json({ error: 'وقت الانصراف يجب أن يكون بعد وقت الحضور بدقيقة واحدة على الأقل' });
    const checkOutPhotoUrl = saveAttendanceFaceImage(record.employeeId, 'check-out', faceImage);
    const result = await prisma.attendance.updateMany({
      where: { id: attendanceId, checkOut: null, checkIn: { lte: now } },
      data: {
        checkOut: now,
        workMinutes,
        workHours: workMinutes / 60,
        checkOutPhotoUrl,
        checkOutDevice: typeof req.body?.deviceName === 'string' ? req.body.deviceName.trim().slice(0, 200) : null,
      },
    });
    if (!result.count) return res.status(409).json({ error: 'تم إغلاق الوردية بالفعل أو أن سجل الحضور غير صالح' });
    return res.json(await prisma.attendance.findUnique({ where: { id: attendanceId } }));
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// --- Technician Commissions ---
router.get('/commissions', async (req, res) => {
  try {
    const { employeeId, status } = req.query;
    const whereClause: any = {};
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

// --- Payroll Management ---
router.get('/payroll', async (req, res) => {
  try {
    const { month, year } = req.query;
    const whereClause: any = {};
    if (month) whereClause.month = parseInt(String(month), 10);
    if (year) whereClause.year = parseInt(String(year), 10);

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
    const month = Number(req.body?.month);
    const year = Number(req.body?.year);
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 9999) {
      return res.status(400).json({ error: 'الشهر أو السنة غير صالحين' });
    }
    const generatedPayrolls = await generatePayrollForMonth(month, year);
    await logAudit({
      action: 'GENERATE_PAYROLL',
      entity: 'Payroll',
      details: `توليد مسير الرواتب لشهر ${month}/${year} لعدد ${generatedPayrolls.length} موظف`,
    });
    return res.status(200).json(generatedPayrolls);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

let payrollSchedulerStarted = false;
export const startHrPayrollScheduler = () => {
  if (payrollSchedulerStarted) return;
  payrollSchedulerStarted = true;
  let running = false;
  let lastCheckedDate = '';

  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: CAIRO_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date());
      const part = (type: string) => parts.find((value) => value.type === type)?.value || '';
      if (part('day') !== '01') return;
      const dateKey = `${part('year')}-${part('month')}-${part('day')}`;
      if (lastCheckedDate === dateKey) return;
      const year = Number(part('year'));
      const currentMonth = Number(part('month'));
      const targetMonth = currentMonth === 1 ? 12 : currentMonth - 1;
      const targetYear = currentMonth === 1 ? year - 1 : year;
      await generatePayrollForMonth(targetMonth, targetYear);
      lastCheckedDate = dateKey;
      await logAudit({
        action: 'GENERATE_PAYROLL',
        entity: 'Payroll',
        details: `التوليد التلقائي لمسير شهر ${targetMonth}/${targetYear} بتوقيت القاهرة`,
      });
    } catch (error) {
      console.error('HR monthly payroll scheduler failed:', error);
    } finally {
      running = false;
    }
  }, 30_000);
};

startHrPayrollScheduler();

export default router;
