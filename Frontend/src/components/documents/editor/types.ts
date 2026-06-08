import type { ReactNode } from "react";
export type {
  EditorReviewMutationResult,
  EditorReviewRange,
  EditorReviewSuggestion,
  EditorReviewSuggestionStatus,
  EditorReviewSuggestionType,
} from "./reviewModel";

export type DocumentEditorMode = "plain-text" | "rich-text-ready";

export type DocumentEditorValue =
  | {
      mode: "plain-text";
      text: string;
      version?: number;
    }
  | {
      mode: "rich-text-ready";
      text?: string;
      document: unknown;
      version?: number;
    };

export type DocumentEditorSelection = {
  id?: string;
  mode: DocumentEditorMode;
  text: string;
  from: number | string;
  to: number | string;
  blockId?: string;
  path?: Array<string | number>;
};

export type DocumentEditorChange = {
  id: string;
  type: "insert" | "delete" | "replace" | "format" | "comment" | "metadata";
  selection?: DocumentEditorSelection;
  before?: DocumentEditorValue;
  after?: DocumentEditorValue;
  createdAt: string;
  authorLabel?: string;
};

export type DocumentReviewMarkAnchor = {
  id: string;
  selection: DocumentEditorSelection;
  quote?: string;
  markType: "highlight" | "comment" | "insertion" | "deletion" | "replacement";
  status?: "pending" | "accepted" | "rejected" | "resolved";
};

export type DocumentEditorAdapterProps = {
  mode: DocumentEditorMode;
  value: DocumentEditorValue;
  readOnly?: boolean;
  placeholder?: string;
  selection?: DocumentEditorSelection | null;
  anchors?: DocumentReviewMarkAnchor[];
  onChange?: (change: DocumentEditorChange) => void;
  onSelectionChange?: (selection: DocumentEditorSelection | null) => void;
  toolbarSlot?: ReactNode;
};
