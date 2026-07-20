import { getClientAccentClass } from "@/lib/clientColors";

export function ClientAccent({
  colorKey,
  className = "",
}: {
  colorKey?: string | null;
  className?: string;
}) {
  return <span aria-hidden="true" className={`${getClientAccentClass(colorKey)} ${className}`} />;
}
