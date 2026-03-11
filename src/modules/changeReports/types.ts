export type ChangeImpact = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ChangeEntry {
  sectionKey: string;
  beforeSnippet: string;
  afterSnippet: string;
  tags: string[];
  impact: ChangeImpact;
}

export interface GenerateChangeReportInput {
  documentId: string;
  fromVersionInt: number;
  toVersionInt: number;
  createdById: string;
}

export interface StoredChangeReport {
  id: string;
  documentId: string;
  fromVersionInt: number;
  toVersionInt: number;
  summaryMarkdown: string;
  changesJson: ChangeEntry[];
  redFlags: string[];
  createdById: string;
  createdAt: Date;
}

