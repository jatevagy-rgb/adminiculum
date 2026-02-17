/**
 * Adminiculum Backend V2 - Main Application Entry Point
 * Legal Document Management System API
 * Modular Architecture with ts-node
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Middleware
app.use(helmet());
app.use(cors({
  origin: function(origin: string | undefined, callback: (err: Error | null, allow: boolean) => void) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
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
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// ========================================
// OpenAPI Spec Endpoint (for Power Apps Custom Connector)
// ========================================

app.get('/api/v1/openapi.json', (_req: Request, res: Response) => {
  try {
    const swaggerPath = path.join(__dirname, '..', 'swagger.yaml');
    const swaggerContent = fs.readFileSync(swaggerPath, 'utf8');
    const swaggerJson = yaml.load(swaggerContent) as any;
    
    // Power Apps doesn't accept protocol in host
    const baseUrl = process.env.WEBSITE_HOSTNAME || 'localhost:3000';
    swaggerJson.servers = [{ url: 'https://' + baseUrl }];
    
    res.json(swaggerJson);
  } catch (error) {
    console.error('Error loading OpenAPI spec:', error);
    res.status(500).json({ error: 'Failed to load OpenAPI specification' });
  }
});

// Power Apps root endpoint (no partial path in URL)
app.get('/openapi.json', (_req: Request, res: Response) => {
  try {
    const swaggerPath = path.join(__dirname, '..', 'swagger.yaml');
    const swaggerContent = fs.readFileSync(swaggerPath, 'utf8');
    const swaggerJson = yaml.load(swaggerContent) as any;
    
    // Power Apps doesn't accept protocol in host
    const baseUrl = process.env.WEBSITE_HOSTNAME || 'localhost:3000';
    swaggerJson.servers = [{ url: 'https://' + baseUrl }];
    
    res.json(swaggerJson);
  } catch (error) {
    console.error('Error loading OpenAPI spec:', error);
    res.status(500).json({ error: 'Failed to load OpenAPI specification' });
  }
});

// ========================================
// API Routes - V2 Modular Structure
// ========================================

// Auth Module
import authRoutes from './modules/auth/routes';
app.use('/api/v1/auth', authRoutes);

// Users Module
import usersRoutes from './modules/users/routes';
app.use('/api/v1/users', usersRoutes);

// Cases Module
import casesRoutes from './modules/cases/routes';
app.use('/api/v1/cases', casesRoutes);

// Tasks Module
import tasksRoutes from './modules/tasks/routes';
app.use('/api/v1/tasks', tasksRoutes);

// Settings Module
import settingsRoutes from './modules/settings/routes';
app.use('/api/v1/settings', settingsRoutes);

// Anonymize Module
import anonymizeRoutes from './modules/anonymize/routes';
app.use('/api/v1', anonymizeRoutes);

// Matters Module
import mattersRoutes from './routes/matters';
app.use('/api/v1/matters', mattersRoutes);

// Time Entries Module
import timeEntriesRoutes from './routes/timeEntries';
app.use('/api/v1/time-entries', timeEntriesRoutes);

// Client Portal Module (read-only for clients)
import clientPortalRoutes from './routes/clientPortal';
app.use('/api/v1/client-portal', clientPortalRoutes);

// Contracts Module
import contractsRoutes from './modules/contracts/routes';
app.use('/api/v1/contracts', contractsRoutes);

// Workgroups Module (Client Workload Tracking)
import workgroupRoutes from './modules/workgroups/routes';
app.use('/api/v1', workgroupRoutes);

// ========================================
// Error Handling
// ========================================

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: 'Endpoint not found' });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
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

export default app;
