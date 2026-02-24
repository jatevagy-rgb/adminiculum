"use strict";
/**
 * Migration Runner Endpoint - Runs prisma db push
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigration = void 0;
const client_1 = require("@prisma/client");
const child_process_1 = require("child_process");
const prisma = new client_1.PrismaClient();
const runMigration = async (req, res) => {
    try {
        console.log('Starting database migration...');
        // Connect to database
        await prisma.$connect();
        console.log('Connected to database');
        // Check existing tables
        const result = await prisma.$queryRaw `
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
        const tableCount = Number(result[0]?.count || 0);
        console.log(`Found ${tableCount} tables in public schema`);
        // Run prisma db push to create/update tables
        console.log('Running prisma db push...');
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
        // Check tables after push
        const result2 = await prisma.$queryRaw `
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
        const tableCount2 = Number(result2[0]?.count || 0);
        console.log(`Found ${tableCount2} tables after push`);
        // List tables
        const tables = await prisma.$queryRaw `
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
    }
    catch (error) {
        console.error('Migration error:', error);
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
exports.runMigration = runMigration;
exports.default = exports.runMigration;
//# sourceMappingURL=migrate.js.map