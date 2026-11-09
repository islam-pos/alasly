import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { PrismaClient } from './lib/prisma-client';
import { extract } from 'tar';
import {
  getBackupArchivePath,
  getBackupDirectory,
  getRestoreMarkerPath,
  isSafeBackupId,
  resolveDatabaseFile,
} from './services/backups';

type RestoreManifest = {
  formatVersion: number;
  databaseFile: string;
  attachmentsDirectory: string;
};

export const restorePendingBackup = async () => {
  const markerPath = getRestoreMarkerPath();
  let marker: { backupId: string } | null = null;
  try {
    marker = JSON.parse(await fs.readFile(markerPath, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw new Error('تعذرت قراءة طلب الاستعادة المعلق');
  }
  if (!marker || !isSafeBackupId(marker.backupId)) {
    throw new Error('معرّف النسخة الاحتياطية في طلب الاستعادة غير صالح');
  }

  const backupDirectory = getBackupDirectory();
  const restoreDirectory = path.join(backupDirectory, `.restore-${randomUUID()}`);
  const archivePath = getBackupArchivePath(marker.backupId);
  const databaseFile = resolveDatabaseFile();
  const dataDirectory = path.dirname(backupDirectory);
  const productionAttachmentDirectory = path.join(dataDirectory, 'repair-attachments');
  const safetyDirectory = path.join(backupDirectory, `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const walPath = `${databaseFile}-wal`;
  const shmPath = `${databaseFile}-shm`;

  await fs.mkdir(restoreDirectory, { recursive: true });
  try {
    await extract({ file: archivePath, cwd: restoreDirectory, strip: 1, strict: true });
    const manifest = JSON.parse(await fs.readFile(path.join(restoreDirectory, 'manifest.json'), 'utf8')) as RestoreManifest;
    if (manifest.formatVersion !== 1 || manifest.databaseFile !== 'database.sqlite'
      || manifest.attachmentsDirectory !== 'repair-attachments') {
      throw new Error('صيغة النسخة الاحتياطية غير مدعومة أو غير مكتملة');
    }

    const stagedDatabasePath = path.join(restoreDirectory, 'database.sqlite');
    const stagedPrisma = new PrismaClient({
      datasources: { db: { url: `file:${stagedDatabasePath}` } },
    });
    try {
      const integrity = await stagedPrisma.$queryRawUnsafe<{ integrity_check: string }[]>('PRAGMA integrity_check');
      if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') {
        throw new Error('فشل فحص سلامة قاعدة البيانات الموجودة في النسخة الاحتياطية');
      }
    } finally {
      await stagedPrisma.$disconnect();
    }

    await fs.mkdir(safetyDirectory, { recursive: true });
    let databaseMoved = false;
    let databaseReplaced = false;
    let attachmentsMoved = false;
    let attachmentsReplaced = false;
    try {
      await fs.rename(databaseFile, path.join(safetyDirectory, 'database-before-restore.sqlite'));
      databaseMoved = true;
      await fs.rename(stagedDatabasePath, databaseFile);
      databaseReplaced = true;
      await fs.rm(walPath, { force: true });
      await fs.rm(shmPath, { force: true });

      const stagedAttachments = path.join(restoreDirectory, 'repair-attachments');
      if (await fs.stat(stagedAttachments).then(() => true).catch(() => false)) {
        await fs.rename(productionAttachmentDirectory, path.join(safetyDirectory, 'repair-attachments-before-restore'))
          .catch((error) => {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          });
        attachmentsMoved = true;
        await fs.rename(stagedAttachments, productionAttachmentDirectory);
        attachmentsReplaced = true;
      }
      await fs.rm(markerPath);
    } catch (error) {
      if (databaseReplaced) await fs.rm(databaseFile, { force: true }).catch(() => undefined);
      if (databaseMoved) {
        await fs.rename(path.join(safetyDirectory, 'database-before-restore.sqlite'), databaseFile).catch((rollbackError) => {
          console.error('Database restore rollback failed:', rollbackError);
        });
      }
      if (attachmentsMoved) {
        if (attachmentsReplaced) await fs.rm(productionAttachmentDirectory, { recursive: true, force: true }).catch(() => undefined);
        await fs.rename(path.join(safetyDirectory, 'repair-attachments-before-restore'), productionAttachmentDirectory)
          .catch((rollbackError) => console.error('Attachment restore rollback failed:', rollbackError));
      }
      throw error;
    }
    console.log(`Database and attachments restored from ${marker.backupId}; safety copy: ${safetyDirectory}`);
  } finally {
    await fs.rm(restoreDirectory, { recursive: true, force: true }).catch((error) => {
      console.error('Failed to remove restore staging directory:', error);
    });
  }
};

if (require.main === module) {
  restorePendingBackup().catch((error) => {
    console.error('Pending backup restore failed; the restore request remains available for retry:', error);
    process.exitCode = 1;
  });
}
