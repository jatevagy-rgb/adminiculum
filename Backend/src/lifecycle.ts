/**
 * Application Lifecycle Orchestrator
 *
 * Coordinates startup (pg-boss before Express HTTP listener) and graceful shutdown (HTTP close before draining jobs).
 */

import http from 'http';
import express from 'express';
import { JobService } from './modules/jobs/jobService';

export interface LifecycleDependencies {
  app: express.Application;
  jobService: JobService;
  port?: number;
  host?: string;
  exitFn?: (code: number) => void;
  onStartupValidation?: () => void;
}

export class AppLifecycle {
  private isShuttingDown = false;
  private server: http.Server | null = null;
  private app: express.Application;
  private jobService: JobService;
  private port: number;
  private host: string;
  private exitFn: (code: number) => void;
  private onStartupValidation?: () => void;

  constructor(deps: LifecycleDependencies) {
    this.app = deps.app;
    this.jobService = deps.jobService;
    this.port = deps.port ?? 3001;
    this.host = deps.host ?? '0.0.0.0';
    this.exitFn = deps.exitFn ?? ((code) => process.exit(code));
    this.onStartupValidation = deps.onStartupValidation;
  }

  public async bootstrap(customPort?: number): Promise<http.Server> {
    const listenPort = customPort ?? this.port;

    // 1. If background jobs are enabled, initialize pg-boss BEFORE accepting HTTP traffic
    if (this.jobService.isEnabled()) {
      try {
        await this.jobService.start();
      } catch (err) {
        console.error('[Startup] FATAL: Failed to start background job service:', err);
        throw err;
      }
    }

    // 2. Start HTTP listener only after job service is ready
    return new Promise<http.Server>((resolve, reject) => {
      let isListening = false;
      const onListen = () => {
        if (this.onStartupValidation) {
          this.onStartupValidation();
        }
        console.log(`🚀 Adminiculum API running on http://${this.host}:${listenPort}`);
        isListening = true;
        if (this.server) {
          resolve(this.server);
        }
      };

      const serverInstance = this.app.listen(listenPort, this.host, onListen);
      this.server = serverInstance;

      serverInstance.on('error', (err) => {
        reject(err);
      });

      if (isListening) {
        resolve(serverInstance);
      }
    });
  }

  public async handleGracefulShutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) {
      console.log(`[Shutdown] Already shutting down. Ignoring duplicate signal: ${signal}`);
      return;
    }
    this.isShuttingDown = true;
    console.log(`[Shutdown] Received ${signal}, closing HTTP server to reject new connections...`);

    const forceExitTimer = setTimeout(() => {
      console.error('[Shutdown] Forcefully terminating process after shutdown timeout.');
      this.exitFn(1);
    }, 10000);
    if (typeof forceExitTimer.unref === 'function') {
      forceExitTimer.unref();
    }

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => {
          console.log('[Shutdown] HTTP server closed, draining background jobs...');
          resolve();
        });
      });
    }

    if (this.jobService.isStarted()) {
      await this.jobService.stop({ graceful: true, timeout: 5000 });
    }

    clearTimeout(forceExitTimer);
    this.exitFn(0);
  }

  public getServer(): http.Server | null {
    return this.server;
  }

  public setServer(server: http.Server | null): void {
    this.server = server;
  }

  public getIsShuttingDown(): boolean {
    return this.isShuttingDown;
  }

  public resetShutdownStateForTesting(): void {
    this.isShuttingDown = false;
    this.server = null;
  }
}
