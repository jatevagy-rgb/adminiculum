import { randomUUID } from 'crypto';
import { prisma } from '../../prisma/prisma.service';
import {
  AlignmentType,
  BorderStyle,
  Document as DocxDocument,
  HeadingLevel,
  Packer,
  Paragraph,
  Table as DocxTable,
  TableCell as DocxTableCell,
  TableRow as DocxTableRow,
  TextRun,
  WidthType,
} from 'docx';

export type TimesheetTemplateFamily = 'HU_DETAILED_MONTHLY' | 'CORPORATE_SUMMARY';

export type TimesheetTemplateFieldType = 'text' | 'month' | 'number' | 'boolean' | 'textarea';

export interface TimesheetTemplateField {
  key: string;
  label: string;
  type: TimesheetTemplateFieldType;
  required: boolean;
  description?: string;
}

export interface TimesheetReportTemplate {
  id: string;
  name: string;
  family: TimesheetTemplateFamily;
  language: 'hu' | 'en';
  style: 'DETAILED' | 'SUMMARY';
  isActive: boolean;
  headerFields: TimesheetTemplateField[];
  rowFields: TimesheetTemplateField[];
  footerFields: TimesheetTemplateField[];
}

export interface TimesheetReportRowInput {
  date?: string;
  taskDate?: string;
  description: string;
  lawyer: string;
  hours: number;
}

export interface GenerateTimesheetReportInput {
  templateId: string;
  reportPeriod: string;
  clientName: string;
  matterName?: string;
  caseReference?: string;
  monthlyClosure?: string;
  carriedHours?: number;
  overtimeHours?: number;
  aboveThresholdHours?: number;
  pendingOpenMattersNote?: string;
  rows: TimesheetReportRowInput[];
}

export interface AutofillTimesheetRowsInput {
  reportPeriod: string;
  clientId?: string;
  matterId?: string;
  caseId?: string;
  lawyerId?: string;
  lawyerName?: string;
  billableOnly?: boolean;
}

export interface TimesheetReportPreset {
  id: string;
  name: string;
  templateId: string;
  templateFamily?: TimesheetTemplateFamily;
  layer?: 'TEMPLATE_DEFAULT' | 'LAWYER_DEFAULT' | 'CLIENT_DEFAULT' | 'CLIENT_LAWYER_OVERRIDE';
  lawyerId?: string;
  lawyerName?: string;
  clientId?: string;
  clientName?: string;
  isActive?: boolean;
  defaults: {
    monthlyClosure?: string;
    pendingOpenMattersNote?: string;
    lawyerName?: string;
    clientClosingText?: string;
  };
  resolution?: {
    appliedLayers: string[];
    fieldSources: {
      monthlyClosure?: string;
      pendingOpenMattersNote?: string;
      lawyerName?: string;
      clientClosingText?: string;
    };
  };
}

export interface UpsertTimesheetPresetInput {
  name: string;
  templateFamily: TimesheetTemplateFamily;
  layer: 'TEMPLATE_DEFAULT' | 'LAWYER_DEFAULT' | 'CLIENT_DEFAULT' | 'CLIENT_LAWYER_OVERRIDE';
  lawyerId?: string;
  lawyerName?: string;
  clientId?: string;
  clientName?: string;
  monthlyClosure?: string;
  pendingOpenMattersNote?: string;
  clientClosingText?: string;
  defaultLawyerName?: string;
  isActive?: boolean;
}

export interface GeneratedTimesheetReportPayload {
  reportId: string;
  generatedAt: string;
  template: {
    id: string;
    name: string;
    family: TimesheetTemplateFamily;
    language: 'hu' | 'en';
    style: 'DETAILED' | 'SUMMARY';
  };
  header: {
    reportPeriod: string;
    clientName: string;
    matterName: string | null;
    caseReference: string | null;
  };
  rows: Array<{
    rowNumber: number;
    date: string | null;
    description: string;
    lawyer: string;
    hours: number;
  }>;
  totals: {
    rowCount: number;
    totalHours: number;
    carriedHours: number;
    overtimeHours: number;
    aboveThresholdHours: number;
    finalHours: number;
  };
  footer: {
    monthlyClosure: string | null;
    pendingOpenMattersNote: string | null;
  };
  exportPayload: {
    payloadType: 'TIMESHEET_REPORT_V1';
    templateFamily: TimesheetTemplateFamily;
    language: 'hu' | 'en';
    reportPeriod: string;
    clientName: string;
    rows: Array<{
      rowNumber: number;
      date: string | null;
      description: string;
      lawyer: string;
      hours: number;
    }>;
    totals: {
      totalHours: number;
      finalHours: number;
    };
  };
}

export type TimesheetReportInstanceStatus = 'DRAFT' | 'GENERATED';

export interface SaveTimesheetReportInstanceInput {
  templateId: string;
  reportPeriod: string;
  clientId?: string;
  clientName?: string;
  matterId?: string;
  matterName?: string;
  caseId?: string;
  caseReference?: string;
  presetId?: string;
  monthlyClosure?: string;
  pendingOpenMattersNote?: string;
  clientClosingText?: string;
  defaultLawyerName?: string;
  carriedHours?: number;
  overtimeHours?: number;
  aboveThresholdHours?: number;
  rows: TimesheetReportRowInput[];
  status?: TimesheetReportInstanceStatus;
}

export interface TimesheetReportInstancePayload {
  id: string;
  templateId: string;
  templateFamily: TimesheetTemplateFamily;
  reportPeriod: string;
  clientId: string | null;
  clientName: string | null;
  matterId: string | null;
  matterName: string | null;
  caseId: string | null;
  caseReference: string | null;
  presetId: string | null;
  monthlyClosure: string | null;
  pendingOpenMattersNote: string | null;
  clientClosingText: string | null;
  defaultLawyerName: string | null;
  carriedHours: number;
  overtimeHours: number;
  aboveThresholdHours: number;
  rows: TimesheetReportRowInput[];
  totalsSnapshot: {
    rowCount: number;
    totalHours: number;
    carriedHours: number;
    overtimeHours: number;
    aboveThresholdHours: number;
    finalHours: number;
  };
  status: TimesheetReportInstanceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TimesheetReportArtifactPayload {
  id: string;
  reportInstanceId: string;
  format: 'TEXT_V1' | 'DOCX_V1';
  mimeType: string;
  fileName: string;
  content?: string;
  contentBase64?: string;
  createdAt: string;
}

const TEMPLATES: TimesheetReportTemplate[] = [
  {
    id: 'timesheet-hu-detailed-monthly-v1',
    name: 'Munkaóra-kimutatás — részletes havi (HU) v1',
    family: 'HU_DETAILED_MONTHLY',
    language: 'hu',
    style: 'DETAILED',
    isActive: true,
    headerFields: [
      { key: 'reportPeriod', label: 'Elszámolási időszak', type: 'month', required: true },
      { key: 'clientName', label: 'Ügyfél', type: 'text', required: true },
      { key: 'matterName', label: 'Ügytípus / Matter', type: 'text', required: false },
      { key: 'caseReference', label: 'Ügyazonosító', type: 'text', required: false },
    ],
    rowFields: [
      { key: 'date', label: 'Dátum', type: 'text', required: false },
      { key: 'description', label: 'Elvégzett jogi munka leírása', type: 'textarea', required: true },
      { key: 'lawyer', label: 'Jogász', type: 'text', required: true },
      { key: 'hours', label: 'Munkaóra', type: 'number', required: true },
    ],
    footerFields: [
      { key: 'monthlyClosure', label: 'Havi záradék', type: 'textarea', required: false },
      { key: 'carriedHours', label: 'Áthozott óra', type: 'number', required: false },
      { key: 'overtimeHours', label: 'Túlóra', type: 'number', required: false },
      { key: 'aboveThresholdHours', label: 'Küszöb feletti óra', type: 'number', required: false },
    ],
  },
  {
    id: 'timesheet-corporate-summary-v1',
    name: 'Work-hour report — corporate summary v1',
    family: 'CORPORATE_SUMMARY',
    language: 'en',
    style: 'SUMMARY',
    isActive: true,
    headerFields: [
      { key: 'reportPeriod', label: 'Reporting period', type: 'month', required: true },
      { key: 'clientName', label: 'Client', type: 'text', required: true },
      { key: 'matterName', label: 'Matter reference', type: 'text', required: false },
      { key: 'caseReference', label: 'Case reference', type: 'text', required: false },
    ],
    rowFields: [
      { key: 'taskDate', label: 'Date', type: 'text', required: false },
      { key: 'description', label: 'Work description', type: 'textarea', required: true },
      { key: 'lawyer', label: 'Lawyer', type: 'text', required: true },
      { key: 'hours', label: 'Hours', type: 'number', required: true },
    ],
    footerFields: [
      { key: 'pendingOpenMattersNote', label: 'Pending/open matters note', type: 'textarea', required: false },
    ],
  },
];

const TEMPLATE_DEFAULT_PRESETS: TimesheetReportPreset[] = [
  {
    id: 'preset-hu-office-default-v1',
    name: 'HU Office Default v1',
    templateId: 'timesheet-hu-detailed-monthly-v1',
    defaults: {
      monthlyClosure:
        'A kimutatás a tárgyhónapban elvégzett jogi munkavégzést összesíti, belső ellenőrzésre előkészítve.',
      clientClosingText: 'Köszönjük az együttműködést, a riportot jóváhagyás után véglegesítjük.',
    },
  },
  {
    id: 'preset-corporate-summary-default-v1',
    name: 'Corporate Summary Default v1',
    templateId: 'timesheet-corporate-summary-v1',
    defaults: {
      pendingOpenMattersNote:
        'Open items are tracked separately and reflected in next-period operational follow-up.',
      clientClosingText: 'Please review and confirm if any activity requires additional detail.',
    },
  },
];

class TimesheetReportService {
  private isRepoUnavailableError(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    return (
      message.includes('timesheet') ||
      message.includes('unknown field') ||
      message.includes('unknown arg') ||
      message.includes('does not exist') ||
      message.includes('does not contain a definition')
    );
  }

  private getInstanceRepo(): any {
    return (prisma as any).timesheetReportInstance;
  }

  private getArtifactRepo(): any {
    return (prisma as any).timesheetReportArtifact;
  }

  private getPresetRepo(): any {
    return (prisma as any).timesheetPreset;
  }

  private hasInstanceRepo(): boolean {
    return Boolean(this.getInstanceRepo());
  }

  private hasArtifactRepo(): boolean {
    return Boolean(this.getArtifactRepo());
  }

  private hasPresetRepo(): boolean {
    return Boolean(this.getPresetRepo());
  }

  private requireRepo(flag: boolean, feature: string): void {
    if (!flag) {
      throw new Error(`${feature} is not available in the current environment.`);
    }
  }

  private templateIdToFamily(templateId: string | undefined): TimesheetTemplateFamily | undefined {
    if (!templateId) return undefined;
    const template = this.getTemplate(templateId);
    return template?.family;
  }

  private templateFamilyToTemplateId(templateFamily: TimesheetTemplateFamily): string {
    const match = TEMPLATES.find((template) => template.family === templateFamily && template.isActive);
    return match?.id || TEMPLATES[0].id;
  }

  private toPresetPayload(record: any): TimesheetReportPreset {
    return {
      id: record.id,
      name: record.name,
      templateId: this.templateFamilyToTemplateId(record.templateFamily as TimesheetTemplateFamily),
      templateFamily: record.templateFamily as TimesheetTemplateFamily,
      layer: record.layer,
      lawyerId: record.lawyerId || undefined,
      lawyerName: record.lawyerName || undefined,
      clientId: record.clientId || undefined,
      clientName: record.clientName || undefined,
      isActive: Boolean(record.isActive),
      defaults: {
        monthlyClosure: record.monthlyClosure || undefined,
        pendingOpenMattersNote: record.pendingOpenMattersNote || undefined,
        lawyerName: record.defaultLawyerName || record.lawyerName || undefined,
        clientClosingText: record.clientClosingText || undefined,
      },
    };
  }

  private normalize(value?: string | null): string {
    return String(value || '').trim().toLocaleLowerCase();
  }

  private toArtifactPayload(record: any): TimesheetReportArtifactPayload {
    return {
      id: record.id,
      reportInstanceId: record.reportInstanceId,
      format: record.format,
      mimeType: record.mimeType,
      fileName: record.fileName,
      content: record.contentText || undefined,
      contentBase64: record.contentBase64 || undefined,
      createdAt: record.createdAt.toISOString(),
    };
  }

  async listArtifacts(instanceId: string, limit = 30): Promise<TimesheetReportArtifactPayload[]> {
    if (!this.hasArtifactRepo()) {
      return [];
    }
    try {
      const items = await this.getArtifactRepo().findMany({
        where: { reportInstanceId: instanceId },
        orderBy: { createdAt: 'desc' },
        take: Math.max(1, Math.min(limit, 200)),
      });
      return items.map((item: any) => this.toArtifactPayload(item));
    } catch (error) {
      if (this.isRepoUnavailableError(error)) {
        return [];
      }
      throw error;
    }
  }

  async getArtifact(instanceId: string, artifactId: string): Promise<TimesheetReportArtifactPayload | null> {
    if (!this.hasArtifactRepo()) {
      return null;
    }
    try {
      const item = await this.getArtifactRepo().findFirst({
        where: {
          id: artifactId,
          reportInstanceId: instanceId,
        },
      });
      return item ? this.toArtifactPayload(item) : null;
    } catch (error) {
      if (this.isRepoUnavailableError(error)) {
        return null;
      }
      throw error;
    }
  }

  private toInstancePayload(record: any): TimesheetReportInstancePayload {
    const rowsRaw = Array.isArray(record.rows) ? record.rows : [];
    const rows: TimesheetReportRowInput[] = rowsRaw.map((row: any) => ({
      date: row?.date ? String(row.date) : undefined,
      taskDate: row?.taskDate ? String(row.taskDate) : undefined,
      description: String(row?.description || ''),
      lawyer: String(row?.lawyer || ''),
      hours: Number(row?.hours || 0),
    }));

    const totals = (record.totalsSnapshot || {}) as Record<string, any>;

    return {
      id: record.id,
      templateId: record.templateId,
      templateFamily: record.templateFamily as TimesheetTemplateFamily,
      reportPeriod: record.reportPeriod,
      clientId: record.clientId || null,
      clientName: record.clientName || null,
      matterId: record.matterId || null,
      matterName: record.matterName || null,
      caseId: record.caseId || null,
      caseReference: record.caseReference || null,
      presetId: record.presetId || null,
      monthlyClosure: record.monthlyClosure || null,
      pendingOpenMattersNote: record.pendingOpenMattersNote || null,
      clientClosingText: record.clientClosingText || null,
      defaultLawyerName: record.defaultLawyerName || null,
      carriedHours: Number(record.carriedHours || 0),
      overtimeHours: Number(record.overtimeHours || 0),
      aboveThresholdHours: Number(record.aboveThresholdHours || 0),
      rows,
      totalsSnapshot: {
        rowCount: Number(totals.rowCount || rows.length),
        totalHours: Number(totals.totalHours || 0),
        carriedHours: Number(totals.carriedHours || record.carriedHours || 0),
        overtimeHours: Number(totals.overtimeHours || record.overtimeHours || 0),
        aboveThresholdHours: Number(totals.aboveThresholdHours || record.aboveThresholdHours || 0),
        finalHours: Number(totals.finalHours || 0),
      },
      status: record.status as TimesheetReportInstanceStatus,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private toGenerateInputFromInstance(instance: TimesheetReportInstancePayload): GenerateTimesheetReportInput {
    return {
      templateId: instance.templateId,
      reportPeriod: instance.reportPeriod,
      clientName: instance.clientName || '',
      matterName: instance.matterName || undefined,
      caseReference: instance.caseReference || undefined,
      monthlyClosure: instance.monthlyClosure || undefined,
      pendingOpenMattersNote: [instance.pendingOpenMattersNote || '', instance.clientClosingText || '']
        .filter(Boolean)
        .join('\n') || undefined,
      carriedHours: instance.carriedHours,
      overtimeHours: instance.overtimeHours,
      aboveThresholdHours: instance.aboveThresholdHours,
      rows: instance.rows,
    };
  }

  async listInstances(limit = 30): Promise<TimesheetReportInstancePayload[]> {
    if (!this.hasInstanceRepo()) {
      return [];
    }
    try {
      const items = await this.getInstanceRepo().findMany({
        orderBy: { updatedAt: 'desc' },
        take: Math.max(1, Math.min(limit, 200)),
      });
      return items.map((item) => this.toInstancePayload(item));
    } catch (error) {
      if (this.isRepoUnavailableError(error)) {
        return [];
      }
      throw error;
    }
  }

  async getInstance(id: string): Promise<TimesheetReportInstancePayload | null> {
    if (!this.hasInstanceRepo()) {
      return null;
    }
    try {
      const item = await this.getInstanceRepo().findUnique({ where: { id } });
      return item ? this.toInstancePayload(item) : null;
    } catch (error) {
      if (this.isRepoUnavailableError(error)) {
        return null;
      }
      throw error;
    }
  }

  async createInstance(input: SaveTimesheetReportInstanceInput): Promise<TimesheetReportInstancePayload> {
    this.requireRepo(this.hasInstanceRepo(), 'Timesheet report instances');
    const generated = this.generate({
      templateId: input.templateId,
      reportPeriod: input.reportPeriod,
      clientName: input.clientName || '',
      matterName: input.matterName,
      caseReference: input.caseReference,
      monthlyClosure: input.monthlyClosure,
      pendingOpenMattersNote: [input.pendingOpenMattersNote || '', input.clientClosingText || '']
        .filter(Boolean)
        .join('\n') || undefined,
      carriedHours: input.carriedHours,
      overtimeHours: input.overtimeHours,
      aboveThresholdHours: input.aboveThresholdHours,
      rows: input.rows,
    });

    const created = await this.getInstanceRepo().create({
      data: {
        templateId: input.templateId,
        templateFamily: generated.template.family,
        reportPeriod: input.reportPeriod,
        clientId: input.clientId || null,
        clientName: input.clientName || null,
        matterId: input.matterId || null,
        matterName: input.matterName || null,
        caseId: input.caseId || null,
        caseReference: input.caseReference || null,
        presetId: input.presetId || null,
        monthlyClosure: input.monthlyClosure || null,
        pendingOpenMattersNote: input.pendingOpenMattersNote || null,
        clientClosingText: input.clientClosingText || null,
        defaultLawyerName: input.defaultLawyerName || null,
        carriedHours: Number(input.carriedHours || 0),
        overtimeHours: Number(input.overtimeHours || 0),
        aboveThresholdHours: Number(input.aboveThresholdHours || 0),
        rows: generated.rows as any,
        totalsSnapshot: generated.totals as any,
        status: input.status || 'DRAFT',
      },
    });

    return this.toInstancePayload(created);
  }

  async updateInstance(id: string, input: SaveTimesheetReportInstanceInput): Promise<TimesheetReportInstancePayload | null> {
    this.requireRepo(this.hasInstanceRepo(), 'Timesheet report instances');
    const existing = await this.getInstanceRepo().findUnique({ where: { id } });
    if (!existing) return null;

    const generated = this.generate({
      templateId: input.templateId,
      reportPeriod: input.reportPeriod,
      clientName: input.clientName || '',
      matterName: input.matterName,
      caseReference: input.caseReference,
      monthlyClosure: input.monthlyClosure,
      pendingOpenMattersNote: [input.pendingOpenMattersNote || '', input.clientClosingText || '']
        .filter(Boolean)
        .join('\n') || undefined,
      carriedHours: input.carriedHours,
      overtimeHours: input.overtimeHours,
      aboveThresholdHours: input.aboveThresholdHours,
      rows: input.rows,
    });

    const updated = await this.getInstanceRepo().update({
      where: { id },
      data: {
        templateId: input.templateId,
        templateFamily: generated.template.family,
        reportPeriod: input.reportPeriod,
        clientId: input.clientId || null,
        clientName: input.clientName || null,
        matterId: input.matterId || null,
        matterName: input.matterName || null,
        caseId: input.caseId || null,
        caseReference: input.caseReference || null,
        presetId: input.presetId || null,
        monthlyClosure: input.monthlyClosure || null,
        pendingOpenMattersNote: input.pendingOpenMattersNote || null,
        clientClosingText: input.clientClosingText || null,
        defaultLawyerName: input.defaultLawyerName || null,
        carriedHours: Number(input.carriedHours || 0),
        overtimeHours: Number(input.overtimeHours || 0),
        aboveThresholdHours: Number(input.aboveThresholdHours || 0),
        rows: generated.rows as any,
        totalsSnapshot: generated.totals as any,
        status: input.status || existing.status,
      },
    });

    return this.toInstancePayload(updated);
  }

  async renderInstance(id: string): Promise<(GeneratedTimesheetReportPayload & {
    renderedOutput: {
      fileName: string;
      mimeType: 'text/plain';
      format: 'TEXT_V1';
      content: string;
    };
  }) | null> {
    this.requireRepo(this.hasArtifactRepo(), 'Timesheet report artifacts');
    const instance = await this.getInstance(id);
    if (!instance) return null;
    const rendered = this.render(this.toGenerateInputFromInstance(instance));

    await this.getArtifactRepo().create({
      data: {
        reportInstanceId: id,
        format: rendered.renderedOutput.format,
        mimeType: rendered.renderedOutput.mimeType,
        fileName: rendered.renderedOutput.fileName,
        contentText: rendered.renderedOutput.content,
        contentBase64: null,
      },
    });

    return rendered;
  }

  async renderDocxInstance(id: string): Promise<(GeneratedTimesheetReportPayload & {
    renderedOutput: {
      fileName: string;
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      format: 'DOCX_V1';
      contentBase64: string;
    };
  }) | null> {
    this.requireRepo(this.hasArtifactRepo(), 'Timesheet report artifacts');
    const instance = await this.getInstance(id);
    if (!instance) return null;
    const rendered = await this.renderDocx(this.toGenerateInputFromInstance(instance));

    await this.getArtifactRepo().create({
      data: {
        reportInstanceId: id,
        format: rendered.renderedOutput.format,
        mimeType: rendered.renderedOutput.mimeType,
        fileName: rendered.renderedOutput.fileName,
        contentText: null,
        contentBase64: rendered.renderedOutput.contentBase64,
      },
    });

    return rendered;
  }

  listTemplates(): TimesheetReportTemplate[] {
    return TEMPLATES.filter((template) => template.isActive);
  }

  getTemplate(templateId: string): TimesheetReportTemplate | undefined {
    return TEMPLATES.find((template) => template.id === templateId && template.isActive);
  }

  async listPresets(): Promise<TimesheetReportPreset[]> {
    if (!this.hasPresetRepo()) {
      return TEMPLATE_DEFAULT_PRESETS.map((preset) => ({
        ...preset,
        templateFamily: this.templateIdToFamily(preset.templateId),
        layer: 'TEMPLATE_DEFAULT' as const,
        isActive: true,
      }));
    }
    let records: any[] = [];
    try {
      records = await this.getPresetRepo().findMany({
        where: { isActive: true },
        orderBy: [{ layer: 'asc' }, { updatedAt: 'desc' }],
      });
    } catch (error) {
      if (!this.isRepoUnavailableError(error)) {
        throw error;
      }
      records = [];
    }

    const dbPresets = records.map((record: any) => this.toPresetPayload(record));
    const byFamily = new Set(dbPresets.filter((preset) => preset.layer === 'TEMPLATE_DEFAULT').map((preset) => preset.templateFamily));

    const fallbackTemplateDefaults = TEMPLATE_DEFAULT_PRESETS.filter(
      (preset) => !byFamily.has(this.templateIdToFamily(preset.templateId))
    ).map((preset) => ({
      ...preset,
      templateFamily: this.templateIdToFamily(preset.templateId),
      layer: 'TEMPLATE_DEFAULT' as const,
      isActive: true,
    }));

    return [...fallbackTemplateDefaults, ...dbPresets];
  }

  async getPreset(id: string): Promise<TimesheetReportPreset | null> {
    let record: any = null;
    if (this.hasPresetRepo()) {
      try {
        record = await this.getPresetRepo().findUnique({ where: { id } });
      } catch (error) {
        if (!this.isRepoUnavailableError(error)) {
          throw error;
        }
      }
    }
    if (!record) {
      const fallback = TEMPLATE_DEFAULT_PRESETS.find((preset) => preset.id === id);
      return fallback
        ? {
            ...fallback,
            templateFamily: this.templateIdToFamily(fallback.templateId),
            layer: 'TEMPLATE_DEFAULT',
            isActive: true,
          }
        : null;
    }
    return this.toPresetPayload(record);
  }

  async createPreset(input: UpsertTimesheetPresetInput): Promise<TimesheetReportPreset> {
    this.requireRepo(this.hasPresetRepo(), 'Timesheet presets');
    const created = await this.getPresetRepo().create({
      data: {
        name: input.name,
        templateFamily: input.templateFamily,
        layer: input.layer,
        lawyerId: input.lawyerId || null,
        lawyerName: input.lawyerName || null,
        clientId: input.clientId || null,
        clientName: input.clientName || null,
        monthlyClosure: input.monthlyClosure || null,
        pendingOpenMattersNote: input.pendingOpenMattersNote || null,
        clientClosingText: input.clientClosingText || null,
        defaultLawyerName: input.defaultLawyerName || null,
        isActive: input.isActive ?? true,
      },
    });
    return this.toPresetPayload(created);
  }

  async updatePreset(id: string, input: Partial<UpsertTimesheetPresetInput>): Promise<TimesheetReportPreset | null> {
    this.requireRepo(this.hasPresetRepo(), 'Timesheet presets');
    const existing = await this.getPresetRepo().findUnique({ where: { id } });
    if (!existing) return null;

    const updated = await this.getPresetRepo().update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.templateFamily !== undefined ? { templateFamily: input.templateFamily } : {}),
        ...(input.layer !== undefined ? { layer: input.layer } : {}),
        ...(input.lawyerId !== undefined ? { lawyerId: input.lawyerId || null } : {}),
        ...(input.lawyerName !== undefined ? { lawyerName: input.lawyerName || null } : {}),
        ...(input.clientId !== undefined ? { clientId: input.clientId || null } : {}),
        ...(input.clientName !== undefined ? { clientName: input.clientName || null } : {}),
        ...(input.monthlyClosure !== undefined ? { monthlyClosure: input.monthlyClosure || null } : {}),
        ...(input.pendingOpenMattersNote !== undefined
          ? { pendingOpenMattersNote: input.pendingOpenMattersNote || null }
          : {}),
        ...(input.clientClosingText !== undefined ? { clientClosingText: input.clientClosingText || null } : {}),
        ...(input.defaultLawyerName !== undefined ? { defaultLawyerName: input.defaultLawyerName || null } : {}),
        ...(input.isActive !== undefined ? { isActive: Boolean(input.isActive) } : {}),
      },
    });

    return this.toPresetPayload(updated);
  }

  async deactivatePreset(id: string): Promise<TimesheetReportPreset | null> {
    return this.updatePreset(id, { isActive: false });
  }

  async resolvePreset(input: {
    presetId?: string;
    templateId?: string;
    clientId?: string;
    clientName?: string;
    lawyerId?: string;
    lawyerName?: string;
  }): Promise<TimesheetReportPreset> {
    const templateFamily = this.templateIdToFamily(input.templateId) || 'HU_DETAILED_MONTHLY';
    const templateId = this.templateFamilyToTemplateId(templateFamily);

    let dbPresets: TimesheetReportPreset[] = [];
    if (this.hasPresetRepo()) {
      try {
        const records = await this.getPresetRepo().findMany({
          where: {
            isActive: true,
            templateFamily,
          },
          orderBy: [{ updatedAt: 'desc' }],
        });
        dbPresets = records.map((record: any) => this.toPresetPayload(record));
      } catch (error) {
        if (!this.isRepoUnavailableError(error)) {
          throw error;
        }
      }
    }

    const selected = input.presetId
      ? dbPresets.find((preset) => preset.id === input.presetId) || TEMPLATE_DEFAULT_PRESETS.find((preset) => preset.id === input.presetId)
      : undefined;

    const templateDefaultFromDb = dbPresets.find((preset) => preset.layer === 'TEMPLATE_DEFAULT');
    const templateDefaultFallback = TEMPLATE_DEFAULT_PRESETS.find((preset) => preset.templateId === templateId) || TEMPLATE_DEFAULT_PRESETS[0];
    const base =
      (selected?.layer === 'TEMPLATE_DEFAULT' ? selected : undefined) ||
      templateDefaultFromDb ||
      {
        ...templateDefaultFallback,
        templateFamily,
        layer: 'TEMPLATE_DEFAULT' as const,
        isActive: true,
      };

    const normalizedLawyerName = input.lawyerName?.trim();
    const normalizedClientName = input.clientName?.trim();

    const lawyerPreset = dbPresets.find((preset) => {
      if (preset.layer !== 'LAWYER_DEFAULT') return false;
      if (input.lawyerId && preset.lawyerId && preset.lawyerId === input.lawyerId) return true;
      if (normalizedLawyerName) {
        const candidate = preset.defaults.lawyerName || preset.lawyerName || undefined;
        return this.normalize(candidate) === this.normalize(normalizedLawyerName);
      }
      return false;
    });

    const clientPreset = dbPresets.find((preset) => {
      if (preset.layer !== 'CLIENT_DEFAULT') return false;
      if (input.clientId && preset.clientId && preset.clientId === input.clientId) return true;
      if (normalizedClientName) {
        const candidate = preset.clientName || undefined;
        return this.normalize(candidate) === this.normalize(normalizedClientName);
      }
      return false;
    });

    const clientLawyerPreset = dbPresets.find((preset) => {
      if (preset.layer !== 'CLIENT_LAWYER_OVERRIDE') return false;
      const clientMatches = input.clientId ? preset.clientId === input.clientId : Boolean(normalizedClientName);
      const lawyerMatches = input.lawyerId
        ? preset.lawyerId === input.lawyerId
        : Boolean(normalizedLawyerName && this.normalize(preset.defaults.lawyerName) === this.normalize(normalizedLawyerName));
      return Boolean(clientMatches && lawyerMatches);
    });

    const resolvedDefaults: TimesheetReportPreset['defaults'] = {
      ...base.defaults,
    };

    const fieldSources: NonNullable<TimesheetReportPreset['resolution']>['fieldSources'] = {
      ...(base.defaults.monthlyClosure ? { monthlyClosure: 'template_defaults' } : {}),
      ...(base.defaults.pendingOpenMattersNote ? { pendingOpenMattersNote: 'template_defaults' } : {}),
      ...(base.defaults.lawyerName ? { lawyerName: 'template_defaults' } : {}),
      ...(base.defaults.clientClosingText ? { clientClosingText: 'template_defaults' } : {}),
    };

    const appliedLayers = ['template_defaults'];

    const applyLayer = (
      layerName: 'lawyer_defaults' | 'client_defaults' | 'client_lawyer_overrides',
      patch: Partial<TimesheetReportPreset['defaults']>
    ) => {
      let touched = false;
      if (patch.monthlyClosure && patch.monthlyClosure.trim()) {
        resolvedDefaults.monthlyClosure = patch.monthlyClosure.trim();
        fieldSources.monthlyClosure = layerName;
        touched = true;
      }
      if (patch.pendingOpenMattersNote && patch.pendingOpenMattersNote.trim()) {
        resolvedDefaults.pendingOpenMattersNote = patch.pendingOpenMattersNote.trim();
        fieldSources.pendingOpenMattersNote = layerName;
        touched = true;
      }
      if (patch.lawyerName && patch.lawyerName.trim()) {
        resolvedDefaults.lawyerName = patch.lawyerName.trim();
        fieldSources.lawyerName = layerName;
        touched = true;
      }
      if (patch.clientClosingText && patch.clientClosingText.trim()) {
        resolvedDefaults.clientClosingText = patch.clientClosingText.trim();
        fieldSources.clientClosingText = layerName;
        touched = true;
      }
      if (touched) {
        appliedLayers.push(layerName);
      }
    };

    if (lawyerPreset) {
      applyLayer('lawyer_defaults', lawyerPreset.defaults);
    } else if (normalizedLawyerName) {
      applyLayer('lawyer_defaults', { lawyerName: normalizedLawyerName });
    }

    if (clientPreset) {
      applyLayer('client_defaults', clientPreset.defaults);
    } else if (normalizedClientName || input.clientId) {
      const clientDisplay = normalizedClientName || 'ügyfél';
      applyLayer('client_defaults', {
        clientClosingText: `A riport a(z) ${clientDisplay} részére készült egyeztetési összesítő.`,
      });
    }

    if (clientLawyerPreset) {
      applyLayer('client_lawyer_overrides', clientLawyerPreset.defaults);
    } else if ((normalizedClientName || input.clientId) && normalizedLawyerName) {
      const clientDisplay = normalizedClientName || 'ügyfél';
      applyLayer('client_lawyer_overrides', {
        clientClosingText: `A riport a(z) ${clientDisplay} részére készült, kapcsolattartó jogász: ${normalizedLawyerName}.`,
      });
    }

    return {
      ...base,
      templateId,
      templateFamily,
      defaults: resolvedDefaults,
      resolution: {
        appliedLayers,
        fieldSources,
      },
    };
  }

  async autofillRows(input: AutofillTimesheetRowsInput): Promise<{
    filters: {
      reportPeriod: string;
      startDate: string;
      endDateExclusive: string;
      clientId: string | null;
      matterId: string | null;
      caseId: string | null;
      lawyerId: string | null;
      lawyerName: string | null;
      billableOnly: boolean;
    };
    rows: TimesheetReportRowInput[];
    sourceCount: number;
  }> {
    if (!/^\d{4}-\d{2}$/.test(input.reportPeriod)) {
      throw new Error('reportPeriod must be YYYY-MM format');
    }

    const [yearRaw, monthRaw] = input.reportPeriod.split('-');
    const year = Number(yearRaw);
    const month = Number(monthRaw);

    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const endDateExclusive = new Date(Date.UTC(year, month, 1, 0, 0, 0));

    const where: any = {
      workDate: {
        gte: startDate,
        lt: endDateExclusive,
      },
      ...(input.billableOnly ? { billable: true } : {}),
      ...(input.matterId ? { matterId: input.matterId } : {}),
      ...(input.lawyerId ? { userId: input.lawyerId } : {}),
      matter: {
        ...(input.clientId ? { clientId: input.clientId } : {}),
        ...(input.caseId
          ? {
              cases: {
                some: { id: input.caseId },
              },
            }
          : {}),
      },
    };

    const normalizedLawyerName = input.lawyerName?.trim();

    const entries = await prisma.timeEntry.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ workDate: 'asc' }, { createdAt: 'asc' }],
    });

    const nameFiltered = normalizedLawyerName
      ? entries.filter((entry) =>
          String(entry.user?.name || '')
            .toLocaleLowerCase()
            .includes(normalizedLawyerName.toLocaleLowerCase())
        )
      : entries;

    const rows: TimesheetReportRowInput[] = nameFiltered.map((entry) => ({
      date: entry.workDate.toISOString().slice(0, 10),
      description: entry.description,
      lawyer: entry.user?.name || normalizedLawyerName || 'N/A',
      hours: Number((entry.minutes / 60).toFixed(2)),
    }));

    return {
      filters: {
        reportPeriod: input.reportPeriod,
        startDate: startDate.toISOString(),
        endDateExclusive: endDateExclusive.toISOString(),
        clientId: input.clientId || null,
        matterId: input.matterId || null,
        caseId: input.caseId || null,
        lawyerId: input.lawyerId || null,
        lawyerName: normalizedLawyerName || null,
        billableOnly: Boolean(input.billableOnly),
      },
      rows,
      sourceCount: nameFiltered.length,
    };
  }

  private formatHuHours(value: number): string {
    return `${Number(value.toFixed(2)).toLocaleString('hu-HU')} óra`;
  }

  private formatEnHours(value: number): string {
    return `${Number(value.toFixed(2)).toLocaleString('en-US')} h`;
  }

  private buildHuDetailedMonthlyText(report: GeneratedTimesheetReportPayload): string {
    const header = [
      'MUNKAÓRA-KIMUTATÁS',
      `Időszak: ${report.header.reportPeriod}`,
      `Ügyfél: ${report.header.clientName}`,
      `Matter: ${report.header.matterName || '—'}`,
      `Ügy hivatkozás: ${report.header.caseReference || '—'}`,
      '',
      'RÉSZLETES SOROK',
      'Ssz | Dátum | Jogász | Óra | Leírás',
      '----|-------|--------|-----|-------',
    ];

    const rows = report.rows.map((row) => {
      return `${row.rowNumber} | ${row.date || '—'} | ${row.lawyer} | ${Number(row.hours.toFixed(2)).toLocaleString('hu-HU')} | ${row.description}`;
    });

    const totals = [
      '',
      'ÖSSZESÍTÉS',
      `Sorok száma: ${report.totals.rowCount}`,
      `Tárgyhavi órák: ${this.formatHuHours(report.totals.totalHours)}`,
      `Áthozott órák: ${this.formatHuHours(report.totals.carriedHours)}`,
      `Túlórák: ${this.formatHuHours(report.totals.overtimeHours)}`,
      `Küszöb feletti órák: ${this.formatHuHours(report.totals.aboveThresholdHours)}`,
      `Végső elszámolt órák: ${this.formatHuHours(report.totals.finalHours)}`,
      '',
      `Havi záradék: ${report.footer.monthlyClosure || '—'}`,
    ];

    return [...header, ...rows, ...totals].join('\n');
  }

  private buildCorporateSummaryText(report: GeneratedTimesheetReportPayload): string {
    const header = [
      'WORK-HOUR REPORT (CORPORATE SUMMARY)',
      `Period: ${report.header.reportPeriod}`,
      `Client: ${report.header.clientName}`,
      `Matter: ${report.header.matterName || 'N/A'}`,
      `Case reference: ${report.header.caseReference || 'N/A'}`,
      '',
      'WORK ITEMS',
      'No. | Date | Lawyer | Hours | Description',
      '----|------|--------|-------|------------',
    ];

    const rows = report.rows.map((row) => {
      return `${row.rowNumber} | ${row.date || 'N/A'} | ${row.lawyer} | ${Number(row.hours.toFixed(2)).toLocaleString('en-US')} | ${row.description}`;
    });

    const totals = [
      '',
      'SUMMARY TOTALS',
      `Items: ${report.totals.rowCount}`,
      `Total worked hours: ${this.formatEnHours(report.totals.totalHours)}`,
      `Carried hours: ${this.formatEnHours(report.totals.carriedHours)}`,
      `Overtime hours: ${this.formatEnHours(report.totals.overtimeHours)}`,
      `Above-threshold hours: ${this.formatEnHours(report.totals.aboveThresholdHours)}`,
      `Final billed hours: ${this.formatEnHours(report.totals.finalHours)}`,
      '',
      `Pending/open matters note: ${report.footer.pendingOpenMattersNote || 'N/A'}`,
    ];

    return [...header, ...rows, ...totals].join('\n');
  }

  generate(input: GenerateTimesheetReportInput): GeneratedTimesheetReportPayload {
    const template = this.getTemplate(input.templateId);
    if (!template) {
      throw new Error('Timesheet report template not found');
    }

    if (!input.reportPeriod || !input.clientName) {
      throw new Error('reportPeriod and clientName are required');
    }

    if (!Array.isArray(input.rows) || input.rows.length === 0) {
      throw new Error('At least one work row is required');
    }

    const normalizedRows = input.rows.map((row, index) => ({
      rowNumber: index + 1,
      date: row.date || row.taskDate || null,
      description: String(row.description || '').trim(),
      lawyer: String(row.lawyer || '').trim(),
      hours: Number(row.hours || 0),
    }));

    const invalidRow = normalizedRows.find((row) => !row.description || !row.lawyer || row.hours <= 0);
    if (invalidRow) {
      throw new Error('Each row must have description, lawyer, and hours > 0');
    }

    const totalHours = Number(normalizedRows.reduce((sum, row) => sum + row.hours, 0).toFixed(2));
    const carriedHours = Number(input.carriedHours || 0);
    const overtimeHours = Number(input.overtimeHours || 0);
    const aboveThresholdHours = Number(input.aboveThresholdHours || 0);

    const finalHours = Number((totalHours + carriedHours + overtimeHours + aboveThresholdHours).toFixed(2));

    return {
      reportId: randomUUID(),
      generatedAt: new Date().toISOString(),
      template: {
        id: template.id,
        name: template.name,
        family: template.family,
        language: template.language,
        style: template.style,
      },
      header: {
        reportPeriod: input.reportPeriod,
        clientName: input.clientName,
        matterName: input.matterName || null,
        caseReference: input.caseReference || null,
      },
      rows: normalizedRows,
      totals: {
        rowCount: normalizedRows.length,
        totalHours,
        carriedHours,
        overtimeHours,
        aboveThresholdHours,
        finalHours,
      },
      footer: {
        monthlyClosure: input.monthlyClosure || null,
        pendingOpenMattersNote: input.pendingOpenMattersNote || null,
      },
      exportPayload: {
        payloadType: 'TIMESHEET_REPORT_V1',
        templateFamily: template.family,
        language: template.language,
        reportPeriod: input.reportPeriod,
        clientName: input.clientName,
        rows: normalizedRows,
        totals: {
          totalHours,
          finalHours,
        },
      },
    };
  }

  render(input: GenerateTimesheetReportInput): GeneratedTimesheetReportPayload & {
    renderedOutput: {
      fileName: string;
      mimeType: 'text/plain';
      format: 'TEXT_V1';
      content: string;
    };
  } {
    const generated = this.generate(input);
    const content = generated.template.family === 'HU_DETAILED_MONTHLY'
      ? this.buildHuDetailedMonthlyText(generated)
      : this.buildCorporateSummaryText(generated);

    const periodSafe = generated.header.reportPeriod.replace(/[^0-9-]/g, '');
    const fileName = `${generated.template.family.toLowerCase()}_${periodSafe || 'period'}.txt`;

    return {
      ...generated,
      renderedOutput: {
        fileName,
        mimeType: 'text/plain',
        format: 'TEXT_V1',
        content,
      },
    };
  }

  private buildDocxCell(
    value: string,
    options?: {
      bold?: boolean;
      align?: 'left' | 'right' | 'center';
      backgroundColor?: string;
      color?: string;
      fontSize?: number;
    }
  ): DocxTableCell {
    const alignment = options?.align === 'right'
      ? AlignmentType.RIGHT
      : options?.align === 'center'
      ? AlignmentType.CENTER
      : AlignmentType.LEFT;

    return new DocxTableCell({
      children: [
        new Paragraph({
          alignment,
          spacing: { before: 40, after: 40 },
          children: [
            new TextRun({
              text: value || '—',
              bold: Boolean(options?.bold),
              color: options?.color || '1F2821',
              size: options?.fontSize || 21,
            }),
          ],
        }),
      ],
      shading: options?.backgroundColor
        ? {
            fill: options.backgroundColor,
          }
        : undefined,
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1, color: 'D9D2C3' },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: 'D9D2C3' },
        left: { style: BorderStyle.SINGLE, size: 1, color: 'D9D2C3' },
        right: { style: BorderStyle.SINGLE, size: 1, color: 'D9D2C3' },
      },
    });
  }

  private buildDocxMetadataTable(report: GeneratedTimesheetReportPayload, isHu: boolean): DocxTable {
    const rows: DocxTableRow[] = [
      [isHu ? 'Időszak' : 'Reporting period', report.header.reportPeriod],
      [isHu ? 'Ügyfél' : 'Client', report.header.clientName],
      [isHu ? 'Matter' : 'Matter', report.header.matterName || (isHu ? '—' : 'N/A')],
      [isHu ? 'Ügy hivatkozás' : 'Case reference', report.header.caseReference || (isHu ? '—' : 'N/A')],
    ].map(([label, value]) =>
      new DocxTableRow({
        children: [
          this.buildDocxCell(label, {
            bold: true,
            backgroundColor: 'F6F2E8',
            color: '514D45',
          }),
          this.buildDocxCell(value),
        ],
      })
    );

    return new DocxTable({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows,
    });
  }

  private buildDocxRowsTable(report: GeneratedTimesheetReportPayload): DocxTable {
    const isHu = report.template.family === 'HU_DETAILED_MONTHLY';
    const headerCells = isHu
      ? ['Ssz', 'Dátum', 'Leírás', 'Jogász', 'Óra']
      : ['No.', 'Date', 'Description', 'Lawyer', 'Hours'];

    const rows: DocxTableRow[] = [
      new DocxTableRow({
        children: headerCells.map((label) =>
          this.buildDocxCell(label, {
            bold: true,
            align: 'center',
            backgroundColor: 'ECE6DA',
            color: '514D45',
            fontSize: 20,
          })
        ),
      }),
      ...report.rows.map((row) =>
        new DocxTableRow({
          children: [
            this.buildDocxCell(String(row.rowNumber), { align: 'center' }),
            this.buildDocxCell(row.date || (isHu ? '—' : 'N/A')),
            this.buildDocxCell(row.description),
            this.buildDocxCell(row.lawyer),
            this.buildDocxCell(Number(row.hours.toFixed(2)).toLocaleString(isHu ? 'hu-HU' : 'en-US'), { align: 'right' }),
          ],
        })
      ),
    ];

    return new DocxTable({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows,
    });
  }

  private buildDocxTotalsTable(report: GeneratedTimesheetReportPayload, isHu: boolean): DocxTable {
    const rows: Array<[string, string, boolean?]> = [
      [isHu ? 'Sorok száma' : 'Items', String(report.totals.rowCount)],
      [
        isHu ? 'Tárgyhavi órák' : 'Total worked hours',
        Number(report.totals.totalHours.toFixed(2)).toLocaleString(isHu ? 'hu-HU' : 'en-US'),
      ],
      [
        isHu ? 'Áthozott órák' : 'Carried hours',
        Number(report.totals.carriedHours.toFixed(2)).toLocaleString(isHu ? 'hu-HU' : 'en-US'),
      ],
      [
        isHu ? 'Túlórák' : 'Overtime hours',
        Number(report.totals.overtimeHours.toFixed(2)).toLocaleString(isHu ? 'hu-HU' : 'en-US'),
      ],
      [
        isHu ? 'Küszöb feletti órák' : 'Above-threshold hours',
        Number(report.totals.aboveThresholdHours.toFixed(2)).toLocaleString(isHu ? 'hu-HU' : 'en-US'),
      ],
      [
        isHu ? 'Végső elszámolt órák' : 'Final billed hours',
        Number(report.totals.finalHours.toFixed(2)).toLocaleString(isHu ? 'hu-HU' : 'en-US'),
        true,
      ],
    ];

    return new DocxTable({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: rows.map(([label, value, isFinal]) =>
        new DocxTableRow({
          children: [
            this.buildDocxCell(label, {
              bold: Boolean(isFinal),
              backgroundColor: isFinal ? 'F0E6C9' : 'FBF9F3',
            }),
            this.buildDocxCell(value, {
              bold: Boolean(isFinal),
              align: 'right',
              backgroundColor: isFinal ? 'F0E6C9' : undefined,
            }),
          ],
        })
      ),
    });
  }

  private buildDocx(report: GeneratedTimesheetReportPayload): DocxDocument {
  
    const isHu = report.template.family === 'HU_DETAILED_MONTHLY';

    const closureLabel = isHu ? 'Havi záradék' : 'Pending/open matters note';
    const closureValue = isHu
      ? report.footer.monthlyClosure || '—'
      : report.footer.pendingOpenMattersNote || 'N/A';

    const title = isHu ? 'HAVI MUNKAÓRA-KIMUTATÁS' : 'WORK-HOUR SUMMARY REPORT';
    const subtitle = isHu ? 'Részletes havi jogi tevékenységi összesítő' : 'Client-facing monthly legal work summary';
    const rowsSectionLabel = isHu ? 'Részletes sorok' : 'Detailed work rows';
    const totalsLabel = isHu ? 'Összesítés' : 'Summary totals';

    return new DocxDocument({
      styles: {
        default: {
          document: {
            run: {
              font: 'Calibri',
              size: 21,
              color: '1F2821',
            },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 1100,
                right: 1000,
                bottom: 1000,
                left: 1000,
              },
            },
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 120 },
              children: [new TextRun({ text: title, bold: true, size: 34, color: '1F2821' })],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 220 },
              children: [new TextRun({ text: subtitle, italics: true, color: '7B776D', size: 20 })],
            }),
            this.buildDocxMetadataTable(report, isHu),
            new Paragraph({ text: '', spacing: { after: 80 } }),
            new Paragraph({ text: rowsSectionLabel, heading: HeadingLevel.HEADING_2, spacing: { before: 80, after: 120 } }),
            this.buildDocxRowsTable(report),
            new Paragraph({ text: '', spacing: { after: 80 } }),
            new Paragraph({ text: totalsLabel, heading: HeadingLevel.HEADING_2, spacing: { before: 80, after: 120 } }),
            this.buildDocxTotalsTable(report, isHu),
            new Paragraph({ text: '', spacing: { after: 100 } }),
            new Paragraph({ text: closureLabel, heading: HeadingLevel.HEADING_2, spacing: { before: 60, after: 80 } }),
            new Paragraph({
              spacing: { after: 220 },
              children: [
                new TextRun({
                  text: closureValue,
                  color: '514D45',
                }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: `${isHu ? 'Generálva' : 'Generated'}: ${report.generatedAt.slice(0, 19).replace('T', ' ')}`,
                  size: 18,
                  color: '7B776D',
                }),
              ],
            }),
          ],
        },
      ],
    });
  }

  async renderDocx(input: GenerateTimesheetReportInput): Promise<GeneratedTimesheetReportPayload & {
    renderedOutput: {
      fileName: string;
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      format: 'DOCX_V1';
      contentBase64: string;
    };
  }> {
    const generated = this.generate(input);
    const periodSafe = generated.header.reportPeriod.replace(/[^0-9-]/g, '');
    const fileName = `${generated.template.family.toLowerCase()}_${periodSafe || 'period'}.docx`;
    const document = this.buildDocx(generated);
    const buffer = await Packer.toBuffer(document);

    return {
      ...generated,
      renderedOutput: {
        fileName,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        format: 'DOCX_V1',
        contentBase64: buffer.toString('base64'),
      },
    };
  }
}

export const timesheetReportService = new TimesheetReportService();

