/**
 * Database Check and Sync Endpoint
 * Checks if tables exist and runs db push if needed
 */

import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

export const checkAndSyncDatabase = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('Checking database tables...');
    
    // Connect to database
    await prisma.$connect();
    
    // Check if users table exists
    const result = await prisma.$queryRaw<{count: bigint}[]>`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    
    const tableCount = Number(result[0]?.count || 0);
    console.log(`Found ${tableCount} tables in public schema`);
    
    if (tableCount === 0) {
      console.log('No tables found! Running prisma db push...');
      
      // Run prisma db push to create tables
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
    }
    
    // Check again after push
    const result2 = await prisma.$queryRaw<{count: bigint}[]>`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    
    const tableCount2 = Number(result2[0]?.count || 0);
    console.log(`Found ${tableCount2} tables after sync`);
    
    // List all tables
    const tables = await prisma.$queryRaw<{table_name: string}[]>`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    
    res.json({
      success: true,
      tableCount: tableCount2,
      tables: tables.map(t => t.table_name)
    });
    
  } catch (error: any) {
    console.error('Database check error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      stack: error.stack
    });
  } finally {
    await prisma.$disconnect();
  }
};

export default checkAndSyncDatabase;
