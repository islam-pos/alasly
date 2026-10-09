import makeWASocket, {
  AuthenticationState,
  BufferJSON,
  DisconnectReason,
  initAuthCreds,
  proto,
  SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import QRCode from 'qrcode';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { prisma } from '../lib/prisma';

type QRStatus = {
  connected: boolean;
  connecting: boolean;
  phoneNumber: string;
  qrCode: string | null;
  error: string | null;
};

const logger = pino({ level: 'silent' });
const status: QRStatus = { connected: false, connecting: false, phoneNumber: '', qrCode: null, error: null };
let socket: ReturnType<typeof makeWASocket> | null = null;
let generation = 0;
let reconnectTimer: NodeJS.Timeout | null = null;
let initialConnectionStarted = false;

const encryptionKey = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes to encrypt WhatsApp session data');
  }
  return scryptSync(secret, 'alasly-whatsapp-qr-session-v1', 32);
};

const encrypt = (value: unknown) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const plaintext = JSON.stringify(value, BufferJSON.replacer);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`;
};

const decrypt = <T>(value: string): T => {
  const [version, iv, tag, data] = value.split(':');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('WhatsApp session data has an unsupported format');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(data, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return JSON.parse(plaintext, BufferJSON.reviver) as T;
};

const readAuthData = async <T>(key: string) => {
  const row = await prisma.whatsappAuthData.findUnique({ where: { key } });
  return row ? decrypt<T>(row.encryptedValue) : null;
};

const saveAuthData = async (key: string, value: unknown) => {
  await prisma.whatsappAuthData.upsert({
    where: { key },
    create: { key, encryptedValue: encrypt(value) },
    update: { encryptedValue: encrypt(value) },
  });
};

const createAuthState = async (): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> => {
  const creds = await readAuthData<AuthenticationState['creds']>('creds') || initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const values = await Promise.all(ids.map(async (id) => [
            id,
            await readAuthData<SignalDataTypeMap[typeof type]>(`key:${type}:${id}`),
          ] as const));
          const result: Record<string, SignalDataTypeMap[typeof type]> = {};
          for (const [id, value] of values) {
            if (!value) continue;
            if (type === 'app-state-sync-key') {
              result[id] = proto.Message.AppStateSyncKeyData.fromObject(
                value as proto.Message.IAppStateSyncKeyData,
              ) as unknown as SignalDataTypeMap[typeof type];
            } else {
              result[id] = value;
            }
          }
          return result;
        },
        set: async (data) => {
          await prisma.$transaction(async (tx) => {
            for (const [type, entries] of Object.entries(data)) {
              for (const [id, value] of Object.entries(entries || {})) {
                const key = `key:${type}:${id}`;
                if (value) {
                  await tx.whatsappAuthData.upsert({
                    where: { key },
                    create: { key, encryptedValue: encrypt(value) },
                    update: { encryptedValue: encrypt(value) },
                  });
                } else {
                  await tx.whatsappAuthData.deleteMany({ where: { key } });
                }
              }
            }
          });
        },
        clear: async () => {
          await prisma.whatsappAuthData.deleteMany({ where: { key: { not: 'creds' } } });
        },
      },
    },
    saveCreds: () => saveAuthData('creds', creds),
  };
};

const clearSession = async () => {
  await prisma.whatsappAuthData.deleteMany();
};

const connect = async () => {
  if (socket || status.connecting) return;
  status.connecting = true;
  status.error = null;
  const currentGeneration = ++generation;
  try {
    const auth = await createAuthState();
    if (currentGeneration !== generation) return;
    const client = makeWASocket({
      auth: auth.state,
      logger,
      printQRInTerminal: false,
      browser: ['Alasly ERP', 'Chrome', '1.0'],
      shouldSyncHistoryMessage: () => false,
      syncFullHistory: false,
    });
    socket = client;
    client.ev.on('creds.update', () => {
      void auth.saveCreds().catch((error) => {
        console.error('Failed to persist encrypted WhatsApp credentials:', error);
      });
    });
    client.ev.on('connection.update', (update) => {
      if (currentGeneration !== generation) return;
      if (update.qr) {
        status.qrCode = null;
        void QRCode.toDataURL(update.qr, { errorCorrectionLevel: 'M', margin: 2 })
          .then((qrCode) => {
            if (currentGeneration === generation) status.qrCode = qrCode;
          })
          .catch((error) => {
            status.error = 'تعذر إنشاء رمز QR، أعد المحاولة';
            console.error('Failed to generate WhatsApp pairing QR code:', error);
          });
      }
      if (update.connection === 'open') {
        status.connected = true;
        status.connecting = false;
        status.qrCode = null;
        status.error = null;
        status.phoneNumber = client.user?.id.split(':')[0].split('@')[0] || '';
        return;
      }
      if (update.connection !== 'close') return;
      status.connected = false;
      status.connecting = false;
      status.qrCode = null;
      socket = null;
      const disconnectCode = update.lastDisconnect?.error
        ? new Boom(update.lastDisconnect.error).output.statusCode
        : undefined;
      if (disconnectCode === DisconnectReason.loggedOut) {
        status.phoneNumber = '';
        status.error = 'انتهى ربط WhatsApp؛ امسح رمز QR جديدًا';
        void clearSession().catch((error) => console.error('Failed to clear logged-out WhatsApp session:', error));
        return;
      }
      status.connecting = true;
      status.error = 'انقطع الاتصال، جارٍ إعادة المحاولة';
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          status.connecting = false;
          void connect().catch((error) => console.error('Failed to reconnect WhatsApp session:', error));
        }, 3000);
      }
    });
  } catch (error) {
    if (currentGeneration !== generation) return;
    status.connecting = false;
    status.connected = false;
    status.error = 'تعذر بدء اتصال WhatsApp';
    throw error;
  }
};

export const getWhatsappQrStatus = async () => ({
  ...status,
  recipientPhone: (await prisma.notificationIntegration.findUnique({
    where: { id: 1 },
    select: { whatsappPhone: true },
  }))?.whatsappPhone || '',
});

export const startWhatsappQrPairing = async () => {
  await prisma.notificationIntegration.upsert({
    where: { id: 1 },
    create: { id: 1, whatsapp: null },
    update: { whatsapp: null },
  });
  if (status.connected) throw new Error('WhatsApp is already connected; disconnect before pairing another account');
  if (socket || status.connecting) {
    return getWhatsappQrStatus();
  }
  await connect();
  return getWhatsappQrStatus();
};

export const disconnectWhatsappQr = async () => {
  generation += 1;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  const currentSocket = socket;
  socket = null;
  status.connected = false;
  status.connecting = false;
  status.phoneNumber = '';
  status.qrCode = null;
  status.error = null;
  await clearSession();
  if (currentSocket) {
    await currentSocket.logout().catch((error) => {
      console.error('WhatsApp logout failed after local session removal:', error);
    });
  }
  return getWhatsappQrStatus();
};

export const sendWhatsappQrMessage = async (phoneNumber: string, text: string) => {
  if (!status.connected || !socket) throw new Error('WhatsApp QR account is not connected');
  const digits = phoneNumber.replace(/\D/g, '');
  if (!/^\d{8,15}$/.test(digits)) throw new Error('WhatsApp phone number must use international digits');
  await socket.sendMessage(`${digits}@s.whatsapp.net`, { text: text.slice(0, 3900) });
};

export const startWhatsappQrSessionIfPresent = async () => {
  if (initialConnectionStarted) return;
  initialConnectionStarted = true;
  const savedCreds = await prisma.whatsappAuthData.findUnique({ where: { key: 'creds' } });
  if (!savedCreds) return;
  try {
    await connect();
  } catch (error) {
    console.error('Failed to restore WhatsApp QR session:', error);
  }
};
