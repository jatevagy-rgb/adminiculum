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
  private readonly EDIT_DRAFT_TEMPLATE_PREFIX = 'EDIT_MODE:';

  private readonly ADASVETEL_BUNDLE_DEFINITIONS = [
    {
      id: 'RECEIPT_ACKNOWLEDGEMENT',
      label: 'Átvételi elismervény',
      documentType: 'RECEIPT_ACKNOWLEDGEMENT',
      generatorType: 'DOCX_TEMPLATE',
    },
    {
      id: 'HANDOVER_MINUTES',
      label: 'Birtokbaadási / átadás-átvételi jegyzőkönyv',
      documentType: 'HANDOVER_MINUTES',
      generatorType: 'DOCX_TEMPLATE',
    },
    {
      id: 'REGISTRATION_SUPPORT_DOC',
      label: 'Bejegyzési támogatói dokumentum (hook)',
      documentType: 'REGISTRATION_SUPPORT_DOC',
      generatorType: 'TEXT_PLACEHOLDER',
    },
    {
      id: 'B400_PREP',
      label: 'B400 előkészítő export (nem filing)',
      documentType: 'B400_PREP',
      generatorType: 'PREP_EXPORT',
    },
  ] as const;

  private isBundleItemEligible(itemId: string, intakeData: Record<string, any>): { eligible: boolean; reason: string } {
    switch (itemId) {
      case 'RECEIPT_ACKNOWLEDGEMENT': {
        const financingType = String(intakeData.financingType || '').toUpperCase();
        const bankPackRequired = Boolean(intakeData.bankPackRequired);
        const vetelar = intakeData.vetelar;
        const hasPriceSignal = typeof vetelar === 'number' ? vetelar > 0 : Boolean(vetelar);
        const eligible = financingType !== 'CASH' || bankPackRequired || hasPriceSignal;
        return {
          eligible,
          reason: eligible
            ? 'Financing/payment confirmation context detected.'
            : 'No financing or payment confirmation signal in intake data.',
        };
      }
      case 'HANDOVER_MINUTES':
        return { eligible: true, reason: 'Generally relevant for sale workflow handover.' };
      case 'REGISTRATION_SUPPORT_DOC': {
        const flagged = Boolean(intakeData.bankPackRequired)
          || Boolean(intakeData.hasPreemptiveRights)
          || Boolean(intakeData.condominiumProperty)
          || Boolean(intakeData.foreignParty);
        return {
          eligible: flagged,
          reason: flagged
            ? 'Registration-related pathway signal detected in intake.'
            : 'No registration-support signal detected in intake.',
        };
      }
      case 'B400_PREP': {
        const hasTaxData = Boolean(intakeData.vetelar)
          || Boolean(intakeData.ingatlan_helyrajzi_szam)
          || Boolean(intakeData.elado_nev)
          || Boolean(intakeData.vevo_nev);
        return {
          eligible: hasTaxData,
          reason: hasTaxData
            ? 'Minimum purchase/tax preparation data detected.'
            : 'Insufficient data for B400 preparation export.',
        };
      }
      default:
        return { eligible: false, reason: 'Unknown bundle item.' };
    }
  }

  async getBundleOptions(params: {
    contractType?: TemplateCategory | string;
    intakeData?: Record<string, any>;
  }): Promise<Array<{
    id: string;
    label: string;
    documentType: string;
    generatorType: string;
    eligible: boolean;
    reason: string;
  }>> {
    const contractType = String(params.contractType || 'ADASVETEL').toUpperCase();
    const intakeData = (params.intakeData || {}) as Record<string, any>;

    if (contractType !== 'ADASVETEL') {
      return [];
    }

    return this.ADASVETEL_BUNDLE_DEFINITIONS.map((definition) => {
      const eligibility = this.isBundleItemEligible(definition.id, intakeData);
      return {
        ...definition,
        eligible: eligibility.eligible,
        reason: eligibility.reason,
      };
    });
  }

  private async resolveCaseId(caseRef?: string): Promise<string | undefined> {
    if (!caseRef) return undefined;

    const byId = await prisma.case.findUnique({
      where: { id: caseRef },
      select: { id: true },
    });
    if (byId?.id) return byId.id;

    const byCaseNumber = await prisma.case.findUnique({
      where: { caseNumber: caseRef },
      select: { id: true },
    });
    if (byCaseNumber?.id) return byCaseNumber.id;

    return undefined;
  }

  private async resolveTimelineUserId(userId?: string, userEmail?: string): Promise<string | undefined> {
    if (userId) {
      const byId = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });

      if (byId?.id) {
        return byId.id;
      }
    }

    const normalizedEmail = userEmail?.trim().toLowerCase();
    if (normalizedEmail) {
      const byEmail = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      });

      if (byEmail?.id) {
        return byEmail.id;
      }
    }

    return undefined;
  }

  private serializeTemplateError(error: unknown): Record<string, unknown> {
    const source = error as {
      name?: string;
      message?: string;
      stack?: string;
      properties?: {
        id?: string;
        explanation?: string;
        errors?: Array<{
          name?: string;
          message?: string;
          stack?: string;
          properties?: Record<string, unknown>;
          rootError?: { message?: string };
        }>;
      };
    };

    return {
      name: source?.name,
      message: source?.message,
      stack: source?.stack,
      properties: {
        id: source?.properties?.id,
        explanation: source?.properties?.explanation,
        errors: (source?.properties?.errors || []).map((item) => ({
          name: item?.name,
          message: item?.message,
          stack: item?.stack,
          rootError: item?.rootError?.message ? { message: item.rootError.message } : undefined,
          properties: item?.properties,
        })),
      },
    };
  }

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

      const resolvedCaseId = await this.resolveCaseId(input.caseId);

      // Process template data
      const processedData = this.processTemplateData(input.data);
      const comparableText = this.getComparableContractText(processedData);
      const snapshotBlocks = comparableText ? this.deriveBlocksFromAssembledText(comparableText) : [];
      const comparisonSnapshot = template.category === 'ADASVETEL' && snapshotBlocks.length > 0
        ? this.buildComparisonSnapshot({
            blocks: snapshotBlocks,
            sourceMode: 'generation_payload',
            assembledText: comparableText,
          })
        : undefined;

      // Load and render template
      const content = fs.readFileSync(template.templatePath, 'binary');
      const PizZip = (await import('pizzip')).default;
      const Docxtemplater = (await import('docxtemplater')).default;
      
      const zip = new PizZip(content);
      const doc = new Docxtemplater(zip, {
        delimiters: {
          start: '{{',
          end: '}}',
        },
      });
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
          caseId: resolvedCaseId || null,
          templateData: processedData,
          ...(comparisonSnapshot ? { comparisonSnapshot: comparisonSnapshot as any } : {}),
          fileName: fileName,
          filePath: outputPath,
          fileSize: buffer.length,
          status: 'GENERATED'
        }
      });

      // Upload to SharePoint if caseId provided
      // NOTE: SharePoint folders are created as "{caseNumber} - {caseName}", NOT by CUID.
      // Must resolve caseNumber here or uploads will go to non-existent folders.
      let spResult = null;
      if (input.caseId) {
        const spCaseData = await prisma.case.findUnique({
          where: { id: input.caseId },
          select: { caseNumber: true },
        });
        const sharePointCaseRef = spCaseData?.caseNumber || input.caseId;
        spResult = await driveService.uploadDocument({
          caseId: sharePointCaseRef,
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
      const timelineUserId = await this.resolveTimelineUserId(input.userId, input.userEmail);

      if (resolvedCaseId && timelineUserId) {
        await prisma.timelineEvent.create({
          data: {
            caseId: resolvedCaseId,
            userId: timelineUserId,
            eventType: 'CONTRACT_GENERATED',
            type: 'CONTRACT_GENERATED',
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
          caseId: resolvedCaseId,
          generatedAt: generation.generatedAt
        }
      };
    } catch (error) {
      console.error('Contract generation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during generation',
        rawError: this.serializeTemplateError(error) as any,
      };
    }
  }

  private buildBundleDocumentContent(params: {
    bundleItemId: string;
    intakeData: Record<string, any>;
    caseRef: string;
    mainTitle: string;
  }): string {
    const { bundleItemId, intakeData, caseRef, mainTitle } = params;
    const now = new Date().toLocaleString('hu-HU');

    if (bundleItemId === 'RECEIPT_ACKNOWLEDGEMENT') {
      return [
        'ÁTVÉTELI ELISMERVÉNY (első passz)',
        '',
        `Kapcsolódó ügy: ${caseRef}`,
        `Kapcsolódó fődokumentum: ${mainTitle}`,
        `Generálás ideje: ${now}`,
        '',
        `Finanszírozás típusa: ${intakeData.financingType || 'n/a'}`,
        `Vételár: ${intakeData.vetelar || 'n/a'}`,
        '',
        'MEGJEGYZÉS: első passzos segéddokumentum, manuális jogi ellenőrzés szükséges.',
      ].join('\n');
    }

    if (bundleItemId === 'HANDOVER_MINUTES') {
      return [
        'BIRTOKBAADÁSI / ÁTADÁS-ÁTVÉTELI JEGYZŐKÖNYV (első passz)',
        '',
        `Kapcsolódó ügy: ${caseRef}`,
        `Kapcsolódó fődokumentum: ${mainTitle}`,
        `Generálás ideje: ${now}`,
        '',
        `Birtokbaadás dátuma (intake): ${intakeData.birtokbaadas_datuma || 'n/a'}`,
        `Ingatlan cím: ${intakeData.ingatlan_teljes_cim_text || 'n/a'}`,
        '',
        'MEGJEGYZÉS: első passzos segéddokumentum, manuális jogi ellenőrzés szükséges.',
      ].join('\n');
    }

    if (bundleItemId === 'REGISTRATION_SUPPORT_DOC') {
      return [
        'BEJEGYZÉSI TÁMOGATÓ DOKUMENTUM HOOK (első passz)',
        '',
        `Kapcsolódó ügy: ${caseRef}`,
        `Kapcsolódó fődokumentum: ${mainTitle}`,
        `Generálás ideje: ${now}`,
        '',
        `Banki csomag: ${intakeData.bankPackRequired ? 'igen' : 'nem'}`,
        `Elővásárlási jog: ${intakeData.hasPreemptiveRights ? 'igen' : 'nem'}`,
        `Társasházi ingatlan: ${intakeData.condominiumProperty ? 'igen' : 'nem'}`,
        '',
        'MEGJEGYZÉS: jelenleg regisztrációs támogatói hook/export, nem teljes bejegyzési irat.',
      ].join('\n');
    }

    return [
      'B400 ELŐKÉSZÍTŐ EXPORT (nem filing)',
      '',
      `Kapcsolódó ügy: ${caseRef}`,
      `Kapcsolódó fődokumentum: ${mainTitle}`,
      `Generálás ideje: ${now}`,
      '',
      JSON.stringify(
        {
          elado_nev: intakeData.elado_nev || null,
          vevo_nev: intakeData.vevo_nev || null,
          vetelar: intakeData.vetelar || null,
          ingatlan_helyrajzi_szam: intakeData.ingatlan_helyrajzi_szam || null,
        },
        null,
        2,
      ),
      '',
      'MEGJEGYZÉS: ez csak előkészítő export, hatósági B400 benyújtás nem történik.',
    ].join('\n');
  }

  private pickFirstNonEmpty(...values: Array<unknown>): string {
    for (const value of values) {
      const normalized = value === null || value === undefined ? '' : String(value).trim();
      if (normalized.length > 0) return normalized;
    }
    return '';
  }

  private toHuDate(value: unknown): string {
    const source = value === null || value === undefined ? '' : String(value).trim();
    if (!source) return '';
    const parsed = new Date(source);
    if (Number.isNaN(parsed.getTime())) {
      return source;
    }
    return parsed.toLocaleDateString('hu-HU');
  }

  private toHuDateTimeNow(): string {
    return new Date().toLocaleString('hu-HU');
  }

  private buildBundleDocxData(params: {
    bundleItemId: 'RECEIPT_ACKNOWLEDGEMENT' | 'HANDOVER_MINUTES';
    intakeData: Record<string, any>;
    mainTitle: string;
    caseRef: string;
  }): Record<string, any> {
    const { bundleItemId, intakeData, mainTitle, caseRef } = params;

    const sellerName = this.pickFirstNonEmpty(intakeData.elado_nev, intakeData.sellerName);
    const buyer1Name = this.pickFirstNonEmpty(intakeData.vevo1_nev, intakeData.vevo_nev, intakeData.buyerName);
    const buyer2Name = this.pickFirstNonEmpty(intakeData.vevo2_nev, intakeData.coBuyerName);
    const contractDate = this.pickFirstNonEmpty(
      this.toHuDate(intakeData.adasveteli_szerzodes_datuma),
      this.toHuDate(intakeData.szerzodes_datuma),
      this.toHuDate(intakeData.contractDate),
    );
    const contractPlace = this.pickFirstNonEmpty(intakeData.szerzodes_helye, intakeData.contractPlace);
    const propertyPostalCode = this.pickFirstNonEmpty(intakeData.ingatlan_iranyitoszam, intakeData.propertyPostalCode);
    const propertyCity = this.pickFirstNonEmpty(intakeData.ingatlan_telepules, intakeData.propertyCity);
    const propertyStreet = this.pickFirstNonEmpty(intakeData.ingatlan_utca, intakeData.propertyStreet);
    const propertyHouseNumber = this.pickFirstNonEmpty(intakeData.ingatlan_hazszam, intakeData.propertyHouseNumber);
    const propertyFloorDoor = this.pickFirstNonEmpty(intakeData.ingatlan_emelet_ajto, intakeData.propertyFloorDoor);
    const propertyLotNumber = this.pickFirstNonEmpty(intakeData.ingatlan_helyrajzi_szam, intakeData.propertyLotNumber);
    const propertyArea = this.pickFirstNonEmpty(intakeData.ingatlan_alapterulet, intakeData.propertyArea);
    const propertyType = this.pickFirstNonEmpty(intakeData.ingatlan_tipus_neve, intakeData.propertyType);
    const priceRaw = this.pickFirstNonEmpty(intakeData.vetelar, intakeData.purchasePrice);
    const priceNumber = priceRaw ? String(priceRaw) : '';
    const priceWords = priceRaw
      ? HungarianNumberToWords.toForint(Number(priceRaw))
      : '';

    const common = {
      adasveteli_szerzodes_datuma: contractDate,
      szerzodes_datuma: contractDate,
      szerzodes_helye: contractPlace,
      ellenjegyzes_datuma: contractDate,
      ellenjegyzes_helye: contractPlace,

      elado_nev: sellerName,
      elado_szul_nev: this.pickFirstNonEmpty(intakeData.elado_szul_nev),
      elado_szul_hely: this.pickFirstNonEmpty(intakeData.elado_szul_hely),
      elado_szul_ido: this.toHuDate(intakeData.elado_szul_ido),
      elado_anya_neve: this.pickFirstNonEmpty(intakeData.elado_anya_neve),
      elado_lakcim: this.pickFirstNonEmpty(intakeData.elado_lakcim, intakeData.elado_lakhely),
      elado_allampolgarsag: this.pickFirstNonEmpty(intakeData.elado_allampolgarsag),
      elado_szemelyi_ig: this.pickFirstNonEmpty(intakeData.elado_szemelyi_ig),
      elado_szemelyi_szam: this.pickFirstNonEmpty(intakeData.elado_szemelyi_szam),
      elado_adoazonosito_jel: this.pickFirstNonEmpty(intakeData.elado_adoazonosito_jel),

      vevo1_nev: buyer1Name,
      vevo1_szul_nev: this.pickFirstNonEmpty(intakeData.vevo1_szul_nev),
      vevo1_szul_hely: this.pickFirstNonEmpty(intakeData.vevo1_szul_hely),
      vevo1_szul_ido: this.toHuDate(intakeData.vevo1_szul_ido),
      vevo1_anya_neve: this.pickFirstNonEmpty(intakeData.vevo1_anya_neve),
      vevo1_lakcim: this.pickFirstNonEmpty(intakeData.vevo1_lakcim, intakeData.vevo_lakhely),
      vevo1_allampolgarsag: this.pickFirstNonEmpty(intakeData.vevo1_allampolgarsag),
      vevo1_szemelyi_ig: this.pickFirstNonEmpty(intakeData.vevo1_szemelyi_ig),
      vevo1_szemelyi_szam: this.pickFirstNonEmpty(intakeData.vevo1_szemelyi_szam),
      vevo1_adoazonosito_jel: this.pickFirstNonEmpty(intakeData.vevo1_adoazonosito_jel),
      vevo1_tulajdoni_hanyad: this.pickFirstNonEmpty(intakeData.vevo1_tulajdoni_hanyad, '1/1'),

      vevo2_nev: buyer2Name,
      vevo2_szul_nev: this.pickFirstNonEmpty(intakeData.vevo2_szul_nev),
      vevo2_szul_hely: this.pickFirstNonEmpty(intakeData.vevo2_szul_hely),
      vevo2_szul_ido: this.toHuDate(intakeData.vevo2_szul_ido),
      vevo2_anya_neve: this.pickFirstNonEmpty(intakeData.vevo2_anya_neve),
      vevo2_lakcim: this.pickFirstNonEmpty(intakeData.vevo2_lakcim),
      vevo2_allampolgarsag: this.pickFirstNonEmpty(intakeData.vevo2_allampolgarsag),
      vevo2_szemelyi_ig: this.pickFirstNonEmpty(intakeData.vevo2_szemelyi_ig),
      vevo2_szemelyi_szam: this.pickFirstNonEmpty(intakeData.vevo2_szemelyi_szam),
      vevo2_adoazonosito_jel: this.pickFirstNonEmpty(intakeData.vevo2_adoazonosito_jel),
      vevo2_tulajdoni_hanyad: this.pickFirstNonEmpty(intakeData.vevo2_tulajdoni_hanyad),

      ingatlan_iranyitoszam: propertyPostalCode,
      ingatlan_telepules: propertyCity,
      ingatlan_utca: propertyStreet,
      ingatlan_hazszam: propertyHouseNumber,
      ingatlan_emelet_ajto: propertyFloorDoor,
      ingatlan_helyrajzi_szam: propertyLotNumber,
      ingatlan_alapterulet: propertyArea,
      ingatlan_tipus_neve: propertyType,
      ingatlan_fekves: this.pickFirstNonEmpty(intakeData.ingatlan_fekves),

      kormanyhivatal: this.pickFirstNonEmpty(intakeData.kormanyhivatal, `${propertyCity} Kormányhivatal`),
      ugyved_nev: this.pickFirstNonEmpty(intakeData.ugyved_nev, intakeData.lawyerName),
      ugyved_kasz: this.pickFirstNonEmpty(intakeData.ugyved_kasz, intakeData.lawyerKasz),
      ugyvedi_iroda_neve: this.pickFirstNonEmpty(intakeData.ugyvedi_iroda_neve, intakeData.lawFirmName),
      ugyvedi_iroda_szekhelye: this.pickFirstNonEmpty(intakeData.ugyvedi_iroda_szekhelye, intakeData.lawFirmAddress),

      _bundle_main_title: mainTitle,
      _bundle_case_ref: caseRef,
      _bundle_generated_at: this.toHuDateTimeNow(),
    };

    if (bundleItemId === 'RECEIPT_ACKNOWLEDGEMENT') {
      return {
        ...common,
        onero_hivatkozas_pontja: this.pickFirstNonEmpty(intakeData.onero_hivatkozas_pontja, 'V.2.'),
        onero_osszeg_szam: this.pickFirstNonEmpty(intakeData.onero_osszeg_szam, priceNumber),
        onero_osszeg_betu: this.pickFirstNonEmpty(intakeData.onero_osszeg_betu, priceWords),
      };
    }

    return {
      ...common,
      birtokbaadas_datuma: this.pickFirstNonEmpty(
        this.toHuDate(intakeData.birtokbaadas_datuma),
        this.toHuDate(intakeData.handoverDate),
      ),
      leteti_hivatkozas_pontja: this.pickFirstNonEmpty(intakeData.leteti_hivatkozas_pontja, 'V.6.'),
      meroora_aram: this.pickFirstNonEmpty(intakeData.meroora_aram, intakeData.meterElectric),
      meroora_viz: this.pickFirstNonEmpty(intakeData.meroora_viz, intakeData.meterWater),
      kulcsok_szama: this.pickFirstNonEmpty(intakeData.kulcsok_szama, intakeData.keyCount),
      atadas_megjegyzes: this.pickFirstNonEmpty(intakeData.atadas_megjegyzes, intakeData.handoverNote),
      bejegyzesi_engedely_benyujtasi_hatarido_nap: this.pickFirstNonEmpty(
        intakeData.bejegyzesi_engedely_benyujtasi_hatarido_nap,
        '15',
      ),
      bejegyzesi_engedely_peldanyszam: this.pickFirstNonEmpty(
        intakeData.bejegyzesi_engedely_peldanyszam,
        '4',
      ),
    };
  }

  private getBundleDocxTemplatePath(bundleItemId: 'RECEIPT_ACKNOWLEDGEMENT' | 'HANDOVER_MINUTES'): string {
    const templateFileName = bundleItemId === 'RECEIPT_ACKNOWLEDGEMENT'
      ? 'Atveteli_elismerveny_backend_ready_template.docx'
      : 'Birtokbaadasi_jegyzokonyv_backend_ready_template.docx';
    return path.join(TEMPLATES_DIR, templateFileName);
  }

  private async generateBundleDocx(params: {
    bundleItemId: 'RECEIPT_ACKNOWLEDGEMENT' | 'HANDOVER_MINUTES';
    intakeData: Record<string, any>;
    mainTitle: string;
    caseRef: string;
  }): Promise<{ fileName: string; outputPath: string; fileSize: number; payload: Record<string, any> }> {
    const { bundleItemId, intakeData, mainTitle, caseRef } = params;
    const templatePath = this.getBundleDocxTemplatePath(bundleItemId);

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Bundle DOCX template not found: ${templatePath}`);
    }

    const payload = this.buildBundleDocxData({
      bundleItemId,
      intakeData,
      mainTitle,
      caseRef,
    });

    const content = fs.readFileSync(templatePath, 'binary');
    const PizZip = (await import('pizzip')).default;
    const Docxtemplater = (await import('docxtemplater')).default;
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      delimiters: {
        start: '{{',
        end: '}}',
      },
      paragraphLoop: true,
      linebreaks: true,
    });

    doc.setData(payload);
    doc.render();

    const timestamp = Date.now();
    const fileName = `${bundleItemId.toLowerCase()}_${timestamp}.docx`;
    const outputPath = path.join(GENERATED_DIR, fileName);
    const buffer = doc.getZip().generate({ type: 'nodebuffer' });
    fs.writeFileSync(outputPath, buffer);

    return {
      fileName,
      outputPath,
      fileSize: buffer.length,
      payload,
    };
  }

  async generateWithBundle(input: GenerateContractInput & {
    selectedBundleItemIds?: string[];
  }): Promise<ContractGenerationResult & {
    bundleDocuments?: Array<{
      id: string;
      bundleItemId: string;
      title: string;
      fileName: string;
      generatedAt: Date;
    }>;
    skippedBundleItems?: Array<{ id: string; reason: string }>;
  }> {
    const mainResult = await this.generateContract(input);
    if (!mainResult.success || !mainResult.document) {
      return mainResult;
    }

    const selectedBundleItemIds = Array.isArray(input.selectedBundleItemIds)
      ? input.selectedBundleItemIds
      : [];

    if (selectedBundleItemIds.length === 0) {
      return mainResult;
    }

    const intakeData = (input.data || {}) as Record<string, any>;
    const availableDefinitions = this.ADASVETEL_BUNDLE_DEFINITIONS;
    const resolvedCaseId = await this.resolveCaseId(input.caseId);
    const caseRef = resolvedCaseId || input.caseId || 'unknown-case';
    const timelineUserId = await this.resolveTimelineUserId(input.userId, input.userEmail);
    const createdBundleDocuments: Array<{
      id: string;
      bundleItemId: string;
      title: string;
      fileName: string;
      generatedAt: Date;
    }> = [];
    const skippedBundleItems: Array<{ id: string; reason: string }> = [];

    for (const itemId of selectedBundleItemIds) {
      const definition = availableDefinitions.find((entry) => entry.id === itemId);
      if (!definition) {
        skippedBundleItems.push({ id: itemId, reason: 'Unsupported bundle item.' });
        continue;
      }

      const eligibility = this.isBundleItemEligible(itemId, intakeData);
      if (!eligibility.eligible) {
        skippedBundleItems.push({ id: itemId, reason: eligibility.reason });
        continue;
      }

      let fileName = '';
      let outputPath = '';
      let fileSize = 0;
      let persistedTemplateData: Record<string, any> = {
        ...intakeData,
      };

      if (definition.id === 'RECEIPT_ACKNOWLEDGEMENT' || definition.id === 'HANDOVER_MINUTES') {
        const docxResult = await this.generateBundleDocx({
          bundleItemId: definition.id,
          intakeData,
          caseRef,
          mainTitle: mainResult.document.title,
        });

        fileName = docxResult.fileName;
        outputPath = docxResult.outputPath;
        fileSize = docxResult.fileSize;
        persistedTemplateData = {
          ...persistedTemplateData,
          ...docxResult.payload,
        };
      } else {
        const timestamp = Date.now();
        fileName = `${definition.id.toLowerCase()}_${timestamp}.txt`;
        outputPath = path.join(GENERATED_DIR, fileName);
        const content = this.buildBundleDocumentContent({
          bundleItemId: definition.id,
          intakeData,
          caseRef,
          mainTitle: mainResult.document.title,
        });
        fs.writeFileSync(outputPath, Buffer.from(content, 'utf-8'));
        const stats = fs.statSync(outputPath);
        fileSize = stats.size;
      }

      const created = await prisma.contractGeneration.create({
        data: {
          title: `${definition.label} — ${new Date().toLocaleDateString('hu-HU')}`,
          templateId: input.templateId,
          caseId: resolvedCaseId || null,
          templateData: {
            ...persistedTemplateData,
            _bundleMeta: {
              bundleItemId: definition.id,
              documentType: definition.documentType,
              generatorType: definition.generatorType,
              note: definition.id === 'RECEIPT_ACKNOWLEDGEMENT' || definition.id === 'HANDOVER_MINUTES'
                ? 'Patch 2D dedicated DOCX output'
                : 'Patch 2B foundation output',
            },
          },
          fileName,
          filePath: outputPath,
          fileSize,
          status: 'GENERATED',
        },
      });

      if (resolvedCaseId && timelineUserId) {
        await prisma.timelineEvent.create({
          data: {
            caseId: resolvedCaseId,
            userId: timelineUserId,
            eventType: 'CONTRACT_GENERATED',
            type: 'CONTRACT_BUNDLE_ITEM_GENERATED',
            payload: {
              mainGenerationId: mainResult.document.id,
              generationId: created.id,
              bundleItemId: definition.id,
              documentType: definition.documentType,
              generatorType: definition.generatorType,
            },
          },
        });
      }

      createdBundleDocuments.push({
        id: created.id,
        bundleItemId: definition.id,
        title: created.title,
        fileName: created.fileName,
        generatedAt: created.generatedAt,
      });
    }

    return {
      ...mainResult,
      bundleDocuments: createdBundleDocuments,
      skippedBundleItems,
    };
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
      const doc = new Docxtemplater(zip, {
        delimiters: {
          start: '{{',
          end: '}}',
        },
      });
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
        error: error instanceof Error ? error.message : 'Unknown error',
        rawError: this.serializeTemplateError(error) as any,
      };
    }
  }

  /**
   * Get generated contracts for a case
   */
  async getCaseContracts(caseId: string) {
    const resolvedCaseId = await this.resolveCaseId(caseId);

    const whereClause = resolvedCaseId && resolvedCaseId !== caseId
      ? { OR: [{ caseId: resolvedCaseId }, { caseId }] }
      : { caseId: resolvedCaseId || caseId };

    const contracts = await prisma.contractGeneration.findMany({
      where: whereClause,
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
      generatedAt: c.generatedAt,
      spItemId: c.spItemId,
      spWebUrl: c.spWebUrl,
      parentRevisionId: c.parentRevisionId || null,
      isFinalRevision: c.isFinalRevision || false,
      revisionNumber: c.revisionNumber || 1,
      isCurrentRevision: c.isCurrentRevision !== false
    }));
  }

  private assertAdasvetelEditEligible(generation: {
    id: string;
    caseId: string | null;
    template: { category: string };
  }): { caseId: string } {
    if (!generation.caseId) {
      throw new Error('Edit mode requires case-linked contract generation');
    }

    if (generation.template.category !== 'ADASVETEL') {
      throw new Error('Edit mode is currently supported only for ADASVETEL contracts');
    }

    return { caseId: generation.caseId };
  }

  private normalizeEditBlocks(blocks: Array<any>): Array<{
    id: string;
    title: string;
    body: string;
    orderIndex: number;
    sourceClauseId?: string | null;
  }> {
    return blocks
      .map((block: any, index: number) => {
        const title = String(block?.title || `Záradék ${index + 1}`).trim();
        const body = String(block?.body || '').trim();
        const id = String(block?.id || `block-${index + 1}`).trim();
        const sourceClauseId = block?.sourceClauseId ? String(block.sourceClauseId) : null;
        const orderIndex = Number.isFinite(Number(block?.orderIndex))
          ? Number(block.orderIndex)
          : index;

        return {
          id,
          title,
          body,
          orderIndex,
          sourceClauseId,
        };
      })
      .filter((block) => block.body.length > 0 || block.title.length > 0)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((block, index) => ({ ...block, orderIndex: index }));
  }

  private deriveBlocksFromAssembledText(assembledText: string): Array<{
    id: string;
    title: string;
    body: string;
    orderIndex: number;
    sourceClauseId?: string | null;
  }> {
    const normalized = assembledText
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (!normalized) return [];

    const chunks = normalized
      .split(/\n\s*\n/)
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.length > 0)
      .slice(0, 80);

    return chunks.map((chunk, index) => {
      const lines = chunk.split('\n').map((line) => line.trim()).filter(Boolean);
      const firstLine = lines[0] || '';
      const numberedTitle = firstLine.match(/^\d+[\.)]\s+(.+)$/);
      const title = numberedTitle?.[1]?.trim() || `Záradék ${index + 1}`;
      const body = numberedTitle
        ? lines.slice(1).join('\n').trim()
        : lines.join('\n').trim();

      return {
        id: `parsed-${index + 1}`,
        title,
        body: body || chunk,
        orderIndex: index,
        sourceClauseId: null,
      };
    });
  }

  private extractBlocksFromComparisonSnapshot(snapshot: unknown): {
    blocks: Array<{
      id: string;
      title: string;
      body: string;
      orderIndex: number;
      sourceClauseId?: string | null;
    }>;
    sourceMode?: string;
  } | null {
    if (!snapshot || typeof snapshot !== 'object') {
      return null;
    }

    const payload = snapshot as Record<string, any>;
    const blocks = this.normalizeEditBlocks(Array.isArray(payload.blocks) ? payload.blocks : []);

    if (blocks.length === 0) {
      return null;
    }

    return {
      blocks,
      sourceMode: typeof payload.sourceMode === 'string' ? payload.sourceMode : undefined,
    };
  }

  private buildComparisonSnapshot(params: {
    blocks: Array<{
      id: string;
      title: string;
      body: string;
      orderIndex: number;
      sourceClauseId?: string | null;
    }>;
    sourceMode: string;
    sourceDocumentId?: string | null;
    assembledText?: string | null;
    generatedAtIso?: string;
  }): Record<string, any> {
    const normalizedBlocks = this.normalizeEditBlocks(params.blocks);
    const assembledText = String(params.assembledText || '').trim() || normalizedBlocks
      .map((block, index) => `${index + 1}. ${block.title}\n${block.body}`.trim())
      .join('\n\n')
      .trim();

    return {
      sourceMode: params.sourceMode,
      sourceDocumentId: params.sourceDocumentId || null,
      generatedAt: params.generatedAtIso || new Date().toISOString(),
      blockCount: normalizedBlocks.length,
      assembledText,
      blocks: normalizedBlocks,
    };
  }

  private normalizeCompareText(value?: string | null): string {
    return String(value || '')
      .replace(/\r\n/g, '\n')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private tokenizeInlineDiffText(value?: string | null): string[] {
    return String(value || '')
      .replace(/\r\n/g, '\n')
      .split(/(\s+|[.,;:!?()\[\]{}"„”'’\-\/\\])/g)
      .filter((token) => token.length > 0);
  }

  private buildInlineDiffPreview(sourceText: string, targetText: string): {
    granularity: 'word';
    sourceSegments: Array<{ type: 'equal' | 'delete'; text: string }>;
    targetSegments: Array<{ type: 'equal' | 'insert'; text: string }>;
  } {
    const sourceTokens = this.tokenizeInlineDiffText(sourceText);
    const targetTokens = this.tokenizeInlineDiffText(targetText);

    if (sourceTokens.length === 0 && targetTokens.length === 0) {
      return {
        granularity: 'word',
        sourceSegments: [],
        targetSegments: [],
      };
    }

    // Keep runtime predictable for very large blocks
    if (sourceTokens.length * targetTokens.length > 120000) {
      return {
        granularity: 'word',
        sourceSegments: sourceText
          ? [{ type: 'delete', text: sourceText }]
          : [],
        targetSegments: targetText
          ? [{ type: 'insert', text: targetText }]
          : [],
      };
    }

    const n = sourceTokens.length;
    const m = targetTokens.length;
    const lcs: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));

    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        if (sourceTokens[i] === targetTokens[j]) {
          lcs[i][j] = lcs[i + 1][j + 1] + 1;
        } else {
          lcs[i][j] = Math.max(lcs[i + 1][j], lcs[i][j + 1]);
        }
      }
    }

    const ops: Array<{ op: 'equal' | 'delete' | 'insert'; text: string }> = [];
    let i = 0;
    let j = 0;

    while (i < n && j < m) {
      if (sourceTokens[i] === targetTokens[j]) {
        ops.push({ op: 'equal', text: sourceTokens[i] });
        i += 1;
        j += 1;
      } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
        ops.push({ op: 'delete', text: sourceTokens[i] });
        i += 1;
      } else {
        ops.push({ op: 'insert', text: targetTokens[j] });
        j += 1;
      }
    }

    while (i < n) {
      ops.push({ op: 'delete', text: sourceTokens[i] });
      i += 1;
    }

    while (j < m) {
      ops.push({ op: 'insert', text: targetTokens[j] });
      j += 1;
    }

    const mergeSegments = <T extends { type: string; text: string }>(segments: T[]): T[] => {
      const merged: T[] = [];
      for (const segment of segments) {
        const prev = merged[merged.length - 1];
        if (prev && prev.type === segment.type) {
          prev.text += segment.text;
        } else {
          merged.push({ ...segment });
        }
      }
      return merged;
    };

    const sourceSegments = mergeSegments(
      ops
        .filter((segment) => segment.op !== 'insert')
        .map((segment) => ({
          type: segment.op === 'delete' ? 'delete' as const : 'equal' as const,
          text: segment.text,
        }))
    );

    const targetSegments = mergeSegments(
      ops
        .filter((segment) => segment.op !== 'delete')
        .map((segment) => ({
          type: segment.op === 'insert' ? 'insert' as const : 'equal' as const,
          text: segment.text,
        }))
    );

    return {
      granularity: 'word',
      sourceSegments,
      targetSegments,
    };
  }

  private getComparableContractText(templateData: Record<string, any>): string {
    const value = [
      templateData.assembled_contract_body,
      templateData.assembledText,
      templateData.contract_body,
    ].find((item) => typeof item === 'string' && item.trim().length > 0);

    return typeof value === 'string' ? value : '';
  }

  private async extractComparableBlocks(params: {
    generation: {
      id: string;
      caseId: string | null;
      templateData: any;
      comparisonSnapshot?: any;
    };
    role: 'source' | 'target';
    sourceGenerationId: string;
  }): Promise<{
    strategy: 'SNAPSHOT' | 'EDIT_DRAFT' | 'ASSEMBLY' | 'TEXT_SPLIT' | 'EMPTY';
    blocks: Array<{
      id: string;
      title: string;
      body: string;
      orderIndex: number;
      sourceClauseId?: string | null;
    }>;
  }> {
    const { generation, role, sourceGenerationId } = params;

    const snapshotExtract = this.extractBlocksFromComparisonSnapshot(generation.comparisonSnapshot);
    if (snapshotExtract) {
      return {
        strategy: 'SNAPSHOT',
        blocks: snapshotExtract.blocks,
      };
    }

    if (role === 'target' && generation.caseId) {
      const draftTemplateId = `${this.EDIT_DRAFT_TEMPLATE_PREFIX}${sourceGenerationId}`;
      const savedDraft = await prisma.generationDraft.findFirst({
        where: {
          caseId: generation.caseId,
          templateId: draftTemplateId,
        },
        orderBy: { updatedAt: 'desc' },
      });

      if (savedDraft) {
        const draftData = (savedDraft.draftData || {}) as Record<string, any>;
        const blocks = this.normalizeEditBlocks(Array.isArray(draftData.blocks) ? draftData.blocks : []);
        if (blocks.length > 0) {
          return {
            strategy: 'EDIT_DRAFT',
            blocks,
          };
        }
      }
    }

    if (generation.caseId) {
      const assembly = await prisma.contractAssemblyDraft.findUnique({
        where: {
          caseId_contractType: {
            caseId: generation.caseId,
            contractType: 'ADASVETEL',
          },
        },
        include: {
          clauses: {
            include: { clause: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      if (assembly && assembly.clauses.length > 0) {
        const blocks = this.normalizeEditBlocks(
          assembly.clauses.map((entry, index) => ({
            id: entry.id,
            title: entry.clause.title,
            body: entry.editedBody || entry.clause.body,
            orderIndex: Number.isFinite(entry.sortOrder) ? entry.sortOrder : index,
            sourceClauseId: entry.clauseId,
          }))
        );

        if (blocks.length > 0) {
          return {
            strategy: 'ASSEMBLY',
            blocks,
          };
        }
      }
    }

    const templateData = ((generation.templateData || {}) as Record<string, any>) || {};
    const fallbackText = this.getComparableContractText(templateData);
    if (fallbackText) {
      const blocks = this.deriveBlocksFromAssembledText(fallbackText);
      return {
        strategy: blocks.length > 0 ? 'TEXT_SPLIT' : 'EMPTY',
        blocks,
      };
    }

    return {
      strategy: 'EMPTY',
      blocks: [],
    };
  }

  private compareContractBlocks(params: {
    sourceBlocks: Array<{
      id: string;
      title: string;
      body: string;
      orderIndex: number;
      sourceClauseId?: string | null;
    }>;
    targetBlocks: Array<{
      id: string;
      title: string;
      body: string;
      orderIndex: number;
      sourceClauseId?: string | null;
    }>;
  }): Array<{
    id: string;
    status: 'unchanged' | 'modified' | 'added' | 'removed';
    sourceBlock: {
      id: string;
      title: string;
      body: string;
      orderIndex: number;
      sourceClauseId?: string | null;
    } | null;
    targetBlock: {
      id: string;
      title: string;
      body: string;
      orderIndex: number;
      sourceClauseId?: string | null;
    } | null;
    matchStrategy: 'CLAUSE_ID' | 'TITLE' | 'ORDER' | 'NONE';
    inlineDiff?: {
      granularity: 'word';
      sourceSegments: Array<{ type: 'equal' | 'delete'; text: string }>;
      targetSegments: Array<{ type: 'equal' | 'insert'; text: string }>;
    };
  }> {
    const { sourceBlocks, targetBlocks } = params;

    const usedSource = new Set<string>();
    const byClause = new Map<string, (typeof sourceBlocks)[number]>();
    const byTitle = new Map<string, (typeof sourceBlocks)[number]>();
    const byOrder = new Map<number, (typeof sourceBlocks)[number]>();

    for (const block of sourceBlocks) {
      if (block.sourceClauseId && !byClause.has(block.sourceClauseId)) {
        byClause.set(block.sourceClauseId, block);
      }
      const normalizedTitle = this.normalizeCompareText(block.title);
      if (normalizedTitle && !byTitle.has(normalizedTitle)) {
        byTitle.set(normalizedTitle, block);
      }
      if (!byOrder.has(block.orderIndex)) {
        byOrder.set(block.orderIndex, block);
      }
    }

    const result: Array<{
      id: string;
      status: 'unchanged' | 'modified' | 'added' | 'removed';
      sourceBlock: {
        id: string;
        title: string;
        body: string;
        orderIndex: number;
        sourceClauseId?: string | null;
      } | null;
      targetBlock: {
        id: string;
        title: string;
        body: string;
        orderIndex: number;
        sourceClauseId?: string | null;
      } | null;
      matchStrategy: 'CLAUSE_ID' | 'TITLE' | 'ORDER' | 'NONE';
      inlineDiff?: {
        granularity: 'word';
        sourceSegments: Array<{ type: 'equal' | 'delete'; text: string }>;
        targetSegments: Array<{ type: 'equal' | 'insert'; text: string }>;
      };
    }> = [];

    for (const target of targetBlocks) {
      let source: (typeof sourceBlocks)[number] | undefined;
      let matchStrategy: 'CLAUSE_ID' | 'TITLE' | 'ORDER' | 'NONE' = 'NONE';

      if (target.sourceClauseId) {
        const byClauseMatch = byClause.get(target.sourceClauseId);
        if (byClauseMatch && !usedSource.has(byClauseMatch.id)) {
          source = byClauseMatch;
          matchStrategy = 'CLAUSE_ID';
        }
      }

      if (!source) {
        const normalizedTitle = this.normalizeCompareText(target.title);
        const byTitleMatch = normalizedTitle ? byTitle.get(normalizedTitle) : undefined;
        if (byTitleMatch && !usedSource.has(byTitleMatch.id)) {
          source = byTitleMatch;
          matchStrategy = 'TITLE';
        }
      }

      if (!source) {
        const byOrderMatch = byOrder.get(target.orderIndex);
        if (byOrderMatch && !usedSource.has(byOrderMatch.id)) {
          source = byOrderMatch;
          matchStrategy = 'ORDER';
        }
      }

      if (!source) {
        result.push({
          id: `added-${target.id}`,
          status: 'added',
          sourceBlock: null,
          targetBlock: target,
          matchStrategy,
        });
        continue;
      }

      usedSource.add(source.id);
      const status = this.normalizeCompareText(source.body) === this.normalizeCompareText(target.body)
        ? 'unchanged'
        : 'modified';
      const inlineDiff = status === 'modified'
        ? this.buildInlineDiffPreview(source.body, target.body)
        : undefined;

      result.push({
        id: `${source.id}->${target.id}`,
        status,
        sourceBlock: source,
        targetBlock: target,
        matchStrategy,
        ...(inlineDiff ? { inlineDiff } : {}),
      });
    }

    for (const source of sourceBlocks) {
      if (!usedSource.has(source.id)) {
        result.push({
          id: `removed-${source.id}`,
          status: 'removed',
          sourceBlock: source,
          targetBlock: null,
          matchStrategy: 'NONE',
        });
      }
    }

    return result;
  }

  async getContractComparison(targetId: string, againstId?: string): Promise<{
    success: boolean;
    error?: string;
    comparison?: {
      mode: 'BLOCK_LEVEL';
      confidence: 'HIGH' | 'MEDIUM' | 'LOW';
      confidenceReason: string;
      sourceSelection: 'EXPLICIT' | 'PARENT_LINEAGE' | 'INFERRED_PREVIOUS';
      source: {
        id: string;
        title: string;
        caseId: string | null;
        templateCategory: string;
        revisionNumber: number;
        isCurrentRevision: boolean;
        parentRevisionId?: string | null;
        generatedAt: Date;
      };
      target: {
        id: string;
        title: string;
        caseId: string | null;
        templateCategory: string;
        revisionNumber: number;
        isCurrentRevision: boolean;
        parentRevisionId?: string | null;
        generatedAt: Date;
      };
      summary: {
        total: number;
        unchanged: number;
        modified: number;
        added: number;
        removed: number;
      };
      blocks: Array<{
        id: string;
        status: 'unchanged' | 'modified' | 'added' | 'removed';
        sourceBlock: {
          id: string;
          title: string;
          body: string;
          orderIndex: number;
          sourceClauseId?: string | null;
        } | null;
        targetBlock: {
          id: string;
          title: string;
          body: string;
          orderIndex: number;
          sourceClauseId?: string | null;
        } | null;
        matchStrategy: 'CLAUSE_ID' | 'TITLE' | 'ORDER' | 'NONE';
        inlineDiff?: {
          granularity: 'word';
          sourceSegments: Array<{ type: 'equal' | 'delete'; text: string }>;
          targetSegments: Array<{ type: 'equal' | 'insert'; text: string }>;
        };
      }>;
      extraction: {
        sourceStrategy: 'SNAPSHOT' | 'EDIT_DRAFT' | 'ASSEMBLY' | 'TEXT_SPLIT' | 'EMPTY';
        targetStrategy: 'SNAPSHOT' | 'EDIT_DRAFT' | 'ASSEMBLY' | 'TEXT_SPLIT' | 'EMPTY';
      };
    };
  }> {
    try {
      const target = await prisma.contractGeneration.findUnique({
        where: { id: targetId },
        include: {
          template: {
            select: {
              category: true,
            },
          },
        },
      });

      if (!target) {
        return { success: false, error: 'Target contract not found' };
      }

      let sourceSelection: 'EXPLICIT' | 'PARENT_LINEAGE' | 'INFERRED_PREVIOUS' = 'EXPLICIT';
      let sourceId = againstId;

      if (!sourceId && target.parentRevisionId) {
        sourceId = target.parentRevisionId;
        sourceSelection = 'PARENT_LINEAGE';
      }

      if (!sourceId) {
        const inferred = await prisma.contractGeneration.findFirst({
          where: {
            caseId: target.caseId,
            templateId: target.templateId,
            id: { not: target.id },
            generatedAt: { lt: target.generatedAt },
          },
          orderBy: { generatedAt: 'desc' },
          select: { id: true },
        });
        if (inferred?.id) {
          sourceId = inferred.id;
          sourceSelection = 'INFERRED_PREVIOUS';
        }
      }

      if (!sourceId) {
        return {
          success: false,
          error: 'No source contract available for comparison (against or lineage required)',
        };
      }

      const source = await prisma.contractGeneration.findUnique({
        where: { id: sourceId },
        include: {
          template: {
            select: {
              category: true,
            },
          },
        },
      });

      if (!source) {
        return { success: false, error: 'Source contract not found' };
      }

      if (target.template.category !== 'ADASVETEL' || source.template.category !== 'ADASVETEL') {
        return { success: false, error: 'Compare foundation currently supports only ADASVETEL contracts' };
      }

      const sourceExtract = await this.extractComparableBlocks({
        generation: {
          id: source.id,
          caseId: source.caseId,
          templateData: source.templateData,
          comparisonSnapshot: source.comparisonSnapshot,
        },
        role: 'source',
        sourceGenerationId: source.id,
      });

      const targetExtract = await this.extractComparableBlocks({
        generation: {
          id: target.id,
          caseId: target.caseId,
          templateData: target.templateData,
          comparisonSnapshot: target.comparisonSnapshot,
        },
        role: 'target',
        sourceGenerationId: source.id,
      });

      const blocks = this.compareContractBlocks({
        sourceBlocks: sourceExtract.blocks,
        targetBlocks: targetExtract.blocks,
      });

      const summary = {
        total: blocks.length,
        unchanged: blocks.filter((block) => block.status === 'unchanged').length,
        modified: blocks.filter((block) => block.status === 'modified').length,
        added: blocks.filter((block) => block.status === 'added').length,
        removed: blocks.filter((block) => block.status === 'removed').length,
      };

      const confidence = sourceExtract.strategy === 'SNAPSHOT' || targetExtract.strategy === 'SNAPSHOT'
        ? 'HIGH'
        : sourceExtract.strategy === 'EDIT_DRAFT' || targetExtract.strategy === 'EDIT_DRAFT'
        ? 'HIGH'
        : sourceExtract.strategy === 'ASSEMBLY' || targetExtract.strategy === 'ASSEMBLY'
          ? 'MEDIUM'
          : 'LOW';

      const confidenceReason = sourceExtract.strategy === 'SNAPSHOT' || targetExtract.strategy === 'SNAPSHOT'
        ? 'Persisted comparison snapshot blocks were available for at least one side.'
        : confidence === 'HIGH'
        ? 'Structured edit-draft blocks were available for comparison.'
        : confidence === 'MEDIUM'
          ? 'Assembly-origin structured blocks were used for at least one side.'
          : 'Fallback text-splitting comparison was used; interpret as approximate.';

      return {
        success: true,
        comparison: {
          mode: 'BLOCK_LEVEL',
          confidence,
          confidenceReason,
          sourceSelection,
          source: {
            id: source.id,
            title: source.title,
            caseId: source.caseId,
            templateCategory: source.template.category,
            revisionNumber: source.revisionNumber || 1,
            isCurrentRevision: source.isCurrentRevision !== false,
            parentRevisionId: source.parentRevisionId || null,
            generatedAt: source.generatedAt,
          },
          target: {
            id: target.id,
            title: target.title,
            caseId: target.caseId,
            templateCategory: target.template.category,
            revisionNumber: target.revisionNumber || 1,
            isCurrentRevision: target.isCurrentRevision !== false,
            parentRevisionId: target.parentRevisionId || null,
            generatedAt: target.generatedAt,
          },
          summary,
          blocks,
          extraction: {
            sourceStrategy: sourceExtract.strategy,
            targetStrategy: targetExtract.strategy,
          },
        },
      };
    } catch (error) {
      console.error('Get contract comparison error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getEditDraft(generationId: string): Promise<{
    documentId: string;
    caseId: string;
    contractType: 'ADASVETEL';
    sourceMode: 'saved_draft' | 'assembly' | 'fallback_text' | 'empty';
    blocks: Array<{
      id: string;
      title: string;
      body: string;
      orderIndex: number;
      sourceClauseId?: string | null;
    }>;
    draftMeta: {
      generationDraftId?: string;
      updatedAt?: Date;
      message?: string;
    };
  }> {
    const generation = await prisma.contractGeneration.findUnique({
      where: { id: generationId },
      include: {
        template: {
          select: {
            id: true,
            category: true,
            name: true,
          },
        },
      },
    });

    if (!generation) {
      throw new Error('Contract generation not found');
    }

    const { caseId } = this.assertAdasvetelEditEligible({
      id: generation.id,
      caseId: generation.caseId,
      template: { category: generation.template.category },
    });

    const draftTemplateId = `${this.EDIT_DRAFT_TEMPLATE_PREFIX}${generation.id}`;

    const savedDraft = await prisma.generationDraft.findFirst({
      where: {
        caseId,
        templateId: draftTemplateId,
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (savedDraft) {
      const draftData = (savedDraft.draftData || {}) as Record<string, any>;
      const blocks = this.normalizeEditBlocks(Array.isArray(draftData.blocks) ? draftData.blocks : []);
      return {
        documentId: generation.id,
        caseId,
        contractType: 'ADASVETEL',
        sourceMode: 'saved_draft',
        blocks,
        draftMeta: {
          generationDraftId: savedDraft.id,
          updatedAt: savedDraft.updatedAt,
        },
      };
    }

    const assembly = await prisma.contractAssemblyDraft.findUnique({
      where: {
        caseId_contractType: {
          caseId,
          contractType: 'ADASVETEL',
        },
      },
      include: {
        clauses: {
          include: {
            clause: true,
          },
          orderBy: {
            sortOrder: 'asc',
          },
        },
      },
    });

    if (assembly && assembly.clauses.length > 0) {
      const blocks = this.normalizeEditBlocks(
        assembly.clauses.map((entry, index) => ({
          id: entry.id,
          title: entry.clause.title,
          body: entry.editedBody || entry.clause.body,
          orderIndex: Number.isFinite(entry.sortOrder) ? entry.sortOrder : index,
          sourceClauseId: entry.clauseId,
        }))
      );

      return {
        documentId: generation.id,
        caseId,
        contractType: 'ADASVETEL',
        sourceMode: 'assembly',
        blocks,
        draftMeta: {
          message: 'Loaded from contract assembly draft (no prior edit draft found).',
        },
      };
    }

    const templateData = (generation.templateData || {}) as Record<string, any>;
    const fallbackText = [
      templateData.assembled_contract_body,
      templateData.assembledText,
      templateData.contract_body,
    ].find((value) => typeof value === 'string' && value.trim().length > 0) as string | undefined;

    if (fallbackText) {
      return {
        documentId: generation.id,
        caseId,
        contractType: 'ADASVETEL',
        sourceMode: 'fallback_text',
        blocks: this.deriveBlocksFromAssembledText(fallbackText),
        draftMeta: {
          message: 'Loaded from assembled text fallback (assembly-origin clauses unavailable).',
        },
      };
    }

    return {
      documentId: generation.id,
      caseId,
      contractType: 'ADASVETEL',
      sourceMode: 'empty',
      blocks: [],
      draftMeta: {
        message: 'No assembly structure or assembled text available for edit mode.',
      },
    };
  }

  async saveEditDraft(generationId: string, params: {
    blocks: Array<{
      id?: string;
      title?: string;
      body?: string;
      orderIndex?: number;
      sourceClauseId?: string | null;
    }>;
  }): Promise<{
    success: boolean;
    documentId: string;
    caseId: string;
    contractType: 'ADASVETEL';
    blocks: Array<{
      id: string;
      title: string;
      body: string;
      orderIndex: number;
      sourceClauseId?: string | null;
    }>;
    draftId: string;
    updatedAt: Date;
  }> {
    const generation = await prisma.contractGeneration.findUnique({
      where: { id: generationId },
      include: {
        template: {
          select: {
            category: true,
          },
        },
      },
    });

    if (!generation) {
      throw new Error('Contract generation not found');
    }

    const { caseId } = this.assertAdasvetelEditEligible({
      id: generation.id,
      caseId: generation.caseId,
      template: { category: generation.template.category },
    });

    const blocks = this.normalizeEditBlocks(params.blocks || []);
    const assembledText = blocks
      .map((block, index) => `${index + 1}. ${block.title}\n${block.body}`.trim())
      .join('\n\n')
      .trim();

    const draftTemplateId = `${this.EDIT_DRAFT_TEMPLATE_PREFIX}${generation.id}`;

    const draft = await prisma.generationDraft.upsert({
      where: {
        caseId_templateId: {
          caseId,
          templateId: draftTemplateId,
        },
      },
      create: {
        caseId,
        templateId: draftTemplateId,
        templateName: `Edit Draft — ${generation.title}`,
        documentFamily: 'EDIT_MODE_ADASVETEL',
        draftData: {
          sourceDocumentId: generation.id,
          contractType: 'ADASVETEL',
          assembledText,
          blocks,
        } as any,
      },
      update: {
        templateName: `Edit Draft — ${generation.title}`,
        documentFamily: 'EDIT_MODE_ADASVETEL',
        draftData: {
          sourceDocumentId: generation.id,
          contractType: 'ADASVETEL',
          assembledText,
          blocks,
        } as any,
      },
    });

    return {
      success: true,
      documentId: generation.id,
      caseId,
      contractType: 'ADASVETEL',
      blocks,
      draftId: draft.id,
      updatedAt: draft.updatedAt,
    };
  }

  async generateRevisionFromEditDraft(generationId: string, userId?: string, userEmail?: string): Promise<{
    success: boolean;
    error?: string;
    sourceDocumentId?: string;
    contract?: {
      id: string;
      title: string;
      fileName: string;
      filePath: string;
      fileSize: number;
      templateId: string;
      caseId?: string;
      generatedAt: Date;
      revisionNumber: number;
      parentRevisionId?: string;
    };
  }> {
    try {
      const generation = await prisma.contractGeneration.findUnique({
        where: { id: generationId },
        include: {
          template: {
            select: {
              id: true,
              category: true,
            },
          },
        },
      });

      if (!generation) {
        return { success: false, error: 'Contract generation not found' };
      }

      const { caseId } = this.assertAdasvetelEditEligible({
        id: generation.id,
        caseId: generation.caseId,
        template: { category: generation.template.category },
      });

      const sourceTemplateData = ((generation.templateData || {}) as Record<string, any>) || {};
      const draftTemplateId = `${this.EDIT_DRAFT_TEMPLATE_PREFIX}${generation.id}`;

      const savedDraft = await prisma.generationDraft.findFirst({
        where: {
          caseId,
          templateId: draftTemplateId,
        },
        orderBy: { updatedAt: 'desc' },
      });

      let sourceMode: 'saved_blocks' | 'saved_assembled_text' | 'fallback_text' = 'fallback_text';
      let blocks: Array<{
        id: string;
        title: string;
        body: string;
        orderIndex: number;
        sourceClauseId?: string | null;
      }> = [];

      if (savedDraft) {
        const draftData = (savedDraft.draftData || {}) as Record<string, any>;
        const rawBlocks = Array.isArray(draftData.blocks) ? draftData.blocks : [];
        if (rawBlocks.length > 0) {
          blocks = this.normalizeEditBlocks(rawBlocks);
          sourceMode = 'saved_blocks';
        } else {
          const draftAssembledText = typeof draftData.assembledText === 'string'
            ? draftData.assembledText.trim()
            : '';
          if (draftAssembledText) {
            blocks = this.deriveBlocksFromAssembledText(draftAssembledText);
            sourceMode = 'saved_assembled_text';
          }
        }
      }

      if (blocks.length === 0) {
        const fallbackText = [
          sourceTemplateData.assembled_contract_body,
          sourceTemplateData.assembledText,
          sourceTemplateData.contract_body,
        ].find((value) => typeof value === 'string' && value.trim().length > 0) as string | undefined;

        if (fallbackText) {
          blocks = this.deriveBlocksFromAssembledText(fallbackText);
          sourceMode = 'fallback_text';
        }
      }

      if (blocks.length === 0) {
        return {
          success: false,
          error: 'No editable content found in saved draft or fallback text',
        };
      }

      const assembledContractBody = blocks
        .map((block, index) => `${index + 1}. ${block.title}\n${block.body}`.trim())
        .join('\n\n')
        .trim();

      const revisionNumber = (generation.revisionNumber || 1) + 1;
      const generationPayload: Record<string, any> = {
        ...sourceTemplateData,
        assembled_contract_body: assembledContractBody,
        assembledText: assembledContractBody,
        contract_body: assembledContractBody,
        _editModeMeta: {
          sourceDocumentId: generation.id,
          sourceMode,
          contractType: 'ADASVETEL',
          generatedAt: new Date().toISOString(),
          blockCount: blocks.length,
        },
      };

      const result = await this.generateContract({
        templateId: generation.templateId,
        caseId,
        data: generationPayload,
        title: `${generation.title} — szerkesztett verzió`,
        userId,
        userEmail,
      });

      if (!result.success || !result.document?.id) {
        return {
          success: false,
          error: result.error || 'Failed to generate edited revision output',
        };
      }

      const updated = await prisma.contractGeneration.update({
        where: { id: result.document.id },
        data: {
          parentRevisionId: generation.id,
          revisionNumber,
          isCurrentRevision: true,
          comparisonSnapshot: this.buildComparisonSnapshot({
            blocks,
            sourceMode,
            sourceDocumentId: generation.id,
            assembledText: assembledContractBody,
          }) as any,
        },
      });

      return {
        success: true,
        sourceDocumentId: generation.id,
        contract: {
          id: updated.id,
          title: updated.title,
          fileName: updated.fileName,
          filePath: updated.filePath,
          fileSize: updated.fileSize || 0,
          templateId: updated.templateId,
          caseId: updated.caseId || undefined,
          generatedAt: updated.generatedAt,
          revisionNumber: updated.revisionNumber || revisionNumber,
          parentRevisionId: updated.parentRevisionId || generation.id,
        },
      };
    } catch (error) {
      console.error('Generate revision from edit draft error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getEditSuggestions(generationId: string, search?: string): Promise<{
    documentId: string;
    contractType: 'ADASVETEL';
    lawyerProfile: { id: string; lawyerName: string } | null;
    suggestions: Array<{
      id: string;
      title: string;
      body: string;
      summary: string | null;
      clauseKind: string;
      category: string;
      representedSide: string;
      sortOrder: number;
      lawyerProfileId: string | null;
    }>;
  }> {
    const generation = await prisma.contractGeneration.findUnique({
      where: { id: generationId },
      include: {
        template: {
          select: {
            category: true,
          },
        },
      },
    });

    if (!generation) {
      throw new Error('Contract generation not found');
    }

    this.assertAdasvetelEditEligible({
      id: generation.id,
      caseId: generation.caseId,
      template: { category: generation.template.category },
    });

    const truglyProfile = await prisma.lawyerProfile.findFirst({
      where: {
        isActive: true,
        lawyerName: {
          contains: 'Trugly',
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        lawyerName: true,
      },
    });

    const where: any = {
      contractType: 'ADASVETEL',
      isActive: true,
      OR: truglyProfile
        ? [{ lawyerProfileId: truglyProfile.id }, { lawyerProfileId: null }]
        : [{ lawyerProfileId: null }],
    };

    if (search && search.trim().length > 0) {
      where.AND = [
        {
          OR: [
            { title: { contains: search.trim(), mode: 'insensitive' } },
            { summary: { contains: search.trim(), mode: 'insensitive' } },
            { keywords: { hasSome: [search.trim().toLowerCase()] } },
          ],
        },
      ];
    }

    const suggestions = await prisma.clauseLibraryItem.findMany({
      where,
      orderBy: [{ clauseKind: 'asc' }, { sortOrder: 'asc' }, { title: 'asc' }],
      select: {
        id: true,
        title: true,
        body: true,
        summary: true,
        clauseKind: true,
        category: true,
        representedSide: true,
        sortOrder: true,
        lawyerProfileId: true,
      },
      take: 120,
    });

    return {
      documentId: generation.id,
      contractType: 'ADASVETEL',
      lawyerProfile: truglyProfile,
      suggestions,
    };
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
      let sharePointCaseRef = generation.caseId;
      if (generation.caseId) {
        const caseById = await prisma.case.findUnique({
          where: { id: generation.caseId },
          select: { caseNumber: true },
        });
        if (caseById?.caseNumber) {
          sharePointCaseRef = caseById.caseNumber;
        }
      }

      const result = await driveService.uploadDocument({
        caseId: sharePointCaseRef,
        fileName: generation.fileName,
        content: fileContent,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        folder: 'Contracts'
      });

      if (result.success) {
        // Update generation status AND persist SharePoint metadata
        await prisma.contractGeneration.update({
          where: { id: generationId },
          data: { 
            status: 'UPLOADED',
            spItemId: result.item?.id,
            spWebUrl: result.webUrl
          }
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
      spItemId: generation.spItemId || undefined,
      spWebUrl: generation.spWebUrl || undefined,
      status: generation.status
    };
  }

  /**
   * Finalize a contract generation - marks it as final (locked for editing)
   */
  async finalizeContract(generationId: string): Promise<{
    success: boolean;
    error?: string;
    contract?: {
      id: string;
      title: string;
      fileName: string;
      status: string;
      isFinalRevision: boolean;
      finalizedAt: Date;
    };
  }> {
    try {
      const generation = await prisma.contractGeneration.findUnique({
        where: { id: generationId },
        include: { template: true }
      });

      if (!generation) {
        return { success: false, error: 'Contract generation not found' };
      }

      // If this is already final, don't allow re-finalization
      if (generation.isFinalRevision) {
        return { success: false, error: 'Contract is already finalized' };
      }

      // Mark any existing final revision as superseded
      await prisma.contractGeneration.updateMany({
        where: { 
          caseId: generation.caseId,
          templateId: generation.templateId,
          isFinalRevision: true
        },
        data: { 
          isFinalRevision: false,
          supersededAt: new Date()
        }
      });

      // Update the contract to APPROVED status and mark as final
      const updated = await prisma.contractGeneration.update({
        where: { id: generationId },
        data: { 
          status: 'APPROVED' as any,
          isFinalRevision: true,
          finalizedAt: new Date()
        }
      });

      return {
        success: true,
        contract: {
          id: updated.id,
          title: updated.title,
          fileName: updated.fileName,
          status: updated.status,
          isFinalRevision: updated.isFinalRevision,
          finalizedAt: updated.finalizedAt || new Date()
        }
      };
    } catch (error) {
      console.error('Finalize contract error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Create a revision (new version) of an existing contract generation
   * by copying the current file and incrementing a revision number suffix
   */
  async createContractRevision(generationId: string, userId?: string, userEmail?: string): Promise<{
    success: boolean;
    error?: string;
    newContract?: {
      id: string;
      title: string;
      fileName: string;
      status: string;
      revisionNumber: number;
    };
  }> {
    try {
      const generation = await prisma.contractGeneration.findUnique({
        where: { id: generationId },
        include: { template: true }
      });

      if (!generation) {
        return { success: false, error: 'Contract generation not found' };
      }

      // Check if source file exists
      if (!fs.existsSync(generation.filePath)) {
        return { success: false, error: 'Source file not found' };
      }

      // Create new file with revision suffix
      const timestamp = Date.now();
      const baseName = generation.fileName.replace(/\.docx$/i, '');
      const newFileName = `${baseName}_rev_${timestamp}.docx`;
      const newFilePath = path.join(GENERATED_DIR, newFileName);

      // Copy the file
      fs.copyFileSync(generation.filePath, newFilePath);
      const stats = fs.statSync(newFilePath);

      // Mark current revision as superseded
      await prisma.contractGeneration.update({
        where: { id: generationId },
        data: {
          isCurrentRevision: false,
          supersededAt: new Date()
        }
      });

      // Use revisionNumber from the generation or compute next
      const nextRevision = (generation.revisionNumber || 1) + 1;

      // Create new contract generation record with revision lineage
      const newGeneration = await prisma.contractGeneration.create({
        data: {
          title: `${generation.title} (Revision ${nextRevision})`,
          templateId: generation.templateId,
          caseId: generation.caseId,
          templateData: generation.templateData as any,
          fileName: newFileName,
          filePath: newFilePath,
          fileSize: stats.size,
          status: 'GENERATED',
          revisionNumber: nextRevision,
          parentRevisionId: generationId,
          isCurrentRevision: true,
          // Carry over SharePoint metadata if present
          spItemId: generation.spItemId,
          spWebUrl: generation.spWebUrl
        }
      });

      // Create timeline event if caseId and userId provided
      const timelineUserId = await this.resolveTimelineUserId(userId, userEmail);

      if (generation.caseId && timelineUserId) {
        await prisma.timelineEvent.create({
          data: {
            caseId: generation.caseId,
            userId: timelineUserId,
            eventType: 'CONTRACT_GENERATED',
            type: 'CONTRACT_GENERATED',
            payload: {
              originalGenerationId: generationId,
              newGenerationId: newGeneration.id,
              revisionNumber: nextRevision,
              action: 'REVISION_CREATED'
            }
          }
        });
      }

      return {
        success: true,
        newContract: {
          id: newGeneration.id,
          title: newGeneration.title,
          fileName: newGeneration.fileName,
          status: newGeneration.status,
          revisionNumber: nextRevision
        }
      };
    } catch (error) {
      console.error('Create contract revision error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Reject / Undo Approval - move a contract back to GENERATED state
   * Also clears the final revision flag if present
   */
  async rejectApproval(generationId: string, userId?: string, userEmail?: string, reason?: string): Promise<{
    success: boolean;
    error?: string;
    contract?: {
      id: string;
      title: string;
      status: string;
      isFinalRevision: boolean;
    };
  }> {
    try {
      const generation = await prisma.contractGeneration.findUnique({
        where: { id: generationId }
      });

      if (!generation) {
        return { success: false, error: 'Contract generation not found' };
      }

      // Update status back to GENERATED and clear final flag
      const updated = await prisma.contractGeneration.update({
        where: { id: generationId },
        data: { 
          status: 'GENERATED' as any,
          isFinalRevision: false,
          finalizedAt: null
        }
      });

      // Create timeline event if caseId and userId provided
      const timelineUserId = await this.resolveTimelineUserId(userId, userEmail);

      if (generation.caseId && timelineUserId) {
        await prisma.timelineEvent.create({
          data: {
            caseId: generation.caseId,
            userId: timelineUserId,
            eventType: 'CONTRACT_GENERATED' as any,
            type: 'CONTRACT_REJECTED',
            payload: {
              generationId: generation.id,
              documentTitle: generation.title,
              reason: reason || 'Approval rejected',
              action: 'REJECT_APPROVAL'
            }
          }
        });
      }

      return {
        success: true,
        contract: {
          id: updated.id,
          title: updated.title,
          status: updated.status,
          isFinalRevision: updated.isFinalRevision
        }
      };
    } catch (error) {
      console.error('Reject approval error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Back to Review - move a contract to GENERATED state (sent back for review)
   */
  async backToReview(generationId: string, userId?: string, userEmail?: string, note?: string): Promise<{
    success: boolean;
    error?: string;
    contract?: {
      id: string;
      title: string;
      status: string;
    };
  }> {
    try {
      const generation = await prisma.contractGeneration.findUnique({
        where: { id: generationId }
      });

      if (!generation) {
        return { success: false, error: 'Contract generation not found' };
      }

      // Update status to GENERATED (back to draft/review state)
      const updated = await prisma.contractGeneration.update({
        where: { id: generationId },
        data: { status: 'GENERATED' as any }
      });

      // Create timeline event if caseId and userId provided
      const timelineUserId = await this.resolveTimelineUserId(userId, userEmail);

      if (generation.caseId && timelineUserId) {
        await prisma.timelineEvent.create({
          data: {
            caseId: generation.caseId,
            userId: timelineUserId,
            eventType: 'CONTRACT_GENERATED' as any,
            type: 'SENT_TO_REVIEW',
            payload: {
              generationId: generation.id,
              documentTitle: generation.title,
              note: note || 'Sent back to review',
              action: 'BACK_TO_REVIEW'
            }
          }
        });
      }

      return {
        success: true,
        contract: {
          id: updated.id,
          title: updated.title,
          status: updated.status
        }
      };
    } catch (error) {
      console.error('Back to review error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get contract-specific timeline events
   */
  async getContractTimeline(generationId: string): Promise<{
    success: boolean;
    error?: string;
    events?: Array<{
      id: string;
      type: string;
      typeLabel: string;
      description: string;
      createdAt: Date;
      userId?: string;
      payload?: Record<string, unknown>;
    }>;
  }> {
    try {
      const generation = await prisma.contractGeneration.findUnique({
        where: { id: generationId },
        select: { caseId: true, title: true }
      });

      if (!generation) {
        return { success: false, error: 'Contract generation not found' };
      }

      // Get all timeline events for this case that relate to this document
      const events = await prisma.timelineEvent.findMany({
        where: {
          caseId: generation.caseId,
          OR: [
            // Events with documentId in payload matching this generation
            {
              payload: {
                path: ['generationId'],
                equals: generationId
              }
            },
            // Events with originalGenerationId in payload (for revisions)
            {
              payload: {
                path: ['originalGenerationId'],
                equals: generationId
              }
            },
            // Events with newGenerationId in payload (for revision creation events)
            {
              payload: {
                path: ['newGenerationId'],
                equals: generationId
              }
            },
            // Events with documentId matching generationId
            {
              payload: {
                path: ['documentId'],
                equals: generationId
              }
            }
          ]
        },
        orderBy: { createdAt: 'desc' },
        take: 50
      });

      return {
        success: true,
        events: events.map(e => ({
          id: e.id,
          type: e.eventType,
          typeLabel: e.type || e.eventType,
          description: e.description || `${e.eventType} event`,
          createdAt: e.createdAt,
          userId: e.userId || undefined,
          payload: e.payload as Record<string, unknown> || {}
        }))
      };
    } catch (error) {
      console.error('Get contract timeline error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Download all generated contracts for a case as a ZIP bundle
   */
  async downloadCaseBundle(caseId: string): Promise<{
    success: boolean;
    error?: string;
    zipBuffer?: Buffer;
    fileName?: string;
    includedFiles?: string[];
  }> {
    try {
      const JSZip = (await import('jszip')).default;
      const resolvedCaseId = await this.resolveCaseId(caseId);

      const whereClause = resolvedCaseId && resolvedCaseId !== caseId
        ? { OR: [{ caseId: resolvedCaseId }, { caseId }] }
        : { caseId: resolvedCaseId || caseId };

      const contracts = await prisma.contractGeneration.findMany({
        where: whereClause,
        orderBy: { generatedAt: 'desc' }
      });

      if (contracts.length === 0) {
        return { success: false, error: 'No contracts found for this case' };
      }

      const zip = new JSZip();
      const includedFiles: string[] = [];

      for (const contract of contracts) {
        if (fs.existsSync(contract.filePath)) {
          const fileContent = fs.readFileSync(contract.filePath);
          zip.file(contract.fileName, fileContent);
          includedFiles.push(contract.fileName);
        }
      }

      if (includedFiles.length === 0) {
        return { success: false, error: 'No contract files found on disk' };
      }

      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
      const caseRef = resolvedCaseId || caseId;
      const timestamp = new Date().toISOString().split('T')[0];
      const zipFileName = `case_${caseRef}_documents_${timestamp}.zip`;

      return {
        success: true,
        zipBuffer,
        fileName: zipFileName,
        includedFiles
      };
    } catch (error) {
      console.error('Download case bundle error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export default new ContractsService();
