import { createHash, randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import { isValidPassword } from '../lib/passwordPolicy';

export const PASSWORD_RESET_POLICY_MESSAGE = 'يجب أن تتكون كلمة المرور من 12 إلى 15 خانة من الأحرف الإنجليزية والأرقام، وألا تكون admin';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[character] || character);

const getMailConfig = () => {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT);
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM?.trim();
  const approverEmail = process.env.PASSWORD_RESET_APPROVER_EMAIL?.trim();
  const appUrl = process.env.PUBLIC_APP_URL?.trim();

  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !password || !from || !approverEmail || !appUrl) {
    return null;
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(appUrl);
  } catch {
    return null;
  }
  if (baseUrl.protocol !== 'https:' && baseUrl.hostname !== 'localhost') return null;

  return {
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true',
    user,
    password,
    from,
    approverEmail,
    baseUrl,
  };
};

export const isPasswordResetEmailConfigured = () => Boolean(getMailConfig());

export const createPasswordResetToken = () => randomBytes(32).toString('base64url');

export const hashPasswordResetToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

export const isValidPasswordReset = (password: unknown): password is string =>
  isValidPassword(password) && password.length >= 12 && password.toLowerCase() !== 'admin';

const sendMail = async (to: string, subject: string, text: string, html: string) => {
  const config = getMailConfig();
  if (!config) throw new Error('Password reset email is not configured');
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
  });
  await transporter.sendMail({ from: config.from, to, subject, text, html });
};

export const sendPasswordResetApprovalEmail = async (username: string, token: string) => {
  const config = getMailConfig();
  if (!config) throw new Error('Password reset email is not configured');
  const link = new URL('/password-reset/approval', config.baseUrl);
  link.hash = `token=${encodeURIComponent(token)}`;
  const safeUsername = escapeHtml(username);
  await sendMail(
    config.approverEmail,
    'طلب موافقة لإعادة تعيين كلمة مرور AutoCare',
    `ورد طلب إعادة تعيين كلمة مرور المستخدم ${username}. راجع الطلب ووافق أو ارفض من الرابط التالي: ${link.toString()}`,
    `<div dir="rtl" style="font:16px Arial,sans-serif;color:#0f172a"><h2>طلب إعادة تعيين كلمة المرور</h2><p>طلب المستخدم <strong>${safeUsername}</strong> إعادة تعيين كلمة المرور.</p><p><a href="${escapeHtml(link.toString())}">مراجعة الطلب والموافقة أو الرفض</a></p><p>صلاحية الرابط 30 دقيقة، ولا يؤدي فتحه وحده إلى اعتماد الطلب.</p></div>`,
  );
};

export const sendPasswordResetLinkEmail = async (email: string, username: string, token: string) => {
  const config = getMailConfig();
  if (!config) throw new Error('Password reset email is not configured');
  const link = new URL('/password-reset', config.baseUrl);
  link.hash = `token=${encodeURIComponent(token)}`;
  const safeUsername = escapeHtml(username);
  await sendMail(
    email,
    'رابط إعادة تعيين كلمة مرور AutoCare',
    `مرحباً ${username}، استخدم الرابط التالي لتعيين كلمة مرور جديدة. الرابط صالح لمدة 20 دقيقة ويستخدم مرة واحدة: ${link.toString()}`,
    `<div dir="rtl" style="font:16px Arial,sans-serif;color:#0f172a"><h2>إعادة تعيين كلمة المرور</h2><p>مرحباً ${safeUsername}، وافق مدير النظام على طلبك.</p><p><a href="${escapeHtml(link.toString())}">تعيين كلمة مرور جديدة</a></p><p>الرابط صالح لمدة 20 دقيقة ويستخدم مرة واحدة. إذا لم تطلب إعادة التعيين، تجاهل هذه الرسالة.</p></div>`,
  );
};

export const getPasswordResetApproverEmail = () => getMailConfig()?.approverEmail || null;