"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

type Errors = Record<string, string[] | undefined>;

/** FormData -> plain object; repeated names (checkbox groups) become arrays. */
function formToObject(fd: FormData) {
  const raw: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) raw[k] = k in raw ? ([] as unknown[]).concat(raw[k], v) : v;
  return raw;
}

/**
 * Validates in the browser for instant feedback, then sends the raw fields to a Server Action,
 * which validates again and saves. Refreshes the page data on success.
 */
export function useServerForm<S extends z.ZodType>(
  schema: S,
  action: (raw: Record<string, unknown>) => Promise<ActionResult>,
  successMessage: string,
  onDone?: () => void,
) {
  const router = useRouter();
  const [errors, setErrors] = useState<Errors>({});
  const [pending, startTransition] = useTransition();
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = formToObject(new FormData(e.currentTarget));
    const result = schema.safeParse(raw);
    if (!result.success) {
      setErrors(z.flattenError(result.error).fieldErrors as Errors);
      toast.error("Please fix the highlighted fields.");
      return;
    }
    startTransition(async () => {
      const res: ActionResult | undefined = await action(raw);
      if (!res) return; // the action redirected
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      setErrors({});
      toast.success(successMessage);
      onDone?.();
      router.refresh();
    });
  }
  return { errors, onSubmit, pending };
}

/** Runs a Server Action from a button (approve, suspend...) with toasts and a pending flag. */
export function useServerAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function run(action: () => Promise<ActionResult>, successMessage: string, onDone?: () => void) {
    startTransition(async () => {
      const res: ActionResult | undefined = await action();
      if (!res) return; // the action redirected
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(successMessage);
      onDone?.();
      router.refresh();
    });
  }
  return { run, pending };
}

/**
 * Validates a form with Zod and shows a demo toast. No data is sent anywhere yet.
 * shortcut: no persistence; swap onValid for a Server Action call when the backend lands.
 */
export function useDemoForm<S extends z.ZodType>(
  schema: S,
  successMessage: string,
  onValid?: (data: z.output<S>) => void,
) {
  const [errors, setErrors] = useState<Errors>({});
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = formToObject(new FormData(e.currentTarget));
    const result = schema.safeParse(raw);
    if (!result.success) {
      setErrors(z.flattenError(result.error).fieldErrors as Errors);
      toast.error("Please fix the highlighted fields.");
      return;
    }
    setErrors({});
    onValid?.(result.data);
    toast.success(successMessage, { description: "Demo mode: not saved yet." });
  }
  return { errors, onSubmit };
}

/** Shows a demo toast for buttons (approve, decline, ...) that will call the server later. */
export function demoAction(message: string) {
  toast.success(message, { description: "Demo mode: not saved yet." });
}

export function Field({
  label,
  name,
  errors,
  hint,
  className,
  children,
}: {
  label: string;
  name: string;
  errors?: Errors;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const err = errors?.[name]?.[0];
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={name}>{label}</Label>
      {children}
      {hint && !err && <p className="text-xs text-muted-foreground">{hint}</p>}
      {err && (
        <p className="text-xs text-destructive" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}

/** Native select styled like shadcn inputs (accessible, works on mobile). */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30",
        className,
      )}
      {...props}
    />
  );
}
