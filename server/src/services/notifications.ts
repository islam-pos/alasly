import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scryptSync } from 'crypto';
import { prisma } from '../lib/prisma';
import { getWhatsappQrStatus, sendWhatsappQrMessage } from './whatsappQr';

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
type TelegramConfig = { botToken: string; chatId: string };
type IntegrationState = {
  whatsappPhone: string;
  telegram?: TelegramConfig;
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

const encryptionKey = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes to encrypt integration credentials');
  }
  return scryptSync(secret, 'alasly-notification-integrations-v1', 32);
};

const encrypt = (value: unknown) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`;
};

const decrypt = <T>(value: string): T => {
  const [version, iv, tag, data] = value.split(':');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Stored integration credentials have an unsupported format');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(data, 'base64')),
    decipher.final(),
  ]).toString('utf8')) as T;
};

const nonEmpty = (value: unknown, name: string) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
};

const integrationRow = () => prisma.notificationIntegration.upsert({
  where: { id: 1 },
  create: { id: 1 },
  update: {},
});

export const getIntegrationState = async (): Promise<IntegrationState> => {
  const result = await readIntegrationState();
  if (result.credentialsResetRequired) {
    throw new Error('Integration credentials cannot be decrypted; re-enter the affected credentials in notification settings');
  }
  return result.state;
};

const readIntegrationState = async () => {
  const row = await integrationRow();
  let credentialsResetRequired = false;
  const readCredential = <T>(value: string | null) => {
    if (!value) return undefined;
    try {
      return decrypt<T>(value);
    } catch {
      credentialsResetRequired = true;
      return undefined;
    }
  };
  const telegram = readCredential<TelegramConfig>(row.telegram);
  return {
    state: {
      whatsappPhone: row.whatsappPhone || '',
      ...(telegram ? { telegram } : {}),
      options: { ...defaultOptions, ...JSON.parse(row.options) },
      shiftEndTime: row.shiftEndTime,
      timeZone: row.timeZone,
    } as IntegrationState,
    credentialsResetRequired,
  };
};

export const getIntegrationStatus = async () => {
  const { state, credentialsResetRequired } = await readIntegrationState();
  const whatsapp = await getWhatsappQrStatus();
  return {
    whatsapp: {
      connected: whatsapp.connected,
      connecting: whatsapp.connecting,
      phoneNumber: whatsapp.phoneNumber,
      recipientPhone: state.whatsappPhone,
      qrCode: whatsapp.qrCode,
      error: whatsapp.error,
    },
    telegram: {
      connected: Boolean(state.telegram?.botToken && state.telegram.chatId),
      chatId: state.telegram?.chatId || '',
    },
    options: state.options,
    shiftEndTime: state.shiftEndTime,
    timeZone: state.timeZone,
    credentialsResetRequired,
  };
};

export const saveIntegrationSettings = async (input: Record<string, unknown>) => {
  const { state: current } = await readIntegrationState();
  const telegramInput = input.telegram && typeof input.telegram === 'object'
    ? input.telegram as Record<string, unknown>
    : {};
  const whatsappPhone = typeof input.whatsappPhone === 'string' && input.whatsappPhone.trim()
    ? input.whatsappPhone.trim()
    : current.whatsappPhone;
  const telegram = {
    botToken: typeof telegramInput.botToken === 'string' && telegramInput.botToken.trim()
      ? telegramInput.botToken.trim() : current.telegram?.botToken || '',
    chatId: typeof telegramInput.chatId === 'string' && telegramInput.chatId.trim()
      ? telegramInput.chatId.trim() : current.telegram?.chatId || '',
  };
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
      telegram: telegram.botToken ? encrypt(telegram) : null,
      options: JSON.stringify(options),
      shiftEndTime,
      timeZone: 'Africa/Cairo',
    },
    update: {
      whatsapp: null,
      whatsappPhone,
      telegram: telegram.botToken ? encrypt(telegram) : null,
      options: JSON.stringify(options),
      shiftEndTime,
      timeZone: 'Africa/Cairo',
    },
  });
  return getIntegrationStatus();
};

const requestJson = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  let body: { ok?: boolean; error?: { message?: string }; description?: string };
  try {
    body = await response.json() as typeof body;
  } catch {
    throw new Error('Messaging provider returned an invalid response');
  }
  if (!response.ok) {
    throw new Error(body.error?.message || body.description || `Messaging provider returned HTTP ${response.status}`);
  }
  if (body.ok === false) throw new Error(body.description || 'Messaging provider rejected the request');
  return body;
};

const sendToChannel = async (channel: NotificationChannel, text: string, state?: IntegrationState) => {
  const settings = state || await getIntegrationState();
  if (channel === 'whatsapp') {
    if (!settings.whatsappPhone) throw new Error('Set the WhatsApp recipient phone number in integration settings');
    await sendWhatsappQrMessage(settings.whatsappPhone, text);
    return;
  }
  if (channel === 'telegram') {
    const config = settings.telegram;
    if (!config?.botToken || !config.chatId) throw new Error('Telegram is not fully configured');
    await requestJson(`https://api.telegram.org/bot${encodeURIComponent(config.botToken)}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: config.chatId, text: text.slice(0, 3900) }),
    });
    return;
  }
};

export const testIntegration = async (
  channel: NotificationChannel,
  input: Record<string, unknown>,
) => {
  const { state } = await readIntegrationState();
  if (channel === 'telegram') {
    const config = {
      botToken: typeof input.botToken === 'string' && input.botToken.trim()
        ? input.botToken.trim() : state.telegram?.botToken || '',
      chatId: typeof input.chatId === 'string' && input.chatId.trim()
        ? input.chatId.trim() : state.telegram?.chatId || '',
    };
    nonEmpty(config.botToken, 'Telegram bot token');
    nonEmpty(config.chatId, 'Telegram chat ID');
    const response = await requestJson(
      `https://api.telegram.org/bot${encodeURIComponent(config.botToken)}/getMe`,
    ) as { result?: { username?: string } };
    await sendToChannel('telegram', 'تم اختبار اتصال Alasly بنجاح.', { ...state, telegram: config });
    return { success: true, account: response.result?.username || 'Telegram bot' };
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
    await sendToConfiguredChannels(text, state, category);
  } catch (error) {
    console.error(`Notification could not be prepared (${category}):`, error);
  }
};

const sendToConfiguredChannels = async (text: string, state: IntegrationState, category: string) => {
  const channels = (['whatsapp', 'telegram'] as NotificationChannel[]).filter((channel) => channel === 'telegram'
    ? Boolean(state.telegram?.botToken && state.telegram.chatId)
    : Boolean(state.whatsappPhone));
  const whatsapp = channels.includes('whatsapp') ? await getWhatsappQrStatus() : null;
  const enabledChannels = channels.filter((channel) => channel !== 'whatsapp' || whatsapp?.connected);
  const results = await Promise.allSettled(enabledChannels.map((channel) => sendToChannel(channel, text, state)));
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`Notification delivery failed (${category}, ${enabledChannels[index]}):`, result.reason);
    }
  });
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
      : Boolean(state.telegram?.botToken && state.telegram.chatId);
    if (!configured) continue;
    const eventKey = `shift-summary:${date}`;
    const claimed = await prisma.$executeRaw`
      INSERT INTO "NotificationDelivery" ("id", "channel", "eventKey", "sentAt")
      VALUES (${randomUUID()}, ${channel}, ${eventKey}, CURRENT_TIMESTAMP)
      ON CONFLICT("channel", "eventKey") DO NOTHING
    `;
    if (!claimed) continue;
    try {
      await sendToChannel(channel, summary, state);
    } catch (error) {
      await prisma.notificationDelivery.delete({ where: { channel_eventKey: { channel, eventKey } } });
      console.error(`Shift summary delivery failed (${channel}):`, error);
    }
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
