"use client";

import { Button } from "@/components/ui/button";

// Keeps the admin shell (nav, header) on screen when a page fails to load.
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 py-16 text-center">
      <h1 className="text-title tracking-tight">This page could not load</h1>
      <p className="text-sm text-muted-foreground">Check your connection and try again. If it keeps happening, tell a super admin.</p>
      {error.digest && <p className="text-xs text-muted-foreground">Reference: {error.digest}</p>}
      <Button onClick={() => reset()}>Try again</Button>
    </div>
  );
}
