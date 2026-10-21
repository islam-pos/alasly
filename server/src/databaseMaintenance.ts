import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  copyFile,
  mkdir,
  readdir,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import path from 'node:path';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.startsWith('file:')) {
  throw new Error('Database backup and restore commands require a SQLite DATABASE_URL beginning with file:');
}

const configuredDatabasePath = decodeURIComponent(databaseUrl.slice('file:'.length).split('?')[0]);
const databasePath = path.resolve(process.cwd(), configuredDatabasePath);
const backupDirectory = path.resolve(
  process.env.DB_BACKUP_DIRECTORY || path.join(path.dirname(databasePath), 'backups'),
);
const retentionDays = Number(process.env.DB_BACKUP_RETENTION_DAYS || 30);
const prisma = new PrismaClient();

type IntegrityResult = { integrity_check: string };

const toFileUrl = (filePath: string) => `file:${filePath.replace(/\\/g, '/')}`;
const quoteSqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;
const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const verifyDatabase = async (filePath: string) => {
  const client = new PrismaClient({ datasources: { db: { url: toFileUrl(filePath) } } });
  try {
    const results = await client.$queryRawUnsafe<IntegrityResult[]>('PRAGMA integrity_check');
    if (results.length !== 1 || results[0].integrity_check !== 'ok') {
      throw new Error(`SQLite integrity check failed for ${filePath}`);
    }
  } finally {
    await client.$disconnect();
  }
};

const createBackup = async (force: boolean) => {
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
    throw new Error('DB_BACKUP_RETENTION_DAYS must be an integer between 1 and 3650');
  }
  const databaseInfo = await stat(databasePath);
  if (!databaseInfo.isFile() || databaseInfo.size === 0) {
    throw new Error(`SQLite database is missing or empty: ${databasePath}`);
  }
  await mkdir(backupDirectory, { recursive: true });
  const existingBackups = (await readdir(backupDirectory))
    .filter((name) => /^autocare-.*\.db$/.test(name))
    .map((name) => path.join(backupDirectory, name));

  if (!force) {
    const recentBackups = await Promise.all(existingBackups.map(async (filePath) => ({
      filePath,
      modifiedAt: (await stat(filePath)).mtimeMs,
    })));
    const latestBackup = recentBackups.reduce(
      (latest, backup) => Math.max(latest, backup.modifiedAt),
      0,
    );
    if (latestBackup && Date.now() - latestBackup < 24 * 60 * 60 * 1000) {
      console.log(`Using recent database backup: ${path.basename(
        recentBackups.find((backup) => backup.modifiedAt === latestBackup)!.filePath,
      )}`);
      const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      await Promise.all(existingBackups.map(async (filePath) => {
        const fileInfo = await stat(filePath);
        if (fileInfo.mtimeMs < cutoff) await rm(filePath);
      }));
      return;
    }
  }

  const backupPath = path.join(backupDirectory, `autocare-${timestamp()}.db`);
  await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(FULL)');
  await prisma.$executeRawUnsafe(`VACUUM INTO ${quoteSqlString(backupPath)}`);
  await verifyDatabase(backupPath);
  console.log(`Database backup created and verified: ${backupPath}`);

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  await Promise.all(existingBackups.map(async (filePath) => {
    const fileInfo = await stat(filePath);
    if (fileInfo.mtimeMs < cutoff) await rm(filePath);
  }));
};

const restoreBackup = async (sourceFile: string) => {
  const sourcePath = path.resolve(process.cwd(), sourceFile);
  if (sourcePath === databasePath) throw new Error('The restore file cannot be the active database');
  const sourceInfo = await stat(sourcePath);
  if (!sourceInfo.isFile() || sourceInfo.size === 0) throw new Error('The restore file is empty or is not a regular file');
  await verifyDatabase(sourcePath);
  await mkdir(backupDirectory, { recursive: true });
  await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)');
  const safetyBackup = path.join(backupDirectory, `autocare-before-restore-${timestamp()}.db`);
  await prisma.$executeRawUnsafe(`VACUUM INTO ${quoteSqlString(safetyBackup)}`);
  await verifyDatabase(safetyBackup);
  await prisma.$disconnect();

  const temporaryPath = `${databasePath}.restore-${timestamp()}`;
  const previousPath = `${databasePath}.previous-${timestamp()}`;
  await copyFile(sourcePath, temporaryPath);
  await verifyDatabase(temporaryPath);

  for (const suffix of ['-wal', '-shm']) {
    const sidecarPath = `${databasePath}${suffix}`;
    try {
      const sidecar = await stat(sidecarPath);
      if (sidecar.size > 0) {
        await rm(temporaryPath, { force: true });
        throw new Error(`Database sidecar ${sidecarPath} is not empty; stop all server processes before restoring`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  await rename(databasePath, previousPath);
  try {
    await rename(temporaryPath, databasePath);
  } catch (error) {
    await rename(previousPath, databasePath);
    throw error;
  }
  await rm(previousPath, { force: true });
  console.log(`Database restored and verified from: ${sourcePath}`);
  console.log(`Pre-restore safety backup: ${safetyBackup}`);
};

const main = async () => {
  const [operation, argument] = process.argv.slice(2);
  if (operation === 'backup') {
    await createBackup(process.argv.includes('--force'));
    return;
  }
  if (operation === 'restore' && argument && !argument.startsWith('--')) {
    if (!process.argv.includes('--confirm')) {
      throw new Error('Restore requires --confirm after stopping the server and verifying the backup file');
    }
    await restoreBackup(argument);
    return;
  }
  throw new Error('Usage: databaseMaintenance.js backup [--force] | restore <backup.db> --confirm');
};

main()
  .catch((error) => {
    console.error('Database maintenance failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
