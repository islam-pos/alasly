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
  telegram: { connected: boolean; chatId: string };
  options: NotificationOptions;
  shiftEndTime: string;
  timeZone: string;
  credentialsResetRequired: boolean;
};

export type NotificationIntegrationInput = {
  whatsappPhone: string;
  telegram: { botToken: string; chatId: string };
  options: NotificationOptions;
  shiftEndTime: string;
  timeZone: 'Africa/Cairo';
};

export type NotificationConnectionInput = {
  botToken?: string;
  chatId?: string;
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
