import type { ComplianceCenterOverview, OfficeClientRow, OfficeReviewWorkItem } from "@/lib/complianceCenterApi";

export function portfolioAttention(overview: ComplianceCenterOverview): Array<{
  client: OfficeClientRow;
  work: OfficeReviewWorkItem[];
  attentionCount: number;
}> {
  return overview.clients
    .map((client) => {
      const work = overview.reviewWork.filter((item) => item.clientId === client.clientId);
      return { client, work, attentionCount: work.length };
    })
    .filter((row) => row.attentionCount > 0)
    .sort((a, b) => b.attentionCount - a.attentionCount || a.client.clientName.localeCompare(b.client.clientName, "hu"));
}
