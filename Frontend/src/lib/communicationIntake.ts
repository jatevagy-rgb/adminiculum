// Communication intake foundation (OI1A).
//
// Frontend/shared-code only. This module defines the future Outlook/Microsoft Graph
// communication-intake domain model plus PURE matching helpers. It performs NO Graph
// calls, NO mailbox access, NO backend mutation. It only shapes/derives signals from
// data the app already loads (the existing communications console). Classification is
// always a SUGGESTION for a human to confirm — never an automatic legal conclusion and
// never an automatic case attachment.

export type CommunicationDirection = "incoming" | "outgoing";
export type CommunicationAudience = "internal" | "external";
export type CommunicationSource = "outlook" | "manual" | "system";
export type CommunicationClassificationStatus =
  | "unclassified"
  | "suggested"
  | "confirmed"
  | "ignored";

export type CommunicationSignalType =
  | "client_message"
  | "internal_note"
  | "opposing_party"
  | "authority_or_court"
  | "deadline_signal"
  | "document_signal"
  | "reply_needed"
  | "handoff_note";

export interface CommunicationSignal {
  id: string;
  source: CommunicationSource;
  audience: CommunicationAudience;
  direction: CommunicationDirection;
  signalType: CommunicationSignalType;
  subject: string;
  senderName?: string;
  senderEmail?: string;
  senderDomain?: string;
  receivedAt?: string;
  preview?: string;
  proposedClientId?: string;
  proposedClientName?: string;
  proposedCaseId?: string;
  proposedCaseTitle?: string;
  classificationStatus: CommunicationClassificationStatus;
  requiresReview: boolean;
  hasAttachments?: boolean;
  replyNeeded?: boolean;
}

export type ClientMatchConfidence = "exact" | "domain" | "weak" | "none";

export interface ClientMatchSuggestion {
  clientId?: string;
  clientName?: string;
  confidence: ClientMatchConfidence;
  reason: string;
}

// Transparent heuristic for the internal/external split. This is a foundation heuristic
// only — NOT an authoritative directory lookup. A later Graph-backed phase replaces it
// with real tenant/directory data.
export const INTERNAL_EMAIL_DOMAINS = [
  "balintfy.onmicrosoft.com",
  "balintfy.hu",
  "trugly.eu",
] as const;

export function normalizeEmail(email?: string | null): string {
  return String(email || "").trim().toLowerCase();
}

export function extractEmailDomain(email?: string | null): string {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at < 0) return "";
  return normalized.slice(at + 1);
}

export function isInternalDomain(domain?: string | null): boolean {
  const d = String(domain || "").trim().toLowerCase();
  if (!d) return false;
  return INTERNAL_EMAIL_DOMAINS.some((internal) => d === internal || d.endsWith(`.${internal}`));
}

export interface ClientMatchInput {
  id?: string;
  name?: string | null;
  email?: string | null;
  contactEmail?: string | null;
  /** Optional known sender domains/aliases for a client (populated in a later phase). */
  domains?: string[];
}

/**
 * Propose a client for a sender email. Pure, no external calls. Suggestion only —
 * the caller (lawyer) approves/corrects/ignores. Never auto-attaches to a case.
 */
export function matchSenderToClient(
  senderEmail: string | undefined | null,
  clients: ClientMatchInput[],
): ClientMatchSuggestion {
  const email = normalizeEmail(senderEmail);
  if (!email) return { confidence: "none", reason: "Nincs feladó e-mail cím." };
  const domain = extractEmailDomain(email);

  // 1. Exact contact-email match.
  for (const client of clients) {
    const candidates = [normalizeEmail(client.email), normalizeEmail(client.contactEmail)].filter(Boolean);
    if (candidates.includes(email)) {
      return {
        clientId: client.id,
        clientName: client.name ?? undefined,
        confidence: "exact",
        reason: "A feladó címe egyezik az ügyfél kapcsolattartói e-mail címével.",
      };
    }
  }

  // 2. Domain match (firm-internal domains are never treated as a client domain).
  if (domain && !isInternalDomain(domain)) {
    for (const client of clients) {
      const clientDomains = [
        extractEmailDomain(client.email),
        extractEmailDomain(client.contactEmail),
        ...(client.domains || []).map((d) => d.trim().toLowerCase()),
      ].filter(Boolean);
      if (clientDomains.includes(domain)) {
        return {
          clientId: client.id,
          clientName: client.name ?? undefined,
          confidence: "domain",
          reason: `A feladó domainje (${domain}) egyezik egy ismert ügyfél domainjével.`,
        };
      }
    }
    // 3. External domain with no client match — candidate for manual mapping.
    return {
      confidence: "weak",
      reason: `Külső domain (${domain}), de nincs ismert ügyfél-egyezés. Kézi besorolás javasolt.`,
    };
  }

  return { confidence: "none", reason: "Belső vagy nem azonosítható domain — nincs ügyfél-javaslat." };
}

/** Minimal shape of an existing communications-console record (no Graph fields). */
export interface CommunicationRecordLike {
  id: string;
  type?: string | null;
  subject?: string | null;
  senderName?: string | null;
  senderEmail?: string | null;
  recipientEmail?: string | null;
  summary?: string | null;
  caseId?: string | null;
  clientId?: string | null;
  createdAt?: string | null;
  case?: { id: string; caseNumber: string; title: string } | null;
  client?: { id: string; name: string } | null;
  attachmentCount?: number;
}

/** Transparent internal/external classification of an existing communication record. */
export function classifyAudience(record: CommunicationRecordLike): CommunicationAudience {
  if ((record.type || "").toUpperCase() === "NOTE") return "internal";
  const senderDomain = extractEmailDomain(record.senderEmail);
  const recipientDomain = extractEmailDomain(record.recipientEmail);
  const hasExternalParty =
    (!!senderDomain && !isInternalDomain(senderDomain)) ||
    (!!recipientDomain && !isInternalDomain(recipientDomain));
  if (record.clientId || record.client || hasExternalParty) return "external";
  return "internal";
}

/**
 * Map an existing communications-console record into a foundation CommunicationSignal.
 * Uses only data the app already loaded; `preview` is the summary, never the raw body.
 */
export function toCommunicationSignal(record: CommunicationRecordLike): CommunicationSignal {
  const audience = classifyAudience(record);
  const senderDomain = extractEmailDomain(record.senderEmail);
  const isNote = (record.type || "").toUpperCase() === "NOTE";
  const direction: CommunicationDirection = isInternalDomain(senderDomain) ? "outgoing" : "incoming";
  const signalType: CommunicationSignalType = isNote
    ? "internal_note"
    : audience === "external"
      ? "client_message"
      : "internal_note";

  return {
    id: record.id,
    source: "manual", // current console communications are manually logged, not yet Outlook-sourced
    audience,
    direction,
    signalType,
    subject: record.subject || "(nincs tárgy)",
    senderName: record.senderName || undefined,
    senderEmail: record.senderEmail || undefined,
    senderDomain: senderDomain || undefined,
    receivedAt: record.createdAt || undefined,
    preview: record.summary || undefined, // summary only — never raw email body by default
    proposedClientId: record.clientId || record.client?.id || undefined,
    proposedClientName: record.client?.name || undefined,
    proposedCaseId: record.caseId || record.case?.id || undefined,
    proposedCaseTitle: record.case?.title || undefined,
    classificationStatus: record.clientId || record.caseId ? "confirmed" : "unclassified",
    requiresReview: !record.clientId && !record.caseId,
    hasAttachments: (record.attachmentCount || 0) > 0,
    replyNeeded: undefined, // no reliable reply-needed signal until Graph intake exists
  };
}
