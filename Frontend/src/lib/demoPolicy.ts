export const DEMO_WARNING = "DEMO ADAT – nem jogi forrásból származó tartalom";

export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_ADMINICULUM_DEMO_MODE === "true";
}
