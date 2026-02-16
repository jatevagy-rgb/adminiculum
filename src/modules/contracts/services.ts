/**
 * Contracts Service
 * Handles contract template management and document generation
 */

import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../../prisma/prisma.service';
import { HungarianNumberToWords } from '../../utils/hungarianNumberToWords';
import { driveService } from '../sharepoint';
import {
  ContractTemplate,
  GenerateContractInput,
  GeneratePreviewInput,
  ContractGenerationResult,
  TemplateCategory
} from './types';

// Template storage directory
const TEMPLATES_DIR = path.join(process.cwd(), 'templates');
const GENERATED_DIR = path.join(process.cwd(), 'uploads', 'generated');

class ContractsService {
  /**
   * Initialize template directory
   */
  private initDirectories(): void {
    if (!fs.existsSync(TEMPLATES_DIR)) {
      fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
    }
    if (!fs.existsSync(GENERATED_DIR)) {
      fs.mkdirSync(GENERATED_DIR, { recursive: true });
    }
  }

  /**
   * Get all active templates
   */
  async getTemplates(category?: TemplateCategory): Promise<ContractTemplate[]> {
    const templates = await prisma.contractTemplate.findMany({
      where: {
        isActive: true,
        ...(category ? { category } : {})
      },
      orderBy: { name: 'asc' }
    });

    return templates.map(t => ({
      ...t,
      variables: Array.isArray(t.variables) ? t.variables as any : []
    }));
  }

  /**
   * Get template by ID
   */
  async getTemplateById(id: string): Promise<ContractTemplate | null> {
    const template = await prisma.contractTemplate.findUnique({
      where: { id }
    });

    if (!template) return null;

    return {
      ...template,
      variables: Array.isArray(template.variables) ? template.variables as any : []
    };
  }

  /**
   * Create new template
   */
  async createTemplate(data: {
    name: string;
    description?: string;
    category: TemplateCategory;
    templatePath: string;
    originalFileName?: string;
    variables: any[];
    isDefault?: boolean;
  }): Promise<ContractTemplate | null> {
    try {
      // If setting as default, unset other defaults in same category
      if (data.isDefault) {
        await prisma.contractTemplate.updateMany({
          where: { category: data.category, isDefault: true },
          data: { isDefault: false }
        });
      }

      const template = await prisma.contractTemplate.create({
        data: {
          name: data.name,
          description: data.description,
          category: data.category,
          templatePath: data.templatePath,
          originalFileName: data.originalFileName,
          variables: data.variables,
          isDefault: data.isDefault || false
        }
      });

      return {
        ...template,
        variables: Array.isArray(template.variables) ? template.variables as any : []
      };
    } catch (error) {
      console.error('Error creating template:', error);
      return null;
    }
  }

  /**
   * Process template data - format dates, convert numbers to words, etc.
   */
  private processTemplateData(data: Record<string, any>): Record<string, any> {
    const processed = { ...data };

    // Format dates
    if (processed.szerzodes_datuma) {
      processed.szerzodes_datuma = this.formatDate(processed.szerzodes_datuma);
    }
    if (processed.elado_szul_ido) {
      processed.elado_szul_ido = this.formatDate(processed.elado_szul_ido);
    }
    if (processed.vevo_szul_ido) {
      processed.vevo_szul_ido = this.formatDate(processed.vevo_szul_ido);
    }
    if (processed.birtokbaadas_datuma) {
      processed.birtokbaadas_datuma = this.formatDate(processed.birtokbaadas_datuma);
    }

    // Convert price to words
    if (processed.vetelar) {
      processed.vetelar_betukkel = HungarianNumberToWords.toForint(processed.vetelar);
    }

    // Build full address
    if (processed.ingatlan_iranyitoszam && processed.ingatlan_telepules) {
      processed.ingatlan_teljes_cim_text = 
        `${processed.ingatlan_iranyitoszam} ${processed.ingatlan_telepules}, ${processed.ingatlan_utca || ''} ${processed.ingatlan_hazszam || ''}`.trim();
    }

    return processed;
  }

  /**
   * Format date to Hungarian locale format
   */
  private formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('hu-HU');
  }

  /**
   * Generate contract document
   */
  async generateContract(input: GenerateContractInput): Promise<ContractGenerationResult> {
    this.initDirectories();

    try {
      // Get template from database
      const template = await this.getTemplateById(input.templateId);
      if (!template) {
        return { success: false, error: 'Template not found' };
      }

      // Check if template file exists
      if (!fs.existsSync(template.templatePath)) {
        return { success: false, error: 'Template file not found: ' + template.templatePath };
      }

      // Process template data
      const processedData = this.processTemplateData(input.data);

      // Load and render template
      const content = fs.readFileSync(template.templatePath, 'binary');
      const PizZip = (await import('pizzip')).default;
      const Docxtemplater = (await import('docxtemplater')).default;
      
      const zip = new PizZip(content);
      const doc = new Docxtemplater(zip);
      doc.setData(processedData);
      doc.render();

      // Generate output file
      const timestamp = Date.now();
      const documentType = template.category.toLowerCase();
      const fileName = `${documentType}_${timestamp}.docx`;
      const outputPath = path.join(GENERATED_DIR, fileName);
      const buffer = doc.getZip().generate({ type: 'nodebuffer' });
      fs.writeFileSync(outputPath, buffer);

      // Save to database
      const generation = await prisma.contractGeneration.create({
        data: {
          title: input.title || `${template.name} - ${timestamp}`,
          templateId: input.templateId,
          caseId: input.caseId || null,
          templateData: processedData,
          fileName: fileName,
          filePath: outputPath,
          fileSize: buffer.length,
          status: 'GENERATED'
        }
      });

      // Upload to SharePoint if caseId provided
      let spResult = null;
      if (input.caseId) {
        spResult = await driveService.uploadDocument({
          caseId: input.caseId,
          fileName: fileName,
          content: buffer,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          folder: 'Contracts'
        });

        if (spResult.success) {
          await prisma.contractGeneration.update({
            where: { id: generation.id },
            data: { status: 'UPLOADED' }
          });
        }
      }

      // Create timeline event if caseId provided
      if (input.caseId && input.userId) {
        await prisma.timelineEvent.create({
          data: {
            caseId: input.caseId,
            userId: input.userId,
            type: 'DOCUMENT_GENERATED' as any,
            payload: {
              generationId: generation.id,
              templateName: template.name,
              documentTitle: generation.title,
              spItemId: spResult?.item?.id || null,
              spWebUrl: spResult?.webUrl || null
            }
          }
        });
      }

      return {
        success: true,
        document: {
          id: generation.id,
          title: generation.title,
          fileName: generation.fileName,
          filePath: generation.filePath,
          fileSize: generation.fileSize || 0,
          templateId: input.templateId,
          caseId: input.caseId,
          generatedAt: generation.generatedAt
        }
      };
    } catch (error) {
      console.error('Contract generation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during generation'
      };
    }
  }

  /**
   * Generate preview (temporary file, auto-deleted)
   */
  async generatePreview(input: GeneratePreviewInput): Promise<ContractGenerationResult> {
    this.initDirectories();

    try {
      const template = await this.getTemplateById(input.templateId);
      if (!template) {
        return { success: false, error: 'Template not found' };
      }

      if (!fs.existsSync(template.templatePath)) {
        return { success: false, error: 'Template file not found' };
      }

      const processedData = this.processTemplateData(input.data);

      const content = fs.readFileSync(template.templatePath, 'binary');
      const PizZip = (await import('pizzip')).default;
      const Docxtemplater = (await import('docxtemplater')).default;
      
      const zip = new PizZip(content);
      const doc = new Docxtemplater(zip);
      doc.setData(processedData);
      doc.render();

      const timestamp = Date.now();
      const fileName = `preview_${timestamp}.docx`;
      const outputPath = path.join(GENERATED_DIR, fileName);
      const buffer = doc.getZip().generate({ type: 'nodebuffer' });
      fs.writeFileSync(outputPath, buffer);

      // Set expiration (24 hours from now)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      await prisma.contractGeneration.create({
        data: {
          title: 'Preview',
          templateId: input.templateId,
          templateData: processedData,
          fileName: fileName,
          filePath: outputPath,
          fileSize: buffer.length,
          status: 'PREVIEW',
          expiresAt: expiresAt
        }
      });

      return {
        success: true,
        preview: {
          base64Content: buffer.toString('base64'),
          fileName: fileName
        }
      };
    } catch (error) {
      console.error('Preview generation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get generated contracts for a case
   */
  async getCaseContracts(caseId: string) {
    const contracts = await prisma.contractGeneration.findMany({
      where: { caseId },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            category: true
          }
        }
      },
      orderBy: { generatedAt: 'desc' }
    });

    return contracts.map(c => ({
      id: c.id,
      title: c.title,
      templateName: c.template.name,
      category: c.template.category,
      status: c.status,
      fileName: c.fileName,
      fileSize: c.fileSize,
      generatedAt: c.generatedAt
    }));
  }

  /**
   * Delete expired previews (cleanup job)
   */
  async cleanupExpiredPreviews(): Promise<number> {
    const expired = await prisma.contractGeneration.findMany({
      where: {
        status: 'PREVIEW',
        expiresAt: {
          lt: new Date()
        }
      }
    });

    for (const item of expired) {
      // Delete file
      if (fs.existsSync(item.filePath)) {
        fs.unlinkSync(item.filePath);
      }
      // Delete record
      await prisma.contractGeneration.delete({
        where: { id: item.id }
      });
    }

    return expired.length;
  }

  /**
   * Save uploaded template file
   */
  async saveTemplateFile(file: {
    name: string;
    data: Buffer;
  }): Promise<string> {
    this.initDirectories();

    const timestamp = Date.now();
    const fileName = `${timestamp}_${file.name}`;
    const filePath = path.join(TEMPLATES_DIR, fileName);

    fs.writeFileSync(filePath, file.data);

    return filePath;
  }

  /**
   * Upload generated contract to SharePoint
   */
  async uploadToSharePoint(generationId: string): Promise<{
    success: boolean;
    spItemId?: string;
    spWebUrl?: string;
    error?: string;
  }> {
    try {
      // Get the generated contract
      const generation = await prisma.contractGeneration.findUnique({
        where: { id: generationId },
        include: { template: true }
      });

      if (!generation) {
        return { success: false, error: 'Generation not found' };
      }

      if (!generation.caseId) {
        return { success: false, error: 'No case ID associated with this generation' };
      }

      // Read file content
      if (!fs.existsSync(generation.filePath)) {
        return { success: false, error: 'File not found' };
      }

      const fileContent = fs.readFileSync(generation.filePath);

      // Upload to SharePoint
      const result = await driveService.uploadDocument({
        caseId: generation.caseId,
        fileName: generation.fileName,
        content: fileContent,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        folder: 'Contracts'
      });

      if (result.success) {
        // Update generation status
        await prisma.contractGeneration.update({
          where: { id: generationId },
          data: { status: 'UPLOADED' }
        });

        return {
          success: true,
          spItemId: result.item?.id,
          spWebUrl: result.webUrl
        };
      } else {
        return { success: false, error: result.error || 'Upload failed' };
      }
    } catch (error) {
      console.error('SharePoint upload error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get SharePoint upload status for a generation
   */
  async getSharePointStatus(generationId: string): Promise<{
    uploaded: boolean;
    spItemId?: string;
    spWebUrl?: string;
    status: string;
  } | null> {
    const generation = await prisma.contractGeneration.findUnique({
      where: { id: generationId }
    });

    if (!generation) return null;

    return {
      uploaded: generation.status === 'UPLOADED',
      spItemId: undefined, // Would need to add field to schema
      spWebUrl: undefined,
      status: generation.status
    };
  }
}

export default new ContractsService();
