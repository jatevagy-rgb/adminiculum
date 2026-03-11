export type ClassifiedCategory =
  | 'CONTRACT'
  | 'COURT_DOCUMENT'
  | 'CORRESPONDENCE'
  | 'INVOICE'
  | 'OTHER';

export interface DocumentClassificationRecord {
  id: string;
  documentId: string;
  category: ClassifiedCategory;
  tags: string[];
  confidence: number;
  createdAt: Date;
}

export interface ClassificationDecision {
  category: ClassifiedCategory;
  tags: string[];
  confidence: number;
}

