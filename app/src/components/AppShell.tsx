"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const NAV = [
  { href: "/", label: "Content", icon: "✎" },
  { href: "/episodes", label: "Episodes", icon: "❖" },
  { href: "/lessons", label: "Voice", icon: "♪" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen">
      <aside
        className="w-56 shrink-0 border-r flex flex-col"
        style={{ background: "var(--sidebar)", borderColor: "var(--sidebar-border)" }}
      >
        <div className="px-5 py-6">
          <Link href="/" className="block group">
            <div className="text-sm font-semibold tracking-tight text-[var(--foreground)]">
              content<span className="text-[var(--accent)]">/</span>shipping
            </div>
            <div className="text-[10px] uppercase tracking-widest text-[var(--muted)] mt-0.5">
              drafts in your voice
            </div>
          </Link>
        </div>

        <nav className="px-3 flex-1">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors mb-0.5"
                style={{
                  background: active ? "var(--accent-soft)" : "transparent",
                  color: active ? "var(--accent)" : "var(--foreground)",
                  fontWeight: active ? 550 : 400,
                }}
              >
                <span className="text-xs opacity-70 w-4 text-center">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-5 py-4 border-t text-[11px] text-[var(--muted)] leading-relaxed"
          style={{ borderColor: "var(--sidebar-border)" }}
        >
          pi drafts → you edit → pi learns.
          <br />
          <span className="font-mono">cfs</span> pushes from the terminal.
        </div>
      </aside>

      <div className="flex-1 min-w-0 overflow-x-hidden">{children}</div>
    </div>
  );
}
