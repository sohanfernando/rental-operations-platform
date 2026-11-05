import { Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { hashPassword } from '../auth/password';
import { loadEnvironment } from '../config';
import { createDatabase } from './database';

const staffSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(12).max(128),
});

const equipment = [
  {
    name: 'Sony A7 IV',
    description: 'Full-frame mirrorless camera for hybrid photo and video shoots.',
    assetTags: ['CAM-001'],
    photo: 'sony-a7-iv.jpg',
  },
  {
    name: 'Manfrotto Befree',
    description: 'Compact travel tripod with a ball head and quick-release plate.',
    assetTags: ['TRI-001', 'TRI-002'],
    photo: 'manfrotto-befree.jpg',
  },
  {
    name: 'Aputure Amaran 200x',
    description: 'Bi-color LED fixture for interviews and small studio setups.',
    assetTags: ['LGT-001'],
    photo: 'amaran-200x.jpg',
  },
];

async function seed() {
  const environment = loadEnvironment();
  if (environment.NODE_ENV !== 'development') {
    throw new Error('The demo seed requires NODE_ENV=development.');
  }

  const { DEMO_STAFF_EMAIL: email, DEMO_STAFF_PASSWORD: password } = process.env;
  const staff = email || password ? staffSchema.safeParse({ email, password }) : undefined;
  if (staff && !staff.success) {
    throw new Error('Set DEMO_STAFF_EMAIL and a DEMO_STAFF_PASSWORD of 12–128 characters.');
  }

  const database = createDatabase(environment.DATABASE_URL);
  try {
    const staffCredentials = staff && {
      email: staff.data.email,
      passwordHash: await hashPassword(staff.data.password),
    };
    const catalog = await Promise.all(equipment.map(async (item) => ({
      ...item,
      image: new Uint8Array(await readFile(resolve(__dirname, '../../prisma/demo-images', item.photo))),
    })));
    await database.$transaction(async (transaction) => {
      if (staffCredentials) {
        const account = await transaction.user.upsert({
          where: { email: staffCredentials.email },
          create: { ...staffCredentials, role: 'STAFF' },
          update: {},
          select: { role: true },
        });
        if (account.role !== 'STAFF') {
          throw new Error('Choose a demo staff email that is not already a customer account.');
        }
      }

      for (const { name, description, assetTags, image } of catalog) {
        const type = await transaction.equipmentType.upsert({
          where: { name },
          create: { name, description },
          update: {},
        });
        if (!await transaction.equipmentImage.count({ where: { equipmentTypeId: type.id } })) {
          await transaction.equipmentImage.create({
            data: { equipmentTypeId: type.id, contentType: 'image/jpeg', data: image },
          });
        }

        for (const assetTag of assetTags) {
          await transaction.equipmentUnit.upsert({
            where: { assetTag },
            create: { assetTag, equipmentTypeId: type.id },
            update: {},
          });
        }
      }
    });
    console.log(staff ? 'Seeded equipment and demo staff.' : 'Seeded equipment. No demo staff was configured.');
  } finally {
    await database.$disconnect();
  }
}

seed().catch((error: unknown) => {
  if (error instanceof Error && error.constructor === Error) {
    console.error(error.message);
  } else {
    new Logger('Seed').error('Demo seed failed. Check database connectivity and migrations.');
  }
  process.exitCode = 1;
});
