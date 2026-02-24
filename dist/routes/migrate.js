"use strict";
/**
 * Migration Runner Endpoint
 * Temporary endpoint to run Prisma migrations
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigration = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const runMigration = async (req, res) => {
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
    }
    catch (error) {
        console.error('Migration error:', error);
        res.status(500).json({
            success: false,
            message: 'Migration failed',
            error: error.message
        });
    }
};
exports.runMigration = runMigration;
exports.default = exports.runMigration;
//# sourceMappingURL=migrate.js.map