/**
 * Migration Runner Endpoint
 * Temporary endpoint to run Prisma migrations
 */

import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const runMigration = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('Starting migration...');
    
    // Run prisma migrate deploy
    const { stdout, stderr } = await execAsync('npx prisma migrate deploy', {
      cwd: process.cwd(),
      env: process.env
    });
    
    console.log('Migration stdout:', stdout);
    console.log('Migration stderr:', stderr);
    
    res.json({
      success: true,
      message: 'Migration completed',
      stdout,
      stderr
    });
  } catch (error: any) {
    console.error('Migration error:', error);
    res.status(500).json({
      success: false,
      message: 'Migration failed',
      error: error.message
    });
  }
};

export default runMigration;
