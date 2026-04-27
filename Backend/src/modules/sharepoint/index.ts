/**
 * SharePoint Module Index
 * Unified SharePoint integration via Microsoft Graph API
 * 
 * This module provides:
 * - graphClient: Low-level Graph API client with token caching
 * - driveService: High-level document and folder operations
 * - types: TypeScript interfaces and constants
 */

export { default as graphClient } from './graphClient';
export { default as driveService } from './driveService';
export * from './types';

// Re-export for convenience
export { 
  SharePointItem,
  SharePointVersion,
  UploadOptions,
  DocumentOperationResult,
  CaseFolderResult,
  SHAREPOINT_FOLDERS,
  WorkflowToSPFolder,
  SPFolderToWorkflow,
} from './types';
