/**
 * Adminiculum Database Seed Script
 * Creates initial practice areas
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const practiceAreas = [
  { name: 'Banking, finance and capital markets', code: 'BANK', color: '#3b82f6' },
  { name: 'Commercial, corporate and M&A', code: 'CORP', color: '#6366f1' },
  { name: 'Competition', code: 'COMP', color: '#8b5cf6' },
  { name: 'Data privacy and data protection', code: 'DATA', color: '#ec4899' },
  { name: 'Dispute resolution', code: 'DISP', color: '#f59e0b' },
  { name: 'Employment', code: 'EMP', color: '#10b981' },
  { name: 'Intellectual property', code: 'IP', color: '#f97316' },
  { name: 'Projects and energy', code: 'PROJ', color: '#06b6d4' },
  { name: 'Real estate and construction', code: 'RE', color: '#22c55e' },
  { name: 'Tax', code: 'TAX', color: '#eab308' },
  { name: 'TMT', code: 'TMT', color: '#ef4444' },
];

async function main() {
  console.log('🌱 Starting database seed...');

  // Create Practice Areas
  for (const pa of practiceAreas) {
    await prisma.practiceArea.upsert({
      where: { code: pa.code },
      update: {},
      create: {
        name: pa.name,
        code: pa.code,
        color: pa.color,
        description: `${pa.name} jogterület`,
      },
    });
    console.log(`  ✓ Created practice area: ${pa.name}`);
  }

  console.log('✅ Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
