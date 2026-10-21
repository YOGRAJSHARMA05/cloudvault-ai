import type { InputHTMLAttributes } from "react";

type AuthFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

export function AuthField({ id, label, error, ...inputProps }: AuthFieldProps) {
  const errorId = `${id}-error`;

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-200" htmlFor={id}>
        {label}
      </label>
      <input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        className="min-h-12 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-400/70 focus:ring-4 focus:ring-blue-500/10 aria-invalid:border-rose-400/60"
        id={id}
        {...inputProps}
      />
      {error ? (
        <p className="text-xs text-rose-300" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}