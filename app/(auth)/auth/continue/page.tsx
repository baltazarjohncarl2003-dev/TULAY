import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

export const metadata = { title: "Continue", robots: { index: false } };

type Search = { searchParams: Promise<{ token_hash?: string; type?: string }> };

// Landing page for the links in the confirm-email and reset-password emails. Nothing happens until the person
// clicks: mail scanners open links with GET and would otherwise use up the one-time token.
export default function ContinuePage({ searchParams }: Search) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-8 md:py-12">
      <Suspense fallback={null}>
        <ContinueCard searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function ContinueCard({ searchParams }: Search) {
  const { token_hash: tokenHash = "", type = "" } = await searchParams;
  const reset = type === "recovery";
  return (
    <Card>
      <CardHeader className="gap-2">
        <h1 className="text-title tracking-tight">{reset ? "Reset your password." : "Confirm your email."}</h1>
        <CardDescription>
          {reset ? "Continue to choose a new password." : "One click and your TULAY account is ready."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form method="post" action="/auth/confirm" className="flex flex-col gap-4">
          <input type="hidden" name="token_hash" value={tokenHash} />
          <input type="hidden" name="type" value={type} />
          <Button type="submit" className="w-full">
            {reset ? "Continue" : "Confirm my email"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
