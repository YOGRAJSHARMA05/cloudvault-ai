import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonBaseProps = {
  children: ReactNode;
  className?: string;
  variant?: ButtonVariant;
};

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> &
  ButtonBaseProps & {
    href?: string;
    target?: string;
    rel?: string;
  };

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-blue-500 text-white shadow-lg shadow-blue-950/30 hover:bg-blue-400 focus-visible:outline-blue-300",
  secondary:
    "border border-white/15 bg-white/5 text-white hover:border-white/25 hover:bg-white/10 focus-visible:outline-white/50",
  ghost:
    "text-slate-300 hover:bg-white/5 hover:text-white focus-visible:outline-white/50",
};

const baseClasses =
  "inline-flex min-h-11 items-center justify-center rounded-2xl px-5 py-2.5 text-sm font-semibold transition duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50";

export function Button(props: ButtonProps) {
  const {
    children,
    className,
    variant = "primary",
    href,
    target,
    rel,
    ...buttonProps
  } = props;
  const classes = cn(baseClasses, variantClasses[variant], className);

  if (href) {
    return (
      <Link
        className={classes}
        href={href}
        rel={rel}
        target={target}
      >
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} type="button" {...buttonProps}>
      {children}
    </button>
  );
}