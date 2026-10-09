import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions';
import QRCode from 'qrcode';
import { prisma } from '../lib/prisma';

type TelegramQrStatus = {
  connected: boolean;
  connecting: boolean;
  account: string;
  qrCode: string | null;
  passwordRequired: boolean;
  passwordHint: string;
  error: string | null;
};

const status: TelegramQrStatus = {
  connected: false,
  connecting: false,
  account: '',
  qrCode: null,
  passwordRequired: false,
  passwordHint: '',
  error: null,
};
let client: TelegramClient | null = null;
let generation = 0;
let abortController: AbortController | null = null;
let passwordResolver: ((password: string) => void) | null = null;
let initialConnectionStarted = false;

const encryptionKey = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes to encrypt Telegram session data');
  }
  return scryptSync(secret, 'alasly-telegram-qr-session-v1', 32);
};

const encrypt = (value: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`;
};

const decrypt = (value: string) => {
  const [version, iv, tag, data] = value.split(':');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Telegram session data has an unsupported format');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64')),
    decipher.final(),
  ]).toString('utf8');
};

const apiCredentials = () => {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH?.trim();
  if (!Number.isInteger(apiId) || apiId <= 0 || !apiHash) {
    throw new Error('Set TELEGRAM_API_ID and TELEGRAM_API_HASH from my.telegram.org/apps before connecting Telegram');
  }
  return { apiId, apiHash };
};

const saveSession = async (session: string | undefined) => {
  await prisma.telegramAuthSession.upsert({
    where: { id: 1 },
    create: { id: 1, encryptedSession: session ? encrypt(session) : null },
    update: { encryptedSession: session ? encrypt(session) : null },
  });
};

const accountName = async (telegramClient: TelegramClient) => {
  const user = await telegramClient.getMe();
  return user.username
    ? `@${user.username}`
    : [user.firstName, user.lastName].filter(Boolean).join(' ') || String(user.id);
};

const clearPendingPassword = () => {
  passwordResolver = null;
  status.passwordRequired = false;
  status.passwordHint = '';
};

const handleLogin = async (telegramClient: TelegramClient, currentGeneration: number) => {
  abortController = new AbortController();
  try {
    await telegramClient.signInUserWithQrCode(apiCredentials(), {
      abortSignal: abortController.signal,
      qrCode: async ({ token }) => {
        const uri = `tg://login?token=${token.toString('base64url')}`;
        const qrCode = await QRCode.toDataURL(uri, { errorCorrectionLevel: 'M', margin: 2 });
        if (currentGeneration === generation) {
          status.qrCode = qrCode;
          status.passwordRequired = false;
          status.passwordHint = '';
          status.error = null;
        }
      },
      password: async (hint) => {
        status.passwordRequired = true;
        status.passwordHint = hint || '';
        return new Promise<string>((resolve, reject) => {
          passwordResolver = resolve;
          abortController?.signal.addEventListener('abort', () => {
            if (passwordResolver === resolve) passwordResolver = null;
            reject(new Error('Telegram QR login was cancelled'));
          }, { once: true });
        });
      },
      onError: async (error) => {
        if (currentGeneration === generation) status.error = error.message;
        return true;
      },
    });
    if (currentGeneration !== generation) return;
    const savedSession = telegramClient.session.save();
    if (typeof savedSession !== 'string' || !savedSession) {
      throw new Error('Telegram did not return a session to save after login');
    }
    await saveSession(savedSession);
    status.connected = true;
    status.connecting = false;
    status.account = await accountName(telegramClient);
    status.qrCode = null;
    status.passwordRequired = false;
    status.passwordHint = '';
    status.error = null;
    abortController = null;
  } catch (error) {
    if (currentGeneration !== generation) return;
    status.connected = false;
    status.connecting = false;
    status.qrCode = null;
    status.passwordRequired = false;
    status.passwordHint = '';
    status.error = error instanceof Error ? error.message : 'Telegram QR login failed';
    passwordResolver = null;
    client = null;
    abortController = null;
    await telegramClient.disconnect().catch((disconnectError) => {
      console.error('Failed to disconnect Telegram client after QR login error:', disconnectError);
    });
  }
};

export const getTelegramQrStatus = async () => ({ ...status });

export const startTelegramQrPairing = async () => {
  if (status.connected) return getTelegramQrStatus();
  if (status.connecting) return getTelegramQrStatus();
  const credentials = apiCredentials();
  status.connecting = true;
  status.error = null;
  status.qrCode = null;
  const currentGeneration = ++generation;
  try {
    const telegramClient = new TelegramClient(new StringSession(''), credentials.apiId, credentials.apiHash, {
      connectionRetries: 5,
    });
    client = telegramClient;
    await telegramClient.connect();
    if (currentGeneration !== generation) return getTelegramQrStatus();
    handleLogin(telegramClient, currentGeneration).catch((error) => {
      console.error('Telegram QR login failed unexpectedly:', error);
    });
    return getTelegramQrStatus();
  } catch (error) {
    if (currentGeneration === generation) {
      status.connecting = false;
      status.error = error instanceof Error ? error.message : 'Failed to connect to Telegram';
      client = null;
    }
    throw error;
  }
};

export const submitTelegramQrPassword = async (password: string) => {
  if (!status.passwordRequired || !passwordResolver) throw new Error('Telegram is not currently requesting a two-step verification password');
  if (!password.trim()) throw new Error('Telegram two-step verification password is required');
  const resolve = passwordResolver;
  passwordResolver = null;
  status.passwordRequired = false;
  status.passwordHint = '';
  resolve(password);
  return getTelegramQrStatus();
};

export const disconnectTelegramQr = async () => {
  generation += 1;
  const currentClient = client;
  const wasConnected = status.connected;
  client = null;
  abortController?.abort();
  abortController = null;
  clearPendingPassword();
  status.connected = false;
  status.connecting = false;
  status.account = '';
  status.qrCode = null;
  status.passwordRequired = false;
  status.passwordHint = '';
  status.error = null;
  await saveSession(undefined);
  if (currentClient && wasConnected) {
    try {
      await currentClient.logOut();
    } catch (error) {
      status.error = 'Local Telegram session was removed, but Telegram did not confirm logout';
      console.error('Telegram logout failed after local session removal:', error);
    }
  } else if (currentClient) {
    await currentClient.disconnect().catch((error) => {
      status.error = 'Local Telegram session was removed, but the pending connection did not close cleanly';
      console.error('Failed to disconnect pending Telegram QR session:', error);
    });
  }
  return getTelegramQrStatus();
};

export const sendTelegramQrMessage = async (text: string) => {
  if (!status.connected || !client) throw new Error('Connect Telegram by scanning the QR code first');
  await client.sendMessage('me', { message: text.slice(0, 3900) });
};

export const startTelegramQrSessionIfPresent = async () => {
  if (initialConnectionStarted) return;
  initialConnectionStarted = true;
  const row = await prisma.telegramAuthSession.findUnique({ where: { id: 1 } });
  if (!row?.encryptedSession) return;
  const currentGeneration = ++generation;
  status.connecting = true;
  try {
    const credentials = apiCredentials();
    const telegramClient = new TelegramClient(
      new StringSession(decrypt(row.encryptedSession)),
      credentials.apiId,
      credentials.apiHash,
      { connectionRetries: 5 },
    );
    client = telegramClient;
    await telegramClient.connect();
    if (!await telegramClient.checkAuthorization()) {
      throw new Error('The saved Telegram session has expired; scan a new QR code');
    }
    if (currentGeneration !== generation) return;
    status.account = await accountName(telegramClient);
    status.connected = true;
    status.connecting = false;
    status.error = null;
  } catch (error) {
    status.connected = false;
    status.connecting = false;
    status.qrCode = null;
    status.error = error instanceof Error ? error.message : 'Failed to restore Telegram session';
    client = null;
    console.error('Failed to restore Telegram QR session:', error);
  }
};
