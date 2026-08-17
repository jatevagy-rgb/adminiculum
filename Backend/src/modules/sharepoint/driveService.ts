/**
 * Drive Service
 * SharePoint document library operations via Graph API
 * 
 * This is the unified SharePoint service that consolidates all document
 * and folder operations through Microsoft Graph API.
 */

import graphClient, { GraphClientError } from './graphClient';
import {
  SharePointItem,
  SharePointVersion,
  UploadOptions,
  DocumentOperationResult,
  SHAREPOINT_FOLDERS,
  CaseFolderResult,
  WorkflowToSPFolder,
  SPFolderToWorkflow,
} from './types';

// Canonical: SHAREPOINT_SITE_URL
// Legacy compatibility: SP_SITE_URL
const SITE_URL = process.env.SHAREPOINT_SITE_URL || process.env.SP_SITE_URL || '';

class DriveService {
  private siteId: string = '';

  private toSafeErrorMessage(operation: string, error: unknown): string {
    if (operation === 'sharepoint-upload') {
      return 'A dokumentum feltöltése jelenleg nem sikerült. Próbálja újra, vagy jelezze a rendszer adminisztrátorának.';
    }
    if (error instanceof GraphClientError) {
      const statusPart = error.status ? ` (${error.status})` : '';
      return `${operation} failed${statusPart}: ${error.message}`;
    }
    if (error instanceof Error) {
      return `${operation} failed: ${error.message}`;
    }
    return `${operation} failed: Unknown error`;
  }

  private ensureConfiguredOrThrow(operation: string): void {
    if (!graphClient.isConfigured()) {
      throw new Error(
        `SharePoint nincs konfigurálva ehhez a környezethez. (${operation})`
      );
    }
  }

  private async getSiteId(): Promise<string> {
    this.ensureConfiguredOrThrow('site-resolution');
    if (!this.siteId) {
      const configuredSiteId = graphClient.getConfig().siteId?.trim();
      if (configuredSiteId) {
        this.siteId = configuredSiteId;
        return this.siteId;
      }

      if (!SITE_URL) {
        throw new Error('SHAREPOINT_SITE_URL/SP_SITE_URL nincs beállítva.');
      }

      const parsed = new URL(SITE_URL);
      const host = parsed.hostname;
      const sitePath = (parsed.pathname || '/').replace(/\/+$/, '') || '/';

      const candidates = [
        `/sites/${host}:${sitePath}`,
        `/sites/root:${sitePath}`,
      ];

      let lastError: unknown = null;
      for (const endpoint of candidates) {
        try {
          const site = await graphClient.get<any>(endpoint);
          if (site?.id) {
            this.siteId = site.id;
            break;
          }
        } catch (error) {
          lastError = error;
        }
      }

      if (!this.siteId) {
        throw new Error(
          `Unable to resolve SharePoint site id from configured site URL. Tried endpoints: ${candidates.join(', ')}. Last error: ${
            lastError instanceof Error ? lastError.message : String(lastError)
          }`
        );
      }
    }
    return this.siteId;
  }

  /**
   * Upload document to SharePoint
   */
  async uploadDocument(options: UploadOptions): Promise<DocumentOperationResult> {
    try {
      const siteId = await this.getSiteId();
      const folderPath = options.folder || SHAREPOINT_FOLDERS.CONTRACTS;
      const uploadPath = `/${options.caseId}/${folderPath}/${options.fileName}`.replace(/\/+/g, '/');

      const response = await graphClient.put<any>(`/sites/${siteId}/drive/root:${uploadPath}:/content`, options.content, {
        siteId,
      });

      return {
        success: true,
        item: response,
        webUrl: response.webUrl,
        version: response.file?.versions?.current?.id || '1',
      };
    } catch (error) {
      return {
        success: false,
        error: this.toSafeErrorMessage('sharepoint-upload', error),
      };
    }
  }

  /**
   * Download document from SharePoint
   */
  async downloadDocumentResult(
    documentId: string
  ): Promise<{ success: true; content: Buffer } | { success: false; error: string; code: string; status?: number }> {
    try {
      const siteId = await this.getSiteId();
      const response = await graphClient.get<Buffer>(
        `/sites/${siteId}/drive/items/${documentId}/content`,
        { siteId, asBinary: true }
      );
      return { success: true, content: response };
    } catch (error) {
      if (error instanceof GraphClientError) {
        const code = error.code || 'SHAREPOINT_DOWNLOAD_FAILED';
        const status = error.status;
        if (status === 404) {
          return {
            success: false,
            code: 'SHAREPOINT_FILE_NOT_FOUND',
            status,
            error: 'A SharePoint fájl nem található.',
          };
        }
        if (status === 401 || status === 403) {
          return {
            success: false,
            code: 'SHAREPOINT_PERMISSION_DENIED',
            status,
            error: 'A SharePoint hozzáférés nem engedélyezett ehhez a művelethez.',
          };
        }
        return {
          success: false,
          code,
          status,
          error: this.toSafeErrorMessage('sharepoint-download', error),
        };
      }

      return {
        success: false,
        code: 'SHAREPOINT_DOWNLOAD_FAILED',
        error: this.toSafeErrorMessage('sharepoint-download', error),
      };
    }
  }

  async downloadDocument(documentId: string): Promise<Buffer | null> {
    const result = await this.downloadDocumentResult(documentId);
    return result.success ? result.content : null;
  }

  /**
   * Get document metadata
   */
  async getDocument(documentId: string): Promise<SharePointItem | null> {
    try {
      const siteId = await this.getSiteId();
      const response = await graphClient.get<any>(`/sites/${siteId}/drive/items/${documentId}`, { siteId });
      return response;
    } catch (error) {
      console.error(this.toSafeErrorMessage('sharepoint-metadata', error));
      return null;
    }
  }

  /**
   * Upload new version of document
   */
  async uploadNewVersion(documentId: string, content: Buffer | ReadableStream): Promise<DocumentOperationResult> {
    try {
      const siteId = await this.getSiteId();
      const response = await graphClient.put<any>(`/sites/${siteId}/drive/items/${documentId}/content`, content, { siteId });

      return {
        success: true,
        item: response,
        webUrl: response.webUrl,
        version: response.file?.versions?.current?.id || '1',
      };
    } catch (error) {
      return {
        success: false,
        error: this.toSafeErrorMessage('sharepoint-version-upload', error),
      };
    }
  }

  /**
   * Check out document for editing
   */
  async checkoutDocument(documentId: string, userId: string): Promise<boolean> {
    try {
      const siteId = await this.getSiteId();
      await graphClient.post<any>(`/sites/${siteId}/drive/items/${documentId}/checkout`, {}, { siteId });

      return true;
    } catch (error) {
      console.error(this.toSafeErrorMessage('sharepoint-checkout', error));
      return false;
    }
  }

  /**
   * Check in document after editing
   */
  async checkinDocument(documentId: string, _userId: string, comment: string): Promise<boolean> {
    try {
      const siteId = await this.getSiteId();
      await graphClient.post<any>(`/sites/${siteId}/drive/items/${documentId}/checkin`, { comment }, { siteId });

      return true;
    } catch (error) {
      console.error(this.toSafeErrorMessage('sharepoint-checkin', error));
      return false;
    }
  }

  /**
   * Get document versions
   */
  async getDocumentVersions(documentId: string): Promise<SharePointVersion[]> {
    try {
      const siteId = await this.getSiteId();
      const response = await graphClient.get<any>(`/sites/${siteId}/drive/items/${documentId}/versions`, { siteId });
      return response.value || [];
    } catch (error) {
      console.error(this.toSafeErrorMessage('sharepoint-versions', error));
      return [];
    }
  }

  /**
   * Create folder structure for a case with 8 subfolders (workflow-aligned)
   */
  async createCaseFolders(caseNumber: string, caseName: string): Promise<CaseFolderResult | null> {
    try {
      const siteId = await this.getSiteId();
      const caseFolderName = `${caseNumber} - ${caseName}`;
      const subfolders: SharePointItem[] = [];

      // Workflow-aligned folder names
      const workflowFolders = [
        '01_Client_Input',
        '02_Drafts',
        '03_Review',
        '04_Approved',
        '05_Sent_to_Client',
        '06_Client_Feedback',
        '07_Final',
        '08_Anonymized',
      ];

      // Create main case folder
      const mainFolderResponse = await graphClient.post<any>(
        `/sites/${siteId}/drive/root/children`,
        {
          name: caseFolderName,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'rename',
        },
        { siteId }
      );

      const mainFolder: SharePointItem = {
        id: mainFolderResponse.id,
        name: mainFolderResponse.name,
        webUrl: mainFolderResponse.webUrl,
        createdDateTime: mainFolderResponse.createdDateTime,
        lastModifiedDateTime: mainFolderResponse.lastModifiedDateTime,
        size: mainFolderResponse.size,
        createdBy: mainFolderResponse.createdBy,
        lastModifiedBy: mainFolderResponse.lastModifiedBy,
      };

      // Create subfolders
      for (const folderName of workflowFolders) {
        const subfolderResponse = await graphClient.post<any>(
          `/sites/${siteId}/drive/root:/${caseFolderName}:/children`,
          {
            name: folderName,
            folder: {},
            '@microsoft.graph.conflictBehavior': 'fail',
          },
          { siteId }
        );

        subfolders.push({
          id: subfolderResponse.id,
          name: subfolderResponse.name,
          webUrl: subfolderResponse.webUrl,
          createdDateTime: subfolderResponse.createdDateTime,
          lastModifiedDateTime: subfolderResponse.lastModifiedDateTime,
          size: subfolderResponse.size,
          createdBy: subfolderResponse.createdBy,
          lastModifiedBy: subfolderResponse.lastModifiedBy,
        });
      }

      return {
        mainFolder,
        subfolders,
        path: `/Cases/${caseFolderName}`,
      };
    } catch (error) {
      console.error(this.toSafeErrorMessage('sharepoint-create-folders', error));
      return null;
    }
  }

  /**
   * Check if folder exists
   */
  async folderExists(relativePath: string): Promise<boolean> {
    try {
      const siteId = await this.getSiteId();
      await graphClient.get<any>(`/sites/${siteId}/drive/root:${relativePath}`, { siteId });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Move file to another folder
   */
  async moveFile(documentId: string, newFolderPath: string): Promise<SharePointItem | null> {
    try {
      const siteId = await this.getSiteId();
      const document = await this.getDocument(documentId);
      if (!document) return null;

      const response = await graphClient.patch<any>(
        `/sites/${siteId}/drive/items/${documentId}`,
        {
          parentReference: {
            path: `/drive/root:/${newFolderPath}`,
          },
          name: document.name,
        },
        { siteId }
      );

      return response;
    } catch (error) {
      console.error(this.toSafeErrorMessage('sharepoint-move', error));
      return null;
    }
  }

  // =========================================================================
  // Anonymized Documents
  // =========================================================================

  /**
   * Save anonymized document
   */
  async saveAnonymizedDocument(
    caseNumber: string,
    originalFileName: string,
    content: Buffer
  ): Promise<DocumentOperationResult> {
    const anonymizedFileName = `${originalFileName.replace(/\.[^/.]+$/, '')}_anon.docx`;
    const path = `${caseNumber}/08_Anonymized`;

    return this.uploadDocument({
      caseId: caseNumber,
      fileName: anonymizedFileName,
      content,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      folder: '08_Anonymized',
    });
  }

  /**
   * List anonymized documents for a case
   */
  async listAnonymizedDocuments(caseNumber: string): Promise<SharePointItem[]> {
    return this.getCaseDocuments(caseNumber, '08_Anonymized');
  }

  /**
   * Search documents in case folder
   */
  async searchDocuments(query: string): Promise<SharePointItem[]> {
    try {
      const siteId = await this.getSiteId();
      const response = await graphClient.get<any>(
        `/sites/${siteId}/drive/root/search(q='${encodeURIComponent(query)}')`,
        { siteId }
      );
      return response.value || [];
    } catch (error) {
      console.error(this.toSafeErrorMessage('sharepoint-search', error));
      return [];
    }
  }

  /**
   * Get all documents in case folder
   */
  async getCaseDocuments(caseId: string, folder?: string): Promise<SharePointItem[]> {
    try {
      const siteId = await this.getSiteId();
      const folderPath = folder ? `/${folder}` : '';
      const response = await graphClient.get<any>(
        `/sites/${siteId}/drive/root:/${caseId}${folderPath}:/children`,
        { siteId }
      );
      return response.value || [];
    } catch (error) {
      console.error(this.toSafeErrorMessage('sharepoint-list-case-docs', error));
      return [];
    }
  }

  /**
   * Delete document from SharePoint
   */
  async deleteDocument(documentId: string): Promise<boolean> {
    try {
      const siteId = await this.getSiteId();
      await graphClient.post<any>(
        `/sites/${siteId}/drive/items/${documentId}/delete`,
        {},
        { siteId }
      );
      return true;
    } catch (error) {
      console.error(this.toSafeErrorMessage('sharepoint-delete', error));
      return false;
    }
  }
}

export default new DriveService();
