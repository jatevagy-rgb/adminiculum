import { redirect } from "next/navigation";

type GeneratePageProps = {
  params: Promise<{ caseId: string }>;
};

export default async function GeneratePage({ params }: GeneratePageProps) {
  const { caseId } = await params;
  redirect(`/documents/compare?caseId=${encodeURIComponent(caseId)}`);
}
