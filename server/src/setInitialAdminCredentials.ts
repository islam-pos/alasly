import bcrypt from 'bcryptjs';
import { prisma } from './lib/prisma';
import { isValidPassword } from './lib/passwordPolicy';

const setInitialAdminCredentials = async () => {
  const initialAdminPassword = process.env.INITIAL_ADMIN_PASSWORD;
  if (!isValidPassword(initialAdminPassword)) {
    throw new Error('INITIAL_ADMIN_PASSWORD must be 4-15 alphanumeric characters');
  }

  const admin = await prisma.user.findUnique({ where: { username: 'admin' } });
  if (!admin) throw new Error('The admin account was not found');

  await prisma.user.update({
    where: { id: admin.id },
    data: {
      passwordHash: await bcrypt.hash(initialAdminPassword, 12),
      mustChangePassword: true,
      failedLoginAttempts: 0,
      loginLockedUntil: null,
    },
  });
};

setInitialAdminCredentials()
  .catch((error) => {
    console.error('Could not set the temporary admin credentials:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
