"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mic, ListMusic } from "lucide-react";

const TABS = [
  { href: "/", label: "Record", icon: Mic },
  { href: "/recordings", label: "Recordings", icon: ListMusic },
];

/**
 * Fixed bottom tab bar — thumb-reachable on a phone, and equally fine on
 * desktop. A recording's detail page counts as part of the Recordings tab.
 */
export default function TabBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-page pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-3xl">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith("/recordings");
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-1 py-3 text-[11px] font-medium tracking-wide uppercase transition ${
                active ? "text-ink" : "text-ink/40"
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
              {label}
              {/* Active state is shown by weight plus this bar, never by colour. */}
              <span
                className={`mt-0.5 h-0.5 w-6 rounded-full ${active ? "bg-ink" : "bg-transparent"}`}
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
