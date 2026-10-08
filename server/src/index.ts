import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { existsSync } from 'fs';

import authRouter from './routes/auth';
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
import { authenticate } from './middleware/auth';

dotenv.config();

if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET) < 32) {
  throw new Error('JWT_SECRET must contain at least 32 bytes before the server can start');
}

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Request logger for audit and debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    system: 'AutoCare ERP Server',
    version: '1.0.0',
    time: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api', authenticate);
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
if (existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
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

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚗 AutoCare ERP Backend Server running on port ${PORT}`);
  console.log(`🔗 http://localhost:${PORT}`);
  console.log(`====================================================`);
});
