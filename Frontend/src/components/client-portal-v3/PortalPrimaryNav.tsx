import Link from "next/link";
import { ORG_NAV_VIEW_BY_PATH, ORG_PRIMARY_NAV } from "./navigation";

const itemClass =
  "inline-flex h-10 items-center border-b-2 px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 motion-reduce:transition-none";

/**
 * ORGANIZATION desktop primary navigation. Exactly the seven canonical primary
 * destinations from the navigation module; utilities never appear here.
 * No pill treatment: the active destination carries the green underline and
 * primary text color instead of a route-local bubble.
 */
export function PortalPrimaryNav({ view }: { view: string }) {
  return (
    <nav
      aria-label="Ügyfélportál fő navigáció"
      data-testid="org-portal-primary-nav"
      className="hidden lg:flex lg:items-center lg:gap-1"
    >
      {ORG_PRIMARY_NAV.map((item) => {
        const active = ORG_NAV_VIEW_BY_PATH[item.href] === view;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`${itemClass} ${
              active
                ? "border-[var(--adm-brand-green)] font-semibold text-[var(--adm-text-primary)]"
                : "border-transparent font-medium text-[var(--adm-text-secondary)] hover:border-[var(--adm-border-canonical)] hover:text-[var(--adm-text-primary)]"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
