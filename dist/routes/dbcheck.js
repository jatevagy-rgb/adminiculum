"use strict";
/**
 * Database Check and Sync Endpoint
 * Checks if tables exist and runs db push if needed
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkAndSyncDatabase = void 0;
const client_1 = require("@prisma/client");
const child_process_1 = require("child_process");
const prisma = new client_1.PrismaClient();
const checkAndSyncDatabase = async (req, res) => {
    try {
        console.log('Checking database tables...');
        // Connect to database
        await prisma.$connect();
        // Check if users table exists
        const result = await prisma.$queryRaw `
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
        const tableCount = Number(result[0]?.count || 0);
        console.log(`Found ${tableCount} tables in public schema`);
        if (tableCount === 0) {
            console.log('No tables found! Running prisma db push...');
            // Run prisma db push to create tables
            try {
                (0, child_process_1.execSync)('npx prisma db push --skip-generate', {
                    stdio: 'inherit',
                    env: process.env
                });
                console.log('Database schema pushed successfully!');
            }
            catch (e) {
                console.error('Error pushing schema:', e.message);
                throw e;
            }
        }
        // Check again after push
        const result2 = await prisma.$queryRaw `
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
        const tableCount2 = Number(result2[0]?.count || 0);
        console.log(`Found ${tableCount2} tables after sync`);
        // List all tables
        const tables = await prisma.$queryRaw `
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
        res.json({
            success: true,
            tableCount: tableCount2,
            tables: tables.map(t => t.table_name)
        });
    }
    catch (error) {
        console.error('Database check error:', error);
        res.status(500).json({
            success: false,
            message: error.message,
            stack: error.stack
        });
    }
    finally {
        await prisma.$disconnect();
    }
};
exports.checkAndSyncDatabase = checkAndSyncDatabase;
exports.default = exports.checkAndSyncDatabase;
//# sourceMappingURL=dbcheck.js.map