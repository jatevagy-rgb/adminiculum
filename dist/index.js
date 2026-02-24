"use strict";
/**
 * Adminiculum Backend V2 - Main Application Entry Point
 * Legal Document Management System API
 * Modular Architecture
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const js_yaml_1 = __importDefault(require("js-yaml"));
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT || '3000', 10);
// Middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin)
            return callback(null, true);
        // Allow localhost for development
        if (origin.match(/^http:\/\/localhost:\d+$/)) {
            return callback(null, true);
        }
        // Allow Azure URLs
        if (origin.includes('azurewebsites.net')) {
            return callback(null, true);
        }
        // Allow all HTTPS origins in production
        if (origin.startsWith('https://')) {
            return callback(null, true);
        }
        callback(null, true); // Allow all for now
    },
    credentials: true,
}));
app.use((0, morgan_1.default)('combined'));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Health check
app.get('/health', (_req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});
// Root endpoint - API info
app.get('/', (_req, res) => {
    res.json({
        name: 'Adminiculum API V2',
        version: '2.0.0',
        description: 'Legal Document Management System API',
        endpoints: {
            health: '/health',
            auth: '/api/v1/auth',
            users: '/api/v1/users',
            cases: '/api/v1/cases',
            tasks: '/api/v1/tasks',
            contracts: '/api/v1/contracts',
            openapi: '/api/v1/openapi.json'
        }
    });
});
// ========================================
// OpenAPI Spec Endpoint (for Power Apps Custom Connector)
// ========================================
app.get('/api/v1/openapi.json', (_req, res) => {
    try {
        const swaggerPath = path_1.default.join(__dirname, '..', 'swagger.yaml');
        const swaggerContent = fs_1.default.readFileSync(swaggerPath, 'utf8');
        const swaggerJson = js_yaml_1.default.load(swaggerContent);
        // Power Apps doesn't accept protocol in host
        const baseUrl = process.env.WEBSITE_HOSTNAME || 'localhost:3000';
        swaggerJson.servers = [{ url: 'https://' + baseUrl }];
        res.json(swaggerJson);
    }
    catch (error) {
        console.error('Error loading OpenAPI spec:', error);
        res.status(500).json({ error: 'Failed to load OpenAPI specification' });
    }
});
// Power Apps root endpoint (no partial path in URL)
app.get('/openapi.json', (_req, res) => {
    try {
        const swaggerPath = path_1.default.join(__dirname, '..', 'swagger.yaml');
        const swaggerContent = fs_1.default.readFileSync(swaggerPath, 'utf8');
        const swaggerJson = js_yaml_1.default.load(swaggerContent);
        // Power Apps doesn't accept protocol in host
        const baseUrl = process.env.WEBSITE_HOSTNAME || 'localhost:3000';
        swaggerJson.servers = [{ url: 'https://' + baseUrl }];
        res.json(swaggerJson);
    }
    catch (error) {
        console.error('Error loading OpenAPI spec:', error);
        res.status(500).json({ error: 'Failed to load OpenAPI specification' });
    }
});
// ========================================
// API Routes - V2 Modular Structure
// ========================================
// Auth Module
const routes_1 = __importDefault(require("./modules/auth/routes"));
app.use('/api/v1/auth', routes_1.default);
// Users Module
const routes_2 = __importDefault(require("./modules/users/routes"));
app.use('/api/v1/users', routes_2.default);
// Cases Module
const routes_3 = __importDefault(require("./modules/cases/routes"));
app.use('/api/v1/cases', routes_3.default);
// Tasks Module
const routes_4 = __importDefault(require("./modules/tasks/routes"));
app.use('/api/v1/tasks', routes_4.default);
// Settings Module
const routes_5 = __importDefault(require("./modules/settings/routes"));
app.use('/api/v1/settings', routes_5.default);
// Anonymize Module
const routes_6 = __importDefault(require("./modules/anonymize/routes"));
app.use('/api/v1', routes_6.default);
// Matters Module
const matters_1 = __importDefault(require("./routes/matters"));
app.use('/api/v1/matters', matters_1.default);
// Time Entries Module
const timeEntries_1 = __importDefault(require("./routes/timeEntries"));
app.use('/api/v1/time-entries', timeEntries_1.default);
// Client Portal Module (read-only for clients)
const clientPortal_1 = __importDefault(require("./routes/clientPortal"));
app.use('/api/v1/client-portal', clientPortal_1.default);
// Contracts Module
const routes_7 = __importDefault(require("./modules/contracts/routes"));
app.use('/api/v1/contracts', routes_7.default);
// Workgroups Module (Client Workload Tracking)
const routes_8 = __importDefault(require("./modules/workgroups/routes"));
app.use('/api/v1', routes_8.default);
// Migration Runner (temporary - for database setup)
const migrate_1 = require("./routes/migrate");
app.post('/api/v1/migrate', migrate_1.runMigration);
// ========================================
// Error Handling
// ========================================
// 404 handler
app.use((_req, res) => {
    res.status(404).json({ message: 'Endpoint not found' });
});
// Global error handler
app.use((err, _req, res, _next) => {
    console.error('Error:', err);
    res.status(500).json({
        message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    });
});
// ========================================
// Start Server
// ========================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Adminiculum API V2 running on http://localhost:${PORT}`);
});
exports.default = app;
//# sourceMappingURL=index.js.map