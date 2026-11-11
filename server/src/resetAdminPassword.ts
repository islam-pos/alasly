import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from './lib/prisma';
import { isValidPassword } from './lib/passwordPolicy';

const resetAdminPassword = async () => {
  const password = process.env.ADMIN_RESET_PASSWORD;
  if (!isValidPassword(password)) {
    throw new Error('ADMIN_RESET_PASSWORD must be 4-15 alphanumeric characters');
  }

  const admin = await prisma.user.findUnique({
    where: { username: 'admin' },
    select: { id: true },
  });
  if (!admin) throw new Error('The admin account was not found');

  await prisma.user.update({
    where: { id: admin.id },
    data: {
      passwordHash: await bcrypt.hash(password, 12),
      mustChangePassword: true,
      failedLoginAttempts: 0,
      loginLockedUntil: null,
    },
  });

  console.info('Administrator password reset completed. Sign in as admin and change it immediately.');
};

resetAdminPassword()
  .catch((error) => {
    console.error('Could not reset the administrator password:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
