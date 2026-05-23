import { redirect } from "next/navigation";

type GenerateAssemblyPageProps = {
  params: Promise<{ caseId: string }>;
};

export default async function GenerateAssemblyPage({ params }: GenerateAssemblyPageProps) {
  const { caseId } = await params;
  redirect(`/documents/compare?caseId=${encodeURIComponent(caseId)}`);
}
