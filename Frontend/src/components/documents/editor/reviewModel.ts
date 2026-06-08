export type EditorReviewSuggestionType = "comment" | "replacement" | "deletion";

export type EditorReviewSuggestionStatus = "pending" | "accepted" | "rejected";

export type EditorReviewRange = {
  from: number;
  to: number;
};

export type EditorReviewMutationResult = {
  requestId: number;
  ok: boolean;
  error?: string;
};

export type EditorReviewSuggestion = {
  id: string;
  createdAt: string;
  type: EditorReviewSuggestionType;
  status: EditorReviewSuggestionStatus;
  selectedTextPreview: string;
  range: EditorReviewRange;
  replacementText?: string;
  helperText?: string;
  pendingMutationRequestId?: number;
};

type CreateReviewSuggestionInput = {
  id: string;
  createdAt: string;
  type: EditorReviewSuggestionType;
  selectedText: string;
  range: EditorReviewRange;
  replacementText?: string;
  previewLength?: number;
};

export function createReviewSuggestion({
  id,
  createdAt,
  type,
  selectedText,
  range,
  replacementText,
  previewLength = 180,
}: CreateReviewSuggestionInput): EditorReviewSuggestion {
  const normalizedSelectedText = selectedText.trim();
  const selectedTextPreview =
    normalizedSelectedText.length > previewLength
      ? `${normalizedSelectedText.slice(0, previewLength)}…`
      : normalizedSelectedText;

  return {
    id,
    createdAt,
    type,
    status: "pending",
    selectedTextPreview,
    range,
    ...(type === "replacement" && replacementText?.trim() ? { replacementText: replacementText.trim() } : {}),
  };
}

export function markSuggestionAccepted(
  suggestion: EditorReviewSuggestion,
  helperText?: string,
): EditorReviewSuggestion {
  return {
    ...suggestion,
    status: "accepted",
    helperText,
    pendingMutationRequestId: undefined,
  };
}

export function markSuggestionRejected(
  suggestion: EditorReviewSuggestion,
  helperText?: string,
): EditorReviewSuggestion {
  return {
    ...suggestion,
    status: "rejected",
    helperText,
    pendingMutationRequestId: undefined,
  };
}

export function markSuggestionHelperText(
  suggestion: EditorReviewSuggestion,
  helperText?: string,
  pendingMutationRequestId?: number,
): EditorReviewSuggestion {
  return {
    ...suggestion,
    helperText,
    pendingMutationRequestId,
  };
}
