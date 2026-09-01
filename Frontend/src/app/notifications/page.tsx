import { redirect } from "next/navigation";

type LegacyNotificationsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const supportedQueryKeys = ["view", "communicationId", "clientId", "caseId"] as const;

export default async function LegacyNotificationsPage({ searchParams }: LegacyNotificationsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const query = new URLSearchParams();
  for (const key of supportedQueryKeys) {
    const value = resolvedSearchParams[key];
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item));
    } else if (value) {
      query.set(key, value);
    }
  }

  redirect(query.toString() ? `/communications?${query.toString()}` : "/communications");
}
