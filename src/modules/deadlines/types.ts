export type DeadlineRuleSet = 'PP' | 'AKR' | 'BE' | 'UNKNOWN';
export type DeadlineStatus = 'OPEN' | 'DONE';

export interface ExtractDeadlinesInput {
  caseId: string;
  documentId: string;
  servedAt?: string;
}

export interface ExtractedDeadlineCandidate {
  extractedPhrase: string;
  durationDays: number;
  businessDays: boolean;
  confidence: number;
  ruleSet: DeadlineRuleSet;
}

export interface DeadlineRecord {
  id: string;
  caseId: string;
  documentId: string;
  extractedPhrase: string;
  triggerDate: Date;
  durationDays: number;
  businessDays: boolean;
  dueDate: Date;
  ruleSet: DeadlineRuleSet;
  confidence: number;
  status: DeadlineStatus;
  createdAt: Date;
}

