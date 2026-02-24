"use strict";
/**
 * Migration Runner Endpoint - Simple version using Prisma db push
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigration = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const runMigration = async (req, res) => {
    try {
        console.log('Starting database migration...');
        // Use Prisma db push to create tables from schema
        // This is simpler than migrate deploy and works for initial setup
        await prisma.$connect();
        console.log('Connected to database');
        // Check if tables exist
        const result = await prisma.$queryRaw `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
        const tables = result;
        console.log('Existing tables:', tables);
        if (tables.length === 0) {
            // No tables - we need to create them
            // Use prisma migrate for this
            console.log('No tables found, running migration...');
            // Run prisma generate first to ensure client is up to date
            const { execSync } = require('child_process');
            try {
                execSync('npx prisma generate', { stdio: 'inherit' });
                execSync('npx prisma db push', { stdio: 'inherit' });
                console.log('Migration completed');
            }
            catch (e) {
                console.error('Migration error:', e.message);
                throw e;
            }
        }
        res.json({
            success: true,
            message: 'Database check completed',
            tables: tables.length
        });
    }
    catch (error) {
        console.error('Migration error:', error);
        res.status(500).json({
            success: false,
            message: 'Migration failed',
            error: error.message
        });
    }
    finally {
        await prisma.$disconnect();
    }
};
exports.runMigration = runMigration;
exports.default = exports.runMigration;
//# sourceMappingURL=migrate.js.map