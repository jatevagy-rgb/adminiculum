/**
 * Demo Database Seed Script
 * Creates demo users for testing
 */

import bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '@prisma/client';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

if ([process.env.NODE_ENV, process.env.ADMINICULUM_RUNTIME_ENVIRONMENT]
  .some((value) => String(value || '').toLowerCase() === 'production')) {
  throw new Error('demo seed must never run in production.');
}

async function main() {
  console.log('🌱 Seeding database...');

  // Create demo lawyer
  const lawyerPassword = await bcrypt.hash(crypto.randomUUID(), 10);
  
  const lawyer = await prisma.user.upsert({
    where: { email: 'kovacs@adminiculum.hu' },
    update: {},
    create: {
      email: 'kovacs@adminiculum.hu',
      name: 'Kovács Ügyvéd',
      password_hash: lawyerPassword,
      role: Role.LAWYER,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  console.log('✅ Created lawyer:', lawyer.email);

  // Create demo trainee
  const traineePassword = await bcrypt.hash(crypto.randomUUID(), 10);
  
  const trainee = await prisma.user.upsert({
    where: { email: 'nagy@adminiculum.hu' },
    update: {},
    create: {
      email: 'nagy@adminiculum.hu',
      name: 'Nagy Péter',
      password_hash: traineePassword,
      role: Role.TRAINEE,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  console.log('✅ Created trainee:', trainee.email);

  // Create demo assistant
  const assistantPassword = await bcrypt.hash(crypto.randomUUID(), 10);
  
  const assistant = await prisma.user.upsert({
    where: { email: 'szabo@adminiculum.hu' },
    update: {},
    create: {
      email: 'szabo@adminiculum.hu',
      name: 'Szabó Mária',
      password_hash: assistantPassword,
      role: Role.ASSISTANT,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  console.log('✅ Created assistant:', assistant.email);

  console.log('🎉 Seeding completed successfully!');
  console.log('\n📝 Demo users seeded without login credentials.');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
