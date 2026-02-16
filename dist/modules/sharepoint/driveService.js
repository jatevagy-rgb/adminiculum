/**
 * Drive Service
 * SharePoint document library operations via Graph API
 *
 * This is the unified SharePoint service that consolidates all document
 * and folder operations through Microsoft Graph API.
 */
import graphClient from './graphClient';
import { SHAREPOINT_FOLDERS, } from './types';
const SITE_PATH = '/sites/LegalCases';
class DriveService {
    siteId = '';
    async getSiteId() {
        if (!this.siteId) {
            const site = await graphClient.get(`/sites/root:${SITE_PATH}`);
            this.siteId = site.id;
        }
        return this.siteId;
    }
    /**
     * Upload document to SharePoint
     */
    async uploadDocument(options) {
        try {
            const siteId = await this.getSiteId();
            const folderPath = options.folder || SHAREPOINT_FOLDERS.CONTRACTS;
            const uploadPath = `root:/${options.caseId}/${folderPath}/${options.fileName}`;
            const response = await graphClient.put(`/sites/${siteId}/drive/items/${uploadPath}/content`, options.content, {
                siteId,
            });
            return {
                success: true,
                item: response,
                webUrl: response.webUrl,
                version: response.file?.versions?.current?.id || '1',
            };
        }
        catch (error) {
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
    async downloadDocument(documentId) {
        try {
            const siteId = await this.getSiteId();
            const response = await graphClient.get(`/sites/${siteId}/drive/items/${documentId}/content`, { siteId });
            return Buffer.from(response);
        }
        catch (error) {
            console.error('Error downloading document:', error);
            return null;
        }
    }
    /**
     * Get document metadata
     */
    async getDocument(documentId) {
        try {
            const siteId = await this.getSiteId();
            const response = await graphClient.get(`/sites/${siteId}/drive/items/${documentId}`, { siteId });
            return response;
        }
        catch (error) {
            console.error('Error getting document:', error);
            return null;
        }
    }
    /**
     * Upload new version of document
     */
    async uploadNewVersion(documentId, content) {
        try {
            const siteId = await this.getSiteId();
            const response = await graphClient.put(`/sites/${siteId}/drive/items/${documentId}/content`, content, { siteId });
            return {
                success: true,
                item: response,
                webUrl: response.webUrl,
                version: response.file?.versions?.current?.id || '1',
            };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    /**
     * Check out document for editing
     */
    async checkoutDocument(documentId, userId) {
        try {
            const siteId = await this.getSiteId();
            await graphClient.post(`/sites/${siteId}/drive/items/${documentId}/checkout`, {}, { siteId });
            return true;
        }
        catch (error) {
            console.error('Error checking out document:', error);
            return false;
        }
    }
    /**
     * Check in document after editing
     */
    async checkinDocument(documentId, _userId, comment) {
        try {
            const siteId = await this.getSiteId();
            await graphClient.post(`/sites/${siteId}/drive/items/${documentId}/checkin`, { comment }, { siteId });
            return true;
        }
        catch (error) {
            console.error('Error checking in document:', error);
            return false;
        }
    }
    /**
     * Get document versions
     */
    async getDocumentVersions(documentId) {
        try {
            const siteId = await this.getSiteId();
            const response = await graphClient.get(`/sites/${siteId}/drive/items/${documentId}/versions`, { siteId });
            return response.value || [];
        }
        catch (error) {
            console.error('Error getting versions:', error);
            return [];
        }
    }
    /**
     * Create folder structure for a case with 8 subfolders (workflow-aligned)
     */
    async createCaseFolders(caseNumber, caseName) {
        try {
            const siteId = await this.getSiteId();
            const caseFolderName = `${caseNumber} - ${caseName}`;
            const subfolders = [];
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
            const mainFolderResponse = await graphClient.post(`/sites/${siteId}/drive/root/children`, {
                name: caseFolderName,
                folder: {},
                '@microsoft.graph.conflictBehavior': 'rename',
            }, { siteId });
            const mainFolder = {
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
                const subfolderResponse = await graphClient.post(`/sites/${siteId}/drive/root:/${caseFolderName}:/children`, {
                    name: folderName,
                    folder: {},
                    '@microsoft.graph.conflictBehavior': 'fail',
                }, { siteId });
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
        }
        catch (error) {
            console.error('Error creating case folders:', error);
            return null;
        }
    }
    /**
     * Check if folder exists
     */
    async folderExists(relativePath) {
        try {
            const siteId = await this.getSiteId();
            await graphClient.get(`/sites/${siteId}/drive/root:${relativePath}`, { siteId });
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Move file to another folder
     */
    async moveFile(documentId, newFolderPath) {
        try {
            const siteId = await this.getSiteId();
            const document = await this.getDocument(documentId);
            if (!document)
                return null;
            const response = await graphClient.patch(`/sites/${siteId}/drive/items/${documentId}`, {
                parentReference: {
                    path: `/drive/root:/${newFolderPath}`,
                },
                name: document.name,
            }, { siteId });
            return response;
        }
        catch (error) {
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
    async saveAnonymizedDocument(caseNumber, originalFileName, content) {
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
    async listAnonymizedDocuments(caseNumber) {
        return this.getCaseDocuments(caseNumber, '08_Anonymized');
    }
    /**
     * Search documents in case folder
     */
    async searchDocuments(query) {
        try {
            const siteId = await this.getSiteId();
            const response = await graphClient.get(`/sites/${siteId}/drive/root/search(q='${encodeURIComponent(query)}')`, { siteId });
            return response.value || [];
        }
        catch (error) {
            console.error('Error searching documents:', error);
            return [];
        }
    }
    /**
     * Get all documents in case folder
     */
    async getCaseDocuments(caseId, folder) {
        try {
            const siteId = await this.getSiteId();
            const folderPath = folder ? `/${folder}` : '';
            const response = await graphClient.get(`/sites/${siteId}/drive/root:/${caseId}${folderPath}:/children`, { siteId });
            return response.value || [];
        }
        catch (error) {
            console.error('Error getting case documents:', error);
            return [];
        }
    }
    /**
     * Delete document from SharePoint
     */
    async deleteDocument(documentId) {
        try {
            const siteId = await this.getSiteId();
            await graphClient.post(`/sites/${siteId}/drive/items/${documentId}/delete`, {}, { siteId });
            return true;
        }
        catch (error) {
            console.error('Error deleting document:', error);
            return false;
        }
    }
}
export default new DriveService();
//# sourceMappingURL=driveService.js.map