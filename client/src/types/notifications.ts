export type NotificationOptions = {
  userActivity: boolean;
  sales: boolean;
  profits: boolean;
  invoices: boolean;
  shortages: boolean;
  updates: boolean;
  shiftSummary: boolean;
};

export type NotificationIntegrationStatus = {
  whatsapp: NotificationQrStatus;
  telegram: NotificationTelegramQrStatus;
  options: NotificationOptions;
  shiftEndTime: string;
  timeZone: string;
};

export type NotificationIntegrationInput = {
  whatsappPhone: string;
  options: NotificationOptions;
  shiftEndTime: string;
  timeZone: 'Africa/Cairo';
};

export type NotificationConnectionInput = {
  phoneNumber?: string;
};

export type NotificationConnectionTest = { success: boolean; account?: string };

export type NotificationQrStatus = {
  connected: boolean;
  connecting: boolean;
  phoneNumber: string;
  recipientPhone: string;
  qrCode: string | null;
  error: string | null;
};

export type NotificationTelegramQrStatus = {
  connected: boolean;
  connecting: boolean;
  account: string;
  qrCode: string | null;
  passwordRequired: boolean;
  passwordHint: string;
  error: string | null;
};
