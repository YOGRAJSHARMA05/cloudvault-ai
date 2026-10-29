import Link from "next/link";
import type { ReactNode } from "react";
import { Container } from "@/components/ui/Container";

const navigation = [
  { href: "/dashboard", label: "Files" },
  { href: "/search", label: "AI search" },
  { href: "/chat", label: "AI chat" },
  { href: "/share", label: "Shared links" },
  { href: "/analytics", label: "Analytics" },
  { href: "/trash", label: "Trash" },
  { href: "/settings", label: "Settings" },
];

export function WorkspaceShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#080d18] text-white">
      <header className="sticky top-0 z-30 border-b border-white/7 bg-[#080d18]/90 backdrop-blur-xl">
        <Container className="flex min-h-[68px] flex-wrap items-center justify-between gap-3 py-3">
          <Link aria-label="CloudVault AI dashboard" className="flex items-center gap-2.5" href="/dashboard">
            <span className="flex size-9 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-blue-300">
              <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24">
                <path d="M7.5 18.5h9.25a4.25 4.25 0 0 0 .55-8.464A5.75 5.75 0 0 0 6.28 9.12 4.75 4.75 0 0 0 7.5 18.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
              </svg>
            </span>
            <span className="text-sm font-semibold tracking-tight">CloudVault <span className="text-blue-300">AI</span></span>
          </Link>
          <nav aria-label="Workspace" className="flex flex-wrap items-center gap-1 text-sm">
            {navigation.map((item) => (
              <Link
                className="rounded-lg px-2.5 py-2 text-xs text-slate-400 transition hover:bg-white/5 hover:text-white sm:text-sm"
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </Container>
      </header>

      <main className="pb-16 pt-8">
        <Container>
          <div className="max-w-3xl">
            <p className="text-sm text-slate-500">CloudVault AI workspace</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
          </div>
          <div className="mt-8">{children}</div>
        </Container>
      </main>
    </div>
  );
}
