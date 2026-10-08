import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from './lib/prisma';

const initializeUserPasswords = async () => {
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;
  if (
    typeof adminPassword !== 'string' ||
    Buffer.byteLength(adminPassword) < 16 ||
    Buffer.byteLength(adminPassword) > 72
  ) {
    throw new Error('INITIAL_ADMIN_PASSWORD must be between 16 and 72 bytes');
  }

  const users = await prisma.user.findMany({ select: { id: true, username: true } });
  const admin = users.find((user) => user.username === 'admin');
  if (!admin) throw new Error('The existing admin user was not found');

  const updates = await Promise.all(
    users.map(async (user) => ({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(
          user.id === admin.id ? adminPassword : randomBytes(32).toString('base64url'),
          12,
        ),
      },
    })),
  );

  await prisma.$transaction(updates.map((update) => prisma.user.update(update)));
};

initializeUserPasswords()
  .catch((error) => {
    console.error('Initial account security setup failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
