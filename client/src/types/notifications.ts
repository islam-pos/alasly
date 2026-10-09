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
  whatsapp: {
    connected: boolean;
    recipientPhone: string;
    phoneNumberId: string;
    apiVersion: string;
    templateName: string;
    templateLanguage: string;
  };
  telegram: { connected: boolean; chatId: string };
  options: NotificationOptions;
  shiftEndTime: string;
  timeZone: string;
  credentialsResetRequired: boolean;
};

export type NotificationIntegrationInput = {
  whatsapp: {
    accessToken: string;
    phoneNumberId: string;
    apiVersion: string;
    recipientPhone: string;
    templateName: string;
    templateLanguage: string;
  };
  telegram: { botToken: string; chatId: string };
  options: NotificationOptions;
  shiftEndTime: string;
  timeZone: 'Africa/Cairo';
};

export type NotificationConnectionInput = {
  accessToken?: string;
  phoneNumberId?: string;
  apiVersion?: string;
  recipientPhone?: string;
  templateName?: string;
  templateLanguage?: string;
  botToken?: string;
  chatId?: string;
};

export type NotificationConnectionTest = { success: boolean; account?: string };
