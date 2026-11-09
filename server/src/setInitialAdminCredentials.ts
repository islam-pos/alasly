import bcrypt from 'bcryptjs';
import { prisma } from './lib/prisma';

const setInitialAdminCredentials = async () => {
  const admin = await prisma.user.findUnique({ where: { username: 'admin' } });
  if (!admin) throw new Error('The admin account was not found');

  await prisma.user.update({
    where: { id: admin.id },
    data: {
      passwordHash: await bcrypt.hash('admin', 12),
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
