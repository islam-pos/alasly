import { prisma } from '../lib/prisma';

export const migrateEgyptianLocationDefaults = async () => {
  const company = await prisma.companySetting.updateMany({
    where: {
      country: 'المملكة العربية السعودية',
      OR: [{ city: 'الرياض' }, { address: { contains: 'الرياض' } }],
    },
    data: {
      address: 'القاهرة، جمهورية مصر العربية',
      city: 'القاهرة',
      country: 'جمهورية مصر العربية',
    },
  });

  const mainBranch = await prisma.branch.updateMany({
    where: { name: 'الفرع الرئيسي - الرياض (طريق الملك عبدالعزيز)' },
    data: {
      name: 'الفرع الرئيسي - القاهرة',
      address: 'القاهرة، جمهورية مصر العربية',
    },
  });

  const secondBranch = await prisma.branch.updateMany({
    where: { name: 'فرع الصيانة السريعة - جدة (حي الصفا)' },
    data: {
      name: 'فرع الصيانة السريعة - الإسكندرية',
      address: 'الإسكندرية، جمهورية مصر العربية',
    },
  });

  const migratedCount = company.count + mainBranch.count + secondBranch.count;
  if (migratedCount > 0) {
    console.log(`Updated ${migratedCount} legacy Saudi company and branch locations to Egypt.`);
  }
};
