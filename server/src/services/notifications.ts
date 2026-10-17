import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { getWhatsappQrStatus, sendWhatsappQrMessage } from './whatsappQr';
import { getTelegramQrStatus, sendTelegramQrMessage } from './telegramQr';
import { getNotificationRetryDelayMs } from './notificationRetry';

export type NotificationChannel = 'whatsapp' | 'telegram';
export type NotificationOptions = {
  userActivity: boolean;
  sales: boolean;
  profits: boolean;
  invoices: boolean;
  shortages: boolean;
  updates: boolean;
  shiftSummary: boolean;
};
type IntegrationState = {
  whatsappPhone: string;
  options: NotificationOptions;
  shiftEndTime: string;
  timeZone: string;
};

const optionKeys: (keyof NotificationOptions)[] = [
  'userActivity', 'sales', 'profits', 'invoices', 'shortages', 'updates', 'shiftSummary',
];
const defaultOptions: NotificationOptions = {
  userActivity: false,
  sales: false,
  profits: false,
  invoices: false,
  shortages: false,
  updates: false,
  shiftSummary: false,
};

const integrationRow = () => prisma.notificationIntegration.upsert({
  where: { id: 1 },
  create: { id: 1 },
  update: {},
});

export const getIntegrationState = async (): Promise<IntegrationState> => {
  return (await readIntegrationState()).state;
};

const readIntegrationState = async () => {
  const row = await integrationRow();
  return {
    state: {
      whatsappPhone: row.whatsappPhone || '',
      options: { ...defaultOptions, ...JSON.parse(row.options) },
      shiftEndTime: row.shiftEndTime,
      timeZone: row.timeZone,
    } as IntegrationState,
  };
};

export const getIntegrationStatus = async () => {
  const { state } = await readIntegrationState();
  const whatsapp = await getWhatsappQrStatus();
  const telegram = await getTelegramQrStatus();
  return {
    whatsapp: {
      connected: whatsapp.connected,
      connecting: whatsapp.connecting,
      phoneNumber: whatsapp.phoneNumber,
      recipientPhone: state.whatsappPhone,
      qrCode: whatsapp.qrCode,
      error: whatsapp.error,
    },
    telegram,
    options: state.options,
    shiftEndTime: state.shiftEndTime,
    timeZone: state.timeZone,
  };
};

export const saveIntegrationSettings = async (input: Record<string, unknown>) => {
  const { state: current } = await readIntegrationState();
  const whatsappPhone = typeof input.whatsappPhone === 'string' && input.whatsappPhone.trim()
    ? input.whatsappPhone.trim()
    : current.whatsappPhone;
  const rawOptions = input.options && typeof input.options === 'object'
    ? input.options as Record<string, unknown>
    : current.options;
  const options = Object.fromEntries(optionKeys.map((key) => [
    key,
    typeof rawOptions[key] === 'boolean' ? rawOptions[key] : current.options[key],
  ])) as NotificationOptions;
  const shiftEndTime = typeof input.shiftEndTime === 'string' && /^\d{2}:\d{2}$/.test(input.shiftEndTime)
    ? input.shiftEndTime
    : current.shiftEndTime;
  if (Number(shiftEndTime.slice(0, 2)) > 23 || Number(shiftEndTime.slice(3)) > 59) {
    throw new Error('Shift summary time is invalid');
  }
  if (input.timeZone !== undefined && input.timeZone !== 'Africa/Cairo') {
    throw new Error('Shift summary time zone must be Africa/Cairo');
  }
  await prisma.notificationIntegration.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      whatsapp: null,
      whatsappPhone,
      telegram: null,
      options: JSON.stringify(options),
      shiftEndTime,
      timeZone: 'Africa/Cairo',
    },
    update: {
      whatsapp: null,
      whatsappPhone,
      telegram: null,
      options: JSON.stringify(options),
      shiftEndTime,
      timeZone: 'Africa/Cairo',
    },
  });
  return getIntegrationStatus();
};

const sendToChannel = async (
  channel: NotificationChannel,
  text: string,
  state?: IntegrationState,
  recipient?: string | null,
) => {
  const settings = state || await getIntegrationState();
  if (channel === 'whatsapp') {
    const phoneNumber = recipient || settings.whatsappPhone;
    if (!phoneNumber) throw new Error('Set the WhatsApp recipient phone number in integration settings');
    await sendWhatsappQrMessage(phoneNumber, text);
    return;
  }
  if (channel === 'telegram') {
    await sendTelegramQrMessage(text);
    return;
  }
};

const enqueueNotification = (channel: NotificationChannel, eventKey: string, message: string, recipient?: string) =>
  prisma.notificationDelivery.upsert({
    where: { channel_eventKey: { channel, eventKey } },
    create: { channel, eventKey, message, recipient, status: 'PENDING', nextAttemptAt: new Date() },
    update: {},
  });

export const processNotificationOutbox = async () => {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 10 * 60 * 1000);
  const pending = await prisma.notificationDelivery.findMany({
    where: {
      OR: [
        { status: 'PENDING', nextAttemptAt: { lte: now } },
        { status: 'SENDING', updatedAt: { lt: staleBefore } },
      ],
    },
    orderBy: { nextAttemptAt: 'asc' },
    take: 50,
  });

  for (const delivery of pending) {
    const claimWhere = delivery.status === 'SENDING'
      ? { id: delivery.id, status: 'SENDING', updatedAt: { lt: staleBefore } }
      : { id: delivery.id, status: 'PENDING', nextAttemptAt: { lte: now } };
    const claimed = await prisma.notificationDelivery.updateMany({
      where: claimWhere,
      data: { status: 'SENDING', attemptCount: { increment: 1 }, updatedAt: now },
    });
    if (claimed.count !== 1) continue;

    try {
      if (delivery.channel !== 'whatsapp' && delivery.channel !== 'telegram') {
        throw new Error(`Unsupported notification channel: ${delivery.channel}`);
      }
      if (!delivery.message) throw new Error('Queued notification has no message payload');
      await sendToChannel(delivery.channel, delivery.message, undefined, delivery.recipient);
      await prisma.notificationDelivery.updateMany({
        where: { id: delivery.id, status: 'SENDING' },
        data: { status: 'SENT', sentAt: new Date(), lastError: null },
      });
      if (delivery.eventKey.startsWith('maintenance-reminder:')) {
        const reminderId = delivery.eventKey.slice('maintenance-reminder:'.length);
        try {
          await prisma.maintenanceReminder.updateMany({
            where: { id: reminderId, status: 'PENDING' },
            data: { status: 'SENT', sentAt: new Date() },
          });
        } catch (error) {
          console.error(`Maintenance reminder status update failed (${reminderId}); notification was delivered:`, error);
        }
      }
    } catch (error) {
      const attemptCount = delivery.attemptCount + 1;
      const reason = error instanceof Error ? error.message : String(error);
      await prisma.notificationDelivery.updateMany({
        where: { id: delivery.id, status: 'SENDING' },
        data: {
          status: 'PENDING',
          nextAttemptAt: new Date(Date.now() + getNotificationRetryDelayMs(attemptCount)),
          lastError: reason.slice(0, 1000),
        },
      });
      console.error(`Notification delivery deferred (${delivery.eventKey}, ${delivery.channel}, attempt ${attemptCount}):`, error);
    }
  }
};

export const testIntegration = async (
  channel: NotificationChannel,
  input: Record<string, unknown>,
) => {
  const { state } = await readIntegrationState();
  if (channel === 'telegram') {
    const telegram = await getTelegramQrStatus();
    if (!telegram.connected) throw new Error('Connect Telegram by scanning the QR code first');
    await sendTelegramQrMessage('تم اختبار اتصال Alasly بنجاح.');
    return { success: true, account: telegram.account };
  }
  const whatsapp = await getWhatsappQrStatus();
  const phoneNumber = typeof input.phoneNumber === 'string' && input.phoneNumber.trim()
    ? input.phoneNumber.trim() : state.whatsappPhone;
  if (!whatsapp.connected) throw new Error('Connect WhatsApp by scanning the QR code first');
  if (!phoneNumber) throw new Error('WhatsApp recipient phone is required');
  await sendWhatsappQrMessage(phoneNumber, 'تم اختبار اتصال Alasly بنجاح.');
  return { success: true, account: phoneNumber };
};

type NotificationCategory = keyof Omit<NotificationOptions, 'shiftSummary'>;
export const notifyEvent = async (category: NotificationCategory, text: string) => {
  try {
    const state = await getIntegrationState();
    if (!state.options[category]) return;
    await sendToConfiguredChannels(text, state, category, `event:${category}:${randomUUID()}`);
  } catch (error) {
    console.error(`Notification could not be prepared (${category}):`, error);
  }
};

const sendToConfiguredChannels = async (text: string, state: IntegrationState, category: string, eventKey: string) => {
  const channels: NotificationChannel[] = [];
  if (state.whatsappPhone && (await getWhatsappQrStatus()).connected) channels.push('whatsapp');
  if ((await getTelegramQrStatus()).connected) channels.push('telegram');
  if (!channels.length) return;
  await Promise.all(channels.map((channel) =>
    enqueueNotification(channel, `${eventKey}:${category}`, text, channel === 'whatsapp' ? state.whatsappPhone : undefined)));
  await processNotificationOutbox();
};

export const notifyAuditActivity = async (auditId: string) => {
  try {
    const state = await getIntegrationState();
    const audit = await prisma.auditLog.findUnique({
      where: { id: auditId },
      include: { user: { select: { fullName: true, username: true } } },
    });
    if (!audit) return;
    const categories: string[] = [];
    if (state.options.userActivity) categories.push('نشاط مستخدم');
    if (audit.entity === 'SalesInvoice') {
      if (state.options.invoices) categories.push('فاتورة بيع');
      if (state.options.sales) categories.push('مبيعات');
      if (state.options.profits) categories.push('ملخص ربح الفاتورة');
    }
    if (audit.entity === 'PurchaseInvoice' && state.options.invoices) categories.push('فاتورة مشتريات');
    if (audit.entity === 'PurchaseRequest' && state.options.shortages) categories.push('طلب نواقص');
    if (audit.action === 'UPDATE' && state.options.updates) categories.push('تعديل بيانات النظام');
    let details = audit.details || `${audit.action} ${audit.entity}`;
    if (audit.entity === 'SalesInvoice' && audit.entityId
      && (categories.length > 0 || state.options.shortages)) {
      const invoice = await prisma.salesInvoice.findUnique({
        where: { id: audit.entityId },
        include: {
          items: {
            select: {
              quantity: true,
              unitPrice: true,
              costPrice: true,
              item: { select: { nameAr: true, minStock: true, stockBalances: { select: { quantity: true, reservedQty: true } } } },
            },
          },
        },
      });
      if (invoice) {
        const profit = invoice.items.reduce(
          (sum, item) => sum + (item.unitPrice - item.costPrice) * item.quantity,
          0,
        );
        const lowStockNames = state.options.shortages
          ? invoice.items
            .filter((item) => item.item && item.item.stockBalances.reduce(
              (sum, stock) => sum + stock.quantity - stock.reservedQty,
              0,
            ) <= item.item.minStock)
            .map((item) => item.item?.nameAr)
            .filter((name): name is string => Boolean(name))
          : [];
        if (lowStockNames.length) categories.push(`نواقص المخزون: ${[...new Set(lowStockNames)].join('، ')}`);
        details = [
          invoice.invoiceNumber,
          `الإجمالي ${invoice.grandTotal.toFixed(2)}`,
          ...(state.options.profits ? [`الربح الإجمالي التقديري ${profit.toFixed(2)}`] : []),
        ].join(' | ');
      }
    }
    if (!categories.length) return;
    const actor = audit.user?.fullName || audit.user?.username || 'النظام';
    await sendToConfiguredChannels(
      `${categories.join('، ')}\nالمستخدم: ${actor}\n${details}`,
      state,
      categories.join(','),
      `audit:${audit.id}`,
    );
  } catch (error) {
    console.error('Audit notification could not be prepared:', error);
  }
};

const zonedUtc = (date: string, hour: number, minute: number, timeZone: string) => {
  const [year, month, day] = date.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(guess));
    const part = (key: string) => Number(parts.find((value) => value.type === key)?.value);
    guess += target - Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
  }
  return new Date(guess);
};

const createShiftSummary = async (start: Date, end: Date) => {
  const [invoices, expenses, lowStock, activities] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: { createdAt: { gte: start, lt: end }, status: { not: 'CANCELLED' } },
      include: { items: { select: { quantity: true, unitPrice: true, costPrice: true } } },
    }),
    prisma.expense.aggregate({
      where: { date: { gte: start, lt: end } },
      _sum: { totalAmount: true },
    }),
    prisma.item.findMany({
      where: { active: true },
      select: {
        nameAr: true,
        minStock: true,
        stockBalances: { select: { quantity: true, reservedQty: true } },
      },
    }),
    prisma.auditLog.count({ where: { createdAt: { gte: start, lt: end } } }),
  ]);
  const salesTotal = invoices.reduce((sum, invoice) => sum + invoice.grandTotal, 0);
  const grossProfit = invoices.reduce((sum, invoice) => sum + invoice.items.reduce(
    (itemTotal, item) => itemTotal + (item.unitPrice - item.costPrice) * item.quantity,
    0,
  ), 0);
  const expenseTotal = expenses._sum.totalAmount || 0;
  const shortageNames = lowStock
    .filter((item) => item.stockBalances.reduce((sum, stock) => sum + stock.quantity - stock.reservedQty, 0) <= item.minStock)
    .slice(0, 8)
    .map((item) => item.nameAr);
  return [
    'ملخص نهاية الوردية - Alasly',
    `الفترة: ${start.toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })} إلى ${end.toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}`,
    `عدد فواتير البيع: ${invoices.length}`,
    `إجمالي المبيعات: ${salesTotal.toFixed(2)}`,
    `الربح الإجمالي التقديري: ${grossProfit.toFixed(2)}`,
    `المصروفات المسجلة: ${expenseTotal.toFixed(2)}`,
    `صافي تقديري بعد المصروفات: ${(grossProfit - expenseTotal).toFixed(2)}`,
    `عمليات المستخدمين المسجلة: ${activities}`,
    `أصناف عند حد النقص أو أقل: ${shortageNames.length ? shortageNames.join('، ') : 'لا يوجد'}`,
  ].join('\n');
};

export const sendShiftSummary = async (date: string) => {
  const state = await getIntegrationState();
  if (!state.options.shiftSummary) return;
  const start = zonedUtc(date, 0, 0, state.timeZone);
  const [year, month, day] = date.split('-').map(Number);
  const nextDate = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  const end = zonedUtc(nextDate, 0, 0, state.timeZone);
  const summary = await createShiftSummary(start, end);
  for (const channel of ['whatsapp', 'telegram'] as NotificationChannel[]) {
    const configured = channel === 'whatsapp'
      ? Boolean(state.whatsappPhone && (await getWhatsappQrStatus()).connected)
      : (await getTelegramQrStatus()).connected;
    if (!configured) continue;
    const eventKey = `shift-summary:${date}`;
    await enqueueNotification(
      channel,
      eventKey,
      summary,
      channel === 'whatsapp' ? state.whatsappPhone : undefined,
    );
  }
};

const sendDueMaintenanceReminders = async () => {
  const now = new Date();
  const cutoff = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const retryAfter = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const whatsapp = await getWhatsappQrStatus();
  if (!whatsapp.connected) return;

  const reminders = await prisma.maintenanceReminder.findMany({
    where: {
      status: 'PENDING',
      OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lt: retryAfter } }],
    },
    include: { vehicle: { include: { customer: true } } },
    orderBy: { createdAt: 'asc' },
    take: 500,
  });

  for (const reminder of reminders) {
    const dueByDate = reminder.dueDate !== null && reminder.dueDate <= cutoff;
    const dueByOdometer = reminder.dueOdometer !== null
      && reminder.vehicle.currentOdometer >= reminder.dueOdometer - 500;
    const customer = reminder.vehicle.customer;
    if ((!dueByDate && !dueByOdometer) || !customer.whatsappOptIn || !customer.whatsappNumber) continue;

    const eventKey = `maintenance-reminder:${reminder.id}`;
    const due = reminder.dueDate
      ? `التاريخ المقترح: ${reminder.dueDate.toLocaleDateString('ar-EG')}`
      : `العداد المستهدف: ${reminder.dueOdometer?.toLocaleString('ar-EG')} كم`;
    await enqueueNotification(
      'whatsapp',
      eventKey,
      `تذكير صيانة من مركز المحترف: حان موعد ${reminder.serviceName} لسيارتك ${reminder.vehicle.make} ${reminder.vehicle.model}. ${due}`,
      customer.whatsappNumber,
    );
    await prisma.maintenanceReminder.updateMany({
      where: { id: reminder.id },
      data: { lastAttemptAt: now },
    });
  }
};

let schedulerStarted = false;
export const startNotificationScheduler = () => {
  if (schedulerStarted) return;
  schedulerStarted = true;
  let running = false;
  let schedulerErrorLogged = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const state = await getIntegrationState();
      schedulerErrorLogged = false;
      await sendDueMaintenanceReminders();
      await processNotificationOutbox();
      if (!state.options.shiftSummary) return;
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: state.timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(new Date());
      const part = (key: string) => parts.find((value) => value.type === key)?.value || '';
      const nowMinutes = Number(part('hour')) * 60 + Number(part('minute'));
      const [targetHour, targetMinute] = state.shiftEndTime.split(':').map(Number);
      if (nowMinutes >= targetHour * 60 + targetMinute) {
        await sendShiftSummary(`${part('year')}-${part('month')}-${part('day')}`);
        await processNotificationOutbox();
      }
    } catch (error) {
      if (!schedulerErrorLogged) {
        console.error('Shift summary scheduler failed:', error);
        schedulerErrorLogged = true;
      }
    } finally {
      running = false;
    }
  }, 30_000);
};
