import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = path.resolve(
  process.env.DATA_DIR || path.join(os.homedir(), 'autocare-erp-data'),
);
const databaseFile = path.join(dataDirectory, 'autocare.db');
const seedDatabaseFile = path.join(__dirname, 'prisma', 'autocare.db');
const securedUsersMarker = path.join(dataDirectory, '.users-secured');

const startServer = async () => {
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

  delete process.env.INITIAL_ADMIN_PASSWORD;
  await import('./dist/index.js');
};

startServer().catch((error) => {
  console.error('Unable to start the cPanel application:', error);
  process.exitCode = 1;
});
