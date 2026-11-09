import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { existsSync } from 'fs';

import authRouter from './routes/auth';
import accountingRouter from './routes/accounting';
import dashboardRouter from './routes/dashboard';
import masterDataRouter from './routes/masterData';
import itemsRouter from './routes/items';
import purchasesRouter from './routes/purchases';
import salesRouter from './routes/sales';
import workshopRouter from './routes/workshop';
import inventoryRouter from './routes/inventory';
import financialsRouter from './routes/financials';
import hrRouter from './routes/hr';
import reportsRouter from './routes/reports';
import profitsRouter from './routes/profits';
import searchRouter from './routes/search';
import settingsRouter from './routes/settings';
import publicPurchaseRequestsRouter from './routes/publicPurchaseRequests';
import publicRepairApprovalsRouter from './routes/publicRepairApprovals';
import backupsRouter from './routes/backups';
import { authenticate } from './middleware/auth';
import { authorizeApiPermission } from './middleware/permissions';
import { migrateEgyptianLocationDefaults } from './migrations/egyptianLocationDefaults';
import { startNotificationScheduler } from './services/notifications';
import { startWhatsappQrSessionIfPresent } from './services/whatsappQr';
import { startTelegramQrSessionIfPresent } from './services/telegramQr';
import { withRequestContext } from './middleware/requestContext';
import { idempotencyMiddleware } from './middleware/idempotency';
import { getRestoreMarkerPath, startBackupScheduler } from './services/backups';

dotenv.config();

if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET) < 32) {
  throw new Error('JWT_SECRET must contain at least 32 bytes before the server can start');
}

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use('/api/items/import', express.json({ limit: '10mb' }));
app.use('/api/workshop/job-cards', express.json({ limit: '5mb' }));
app.use('/api/financials/banks', express.json({ limit: '8mb' }));
app.use(express.json());

// Request logger for audit and debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  if (existsSync(getRestoreMarkerPath())) {
    return res.status(503).json({
      status: 'restore_pending',
      system: 'AutoCare ERP Server',
      message: 'A backup restore is pending; restart the service to apply it.',
      time: new Date().toISOString(),
    });
  }
  res.json({
    status: 'ok',
    system: 'AutoCare ERP Server',
    version: '1.0.0',
    time: new Date().toISOString(),
  });
});

app.use('/api', (req, res, next) => {
  if (!existsSync(getRestoreMarkerPath()) || req.path.startsWith('/backups')) return next();
  return res.status(503).json({
    error: 'النظام في وضع الصيانة لاستعادة نسخة احتياطية؛ أعد تشغيل الخدمة لتطبيق الاستعادة.',
  });
});

app.use('/api/public/purchase-requests', publicPurchaseRequestsRouter);
app.use('/api/public/repair-approvals', publicRepairApprovalsRouter);

// API Routes
app.use('/api/auth', authRouter);
app.use('/api', authenticate);
app.use('/api', authorizeApiPermission);
app.use('/api', withRequestContext);
app.use('/api', idempotencyMiddleware);
app.use('/api/backups', backupsRouter);
app.use('/api/accounting', accountingRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/master', masterDataRouter);
app.use('/api/items', itemsRouter);
app.use('/api/purchases', purchasesRouter);
app.use('/api/sales', salesRouter);
app.use('/api/workshop', workshopRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/financials', financialsRouter);
app.use('/api/hr', hrRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/profits', profitsRouter);
app.use('/api/search', searchRouter);
app.use('/api/settings', settingsRouter);

const clientDistPath = path.resolve(__dirname, '../../client/dist');
const isStaticAssetRequest = (reqPath: string) => {
  if (reqPath.startsWith('/api/')) return true;
  if (reqPath === '/sw.js' || reqPath === '/registerSW.js' || reqPath === '/manifest.webmanifest') return true;
  return ['.js', '.css', '.map', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.webmanifest', '.woff', '.woff2', '.ttf', '.otf', '.json'].some((ext) => reqPath.endsWith(ext));
};

if (existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (isStaticAssetRequest(req.path)) return next();
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `المسار ${req.originalUrl} غير موجود` });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: err.message || 'حدث خطأ غير متوقع في الخادم' });
});

migrateEgyptianLocationDefaults()
  .then(() => {
    app.listen(PORT, () => {
      startNotificationScheduler();
      startBackupScheduler();
      void startWhatsappQrSessionIfPresent();
      void startTelegramQrSessionIfPresent();
      console.log(`====================================================`);
      console.log(`🚗 AutoCare ERP Backend Server running on port ${PORT}`);
      console.log(`🔗 http://localhost:${PORT}`);
      console.log(`====================================================`);
    });
  })
  .catch((error) => {
    console.error('Failed to migrate legacy company and branch locations:', error);
    process.exitCode = 1;
  });
