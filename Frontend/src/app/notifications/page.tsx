import { redirect } from "next/navigation";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function NotificationsRedirect({ searchParams }: { searchParams: SearchParams }) {
  const resolvedParams = await searchParams;
  const params = new URLSearchParams();
  if (resolvedParams?.view) {
    params.set("view", resolvedParams.view as string);
  }
  if (resolvedParams?.communicationId) {
    params.set("communicationId", resolvedParams.communicationId as string);
  }
  
  const queryString = params.toString();
  const url = queryString ? `/communications?${queryString}` : "/communications";
  
  redirect(url);
}
