import Link from "next/link";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type LogoProps = Omit<HTMLAttributes<HTMLAnchorElement>, "children"> & {
  compact?: boolean;
};

export function Logo({ compact = false, className, ...props }: LogoProps) {
  return (
    <Link
      aria-label="CloudVault AI home"
      className={cn("inline-flex items-center gap-3", className)}
      href="/"
      {...props}
    >
      <span className="flex size-10 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-500/10 text-blue-300">
        <svg
          aria-hidden="true"
          className="size-6"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            d="M7.5 18.5h9.25a4.25 4.25 0 0 0 .55-8.464A5.75 5.75 0 0 0 6.28 9.12 4.75 4.75 0 0 0 7.5 18.5Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
          <path
            d="M9.5 14.25h5m-5 0 1.75-1.75M9.5 14.25 11.25 16"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
        </svg>
      </span>
      {!compact && (
        <span className="text-base font-semibold tracking-tight text-white">
          CloudVault <span className="text-blue-300">AI</span>
        </span>
      )}
    </Link>
  );
}