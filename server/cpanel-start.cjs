const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDirectory = path.resolve(
  process.env.DATA_DIR || path.join(os.homedir(), 'autocare-erp-data'),
);
const databaseFile = path.join(dataDirectory, 'autocare.db');
const seedDatabaseFile = path.join(__dirname, 'prisma', 'autocare.db');
const securedUsersMarker = path.join(dataDirectory, '.users-secured');

const startServer = () => {
  if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET) < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes before the server can start');
  }

  fs.mkdirSync(dataDirectory, { recursive: true });
  process.env.DATA_DIR = dataDirectory;
  process.env.DATABASE_URL = `file:${databaseFile}`;
  process.env.PUBLIC_APP_URL ||= 'https://alasly.top';

  if (!fs.existsSync(databaseFile)) {
    if (!fs.existsSync(seedDatabaseFile)) {
      throw new Error(`The cPanel seed database is missing: ${seedDatabaseFile}`);
    }
    fs.copyFileSync(seedDatabaseFile, databaseFile, fs.constants.COPYFILE_EXCL);
  }

  const runServerScript = (scriptName) => {
    execFileSync(process.execPath, [path.join(__dirname, 'dist', scriptName)], {
      cwd: __dirname,
      env: process.env,
      stdio: 'inherit',
    });
  };

  runServerScript('restoreBackup.js');
  runServerScript('migrate.js');
  if (!fs.existsSync(securedUsersMarker)) {
    if (!process.env.INITIAL_ADMIN_PASSWORD) {
      throw new Error('Set INITIAL_ADMIN_PASSWORD before the first cPanel startup');
    }
    runServerScript('bootstrapUsers.js');
    fs.writeFileSync(securedUsersMarker, new Date().toISOString(), { flag: 'wx' });
  }

  const resetPassword = process.env.ADMIN_RESET_PASSWORD;
  const resetKey = process.env.ADMIN_RESET_ONCE_KEY;
  if (resetPassword || resetKey) {
    try {
      if (!resetPassword || !resetKey || !/^[A-Za-z0-9_-]{32,128}$/.test(resetKey)) {
        throw new Error('Set both ADMIN_RESET_PASSWORD and a random 32-128 character ADMIN_RESET_ONCE_KEY');
      }
      const resetMarker = path.join(
        dataDirectory,
        `.admin-password-reset-${createHash('sha256').update(resetKey).digest('hex')}.done`,
      );
      if (!fs.existsSync(resetMarker)) {
        runServerScript('resetAdminPassword.js');
        fs.writeFileSync(resetMarker, new Date().toISOString(), { flag: 'wx' });
        console.info('One-time administrator password reset completed. Remove reset variables from cPanel.');
      }
    } finally {
      delete process.env.ADMIN_RESET_PASSWORD;
      delete process.env.ADMIN_RESET_ONCE_KEY;
    }
  }

  delete process.env.INITIAL_ADMIN_PASSWORD;
  require('./dist/index.js');
};

try {
  startServer();
} catch (error) {
  console.error('Unable to start the cPanel application:', error);
  process.exitCode = 1;
}
