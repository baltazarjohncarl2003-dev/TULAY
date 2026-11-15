"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// Keeps the site header and footer visible when a public page throws (the root boundary would drop them).
export default function PublicError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // TODO: report to Sentry once it is wired.
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        Please try again. If it keeps happening, <Link href="/contact" className="text-primary underline">contact support</Link>.
      </p>
      {error.digest && <p className="text-xs text-muted-foreground">Reference: {error.digest}</p>}
      <Button onClick={() => reset()}>Try again</Button>
    </main>
  );
}
