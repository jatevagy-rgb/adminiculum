/**
 * Migration Runner Endpoint - Runs prisma db push
 */

import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

export const runMigration = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('Starting database migration...');
    
    // Connect to database
    await prisma.$connect();
    console.log('Connected to database');
    
    // Check existing tables
    const result = await prisma.$queryRaw<{count: bigint}[]>`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    
    const tableCount = Number(result[0]?.count || 0);
    console.log(`Found ${tableCount} tables in public schema`);
    
    // Run prisma db push to create/update tables
    console.log('Running prisma db push...');
    
    try {
      execSync('npx prisma db push --skip-generate', { 
        stdio: 'inherit',
        env: process.env
      });
      console.log('Database schema pushed successfully!');
    } catch (e: any) {
      console.error('Error pushing schema:', e.message);
      throw e;
    }
    
    // Check tables after push
    const result2 = await prisma.$queryRaw<{count: bigint}[]>`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    
    const tableCount2 = Number(result2[0]?.count || 0);
    console.log(`Found ${tableCount2} tables after push`);
    
    // List tables
    const tables = await prisma.$queryRaw<{table_name: string}[]>`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    
    res.json({
      success: true,
      message: 'Migration completed',
      tableCount: tableCount2,
      tables: tables.map(t => t.table_name)
    });
    
  } catch (error: any) {
    console.error('Migration error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      stack: error.stack
    });
  } finally {
    await prisma.$disconnect();
  }
};

export default runMigration;
