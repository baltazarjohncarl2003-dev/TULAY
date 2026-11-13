"use client";

import Link from "next/link";
import "./globals.css";
import { Button, buttonVariants } from "@/components/ui/button";

// Replaces the root layout, so it must render its own html and body.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-full flex-col">
        <main id="main" className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-4 px-4 py-16 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            Please try again. If it keeps happening, contact TULAY support.
          </p>
          {error.digest && <p className="text-xs text-muted-foreground">Reference: {error.digest}</p>}
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => reset()}>Try again</Button>
            <Link href="/" className={buttonVariants()}>
              Go home
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
