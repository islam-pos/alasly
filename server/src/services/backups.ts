import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { create as createTar } from 'tar';
import { prisma } from '../lib/prisma';

export type BackupKind = 'daily' | 'manual';
export type BackupMetadata = { id: string; type: string; date: string; sizeBytes: number };

const dailyRetention = 30;
const manualRetention = 10;
const maxManualBackupsPerDay = 3;
const backupNamePattern = /^autocare-(daily|manual)-(\d{4}-\d{2}-\d{2})-(\d{8}T\d{6}Z)-([0-9a-f-]{36})\.tar\.gz$/;
let backupInProgress = false;

const getDataDirectory = () => path.resolve(
  process.env.RAILWAY_VOLUME_MOUNT_PATH
    || process.env.DATA_DIR
    || (process.env.NODE_ENV === 'production' ? '/data' : path.resolve(process.cwd(), 'data')),
);

const getAttachmentDirectory = () => path.join(getDataDirectory(), 'repair-attachments');

export const resolveDatabaseFile = (databaseUrl = process.env.DATABASE_URL, workingDirectory = process.cwd()) => {
  if (!databaseUrl?.startsWith('file:')) {
    throw new Error('DATABASE_URL must point to a SQLite file to create or restore backups');
  }
  const databasePath = decodeURIComponent(databaseUrl.slice('file:'.length).split('?')[0]);
  if (!databasePath || databasePath === ':memory:') {
    throw new Error('In-memory SQLite databases cannot be backed up');
  }
  if (path.isAbsolute(databasePath)) return path.normalize(databasePath);
  const schemaDirectory = path.resolve(workingDirectory, 'prisma');
  return path.resolve(schemaDirectory, databasePath);
};

export const getBackupDirectory = () => path.join(getDataDirectory(), 'backups');

export const getRestoreMarkerPath = () => path.join(getBackupDirectory(), '.restore-pending.json');

export const getCairoDateKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export const parseBackupName = (filename: string) => {
  const match = filename.match(backupNamePattern);
  if (!match) return null;
  return { kind: match[1] as BackupKind, dateKey: match[2], timestamp: match[3], uuid: match[4] };
};

export const isSafeBackupId = (id: string) => parseBackupName(id) !== null;

const getArchivePath = (id: string) => {
  if (!isSafeBackupId(id)) throw new Error('معرّف النسخة الاحتياطية غير صالح');
  return path.join(getBackupDirectory(), id);
};

export const listBackups = async () => {
  const directory = getBackupDirectory();
  await fs.mkdir(directory, { recursive: true });
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const backups = await Promise.all(entries
    .filter((entry) => entry.isFile() && isSafeBackupId(entry.name))
    .map(async (entry) => {
      const stats = await fs.stat(path.join(directory, entry.name));
      const parsed = parseBackupName(entry.name)!;
      return {
        id: entry.name,
        type: parsed.kind,
        date: stats.mtime.toISOString(),
        sizeBytes: stats.size,
      };
    }));
  return backups.sort((a, b) => b.date.localeCompare(a.date));
};

export const getBackupArchivePath = (id: string) => getArchivePath(id);

export const getBackupsToPrune = (backups: BackupMetadata[]) => {
  const keepCounts: Record<BackupKind, number> = { daily: dailyRetention, manual: manualRetention };
  const kept: Record<BackupKind, number> = { daily: 0, manual: 0 };
  return [...backups]
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter((backup) => {
      const kind = parseBackupName(backup.id)?.kind;
      if (!kind) return false;
      if (kept[kind] < keepCounts[kind]) {
        kept[kind] += 1;
        return false;
      }
      return true;
    })
    .map((backup) => backup.id);
};

const pruneBackups = async () => {
  const backups = await listBackups();
  await Promise.all(getBackupsToPrune(backups).map((id) => fs.unlink(getArchivePath(id))));
};

const countManualBackupsForDate = async (dateKey: string) => {
  const backups = await listBackups();
  return backups.filter((backup) => {
    const parsed = parseBackupName(backup.id);
    return parsed?.kind === 'manual' && parsed.dateKey === dateKey;
  }).length;
};

const createBackup = async (kind: BackupKind) => {
  if (backupInProgress) throw new Error('توجد عملية نسخ احتياطي أخرى قيد التنفيذ');
  backupInProgress = true;
  const backupDirectory = getBackupDirectory();
  const dateKey = getCairoDateKey();
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const uuid = randomUUID();
  const id = `autocare-${kind}-${dateKey}-${timestamp}-${uuid}.tar.gz`;
  const stageName = `.stage-${uuid}`;
  const stageDirectory = path.join(backupDirectory, stageName);
  const archivePath = path.join(backupDirectory, id);

  try {
    await fs.mkdir(backupDirectory, { recursive: true });
    if (kind === 'manual' && await countManualBackupsForDate(dateKey) >= maxManualBackupsPerDay) {
      throw new Error('تم الوصول إلى الحد اليومي للنسخ اليدوية؛ حاول مرة أخرى غدًا');
    }
    await fs.mkdir(stageDirectory);
    const databaseFile = resolveDatabaseFile();
    await fs.access(databaseFile);
    const snapshotPath = path.join(stageDirectory, 'database.sqlite');
    const escapedSnapshotPath = snapshotPath.replace(/'/g, "''");
    await prisma.$executeRawUnsafe(`VACUUM INTO '${escapedSnapshotPath}'`);

    const attachmentsDirectory = getAttachmentDirectory();
    let attachmentsIncluded = false;
    try {
      await fs.access(attachmentsDirectory);
      await fs.cp(attachmentsDirectory, path.join(stageDirectory, 'repair-attachments'), { recursive: true });
      attachmentsIncluded = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await fs.mkdir(path.join(stageDirectory, 'repair-attachments'));
    }

    const manifest = {
      formatVersion: 1,
      createdAt: new Date().toISOString(),
      type: kind,
      databaseFile: 'database.sqlite',
      attachmentsDirectory: 'repair-attachments',
      attachmentsIncluded,
    };
    await fs.writeFile(path.join(stageDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await createTar({ gzip: true, file: archivePath, cwd: backupDirectory }, [stageName]);
    await fs.rename(archivePath, getArchivePath(id));
    await pruneBackups();
    return (await listBackups()).find((backup) => backup.id === id)!;
  } catch (error) {
    await fs.rm(archivePath, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    await fs.rm(stageDirectory, { recursive: true, force: true }).catch((error) => {
      console.error('Failed to remove temporary backup directory:', error);
    });
    backupInProgress = false;
  }
};

export const createManualBackup = () => createBackup('manual');

export const createDailyBackupIfNeeded = async () => {
  const nowParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const nowValues = Object.fromEntries(nowParts.map((part) => [part.type, part.value]));
  const minutesSinceMidnight = Number(nowValues.hour) * 60 + Number(nowValues.minute);
  if (minutesSinceMidnight < 180) return null;

  const dateKey = getCairoDateKey();
  const backups = await listBackups();
  if (backups.some((backup) => {
    const parsed = parseBackupName(backup.id);
    return parsed?.kind === 'daily' && parsed.dateKey === dateKey;
  })) return null;
  return createBackup('daily');
};

export const startBackupScheduler = () => {
  let running = false;
  const checkAndCreateBackup = async () => {
    if (running) return;
    running = true;
    try {
      await createDailyBackupIfNeeded();
    } catch (error) {
      console.error('Scheduled database backup failed:', error);
    } finally {
      running = false;
    }
  };
  void checkAndCreateBackup();
  const timer = setInterval(() => void checkAndCreateBackup(), 15 * 60 * 1000);
  timer.unref();
};

export const queueBackupRestore = async (id: string, requestedBy: string) => {
  const archivePath = getArchivePath(id);
  const stats = await fs.stat(archivePath);
  if (!stats.isFile()) throw new Error('النسخة الاحتياطية غير موجودة');
  try {
    await fs.access(getRestoreMarkerPath());
    throw new Error('توجد عملية استعادة معلقة بالفعل');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const checkpoint = await prisma.$queryRawUnsafe<{ busy: number }[]>('PRAGMA wal_checkpoint(TRUNCATE)');
  if (checkpoint[0]?.busy) {
    throw new Error('تعذر إيقاف الكتابة إلى قاعدة البيانات؛ أعد المحاولة بعد انتهاء العمليات الجارية');
  }
  const markerPath = getRestoreMarkerPath();
  await fs.mkdir(path.dirname(markerPath), { recursive: true });
  try {
    await fs.writeFile(markerPath, JSON.stringify({
      backupId: id,
      requestedBy,
      requestedAt: new Date().toISOString(),
    }), { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('توجد عملية استعادة معلقة بالفعل');
    }
    throw error;
  }
};

export const isRestorePending = async () => {
  try {
    await fs.access(getRestoreMarkerPath());
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
};
