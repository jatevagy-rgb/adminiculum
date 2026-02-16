/**
 * Drive Service
 * SharePoint document library operations via Graph API
 * 
 * This is the unified SharePoint service that consolidates all document
 * and folder operations through Microsoft Graph API.
 */

import graphClient from './graphClient';
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

const SITE_PATH = '/sites/LegalCases';

class DriveService {
  private siteId: string = '';

  private async getSiteId(): Promise<string> {
    if (!this.siteId) {
      const site = await graphClient.get<any>(`/sites/root:${SITE_PATH}`);
      this.siteId = site.id;
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
      const uploadPath = `root:/${options.caseId}/${folderPath}/${options.fileName}`;

      const response = await graphClient.put<any>(`/sites/${siteId}/drive/items/${uploadPath}/content`, options.content, {
        siteId,
      });

      return {
        success: true,
        item: response,
        webUrl: response.webUrl,
        version: response.file?.versions?.current?.id || '1',
      };
    } catch (error) {
      console.error('Error uploading document:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Download document from SharePoint
   */
  async downloadDocument(documentId: string): Promise<Buffer | null> {
    try {
      const siteId = await this.getSiteId();
      const response = await graphClient.get<any>(`/sites/${siteId}/drive/items/${documentId}/content`, { siteId });
      return Buffer.from(response);
    } catch (error) {
      console.error('Error downloading document:', error);
      return null;
    }
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
      console.error('Error getting document:', error);
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
        error: error instanceof Error ? error.message : 'Unknown error',
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
      console.error('Error checking out document:', error);
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
      console.error('Error checking in document:', error);
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
      console.error('Error getting versions:', error);
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
      console.error('Error creating case folders:', error);
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
      console.error('Error moving file:', error);
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
      console.error('Error searching documents:', error);
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
      console.error('Error getting case documents:', error);
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
      console.error('Error deleting document:', error);
      return false;
    }
  }
}

export default new DriveService();
