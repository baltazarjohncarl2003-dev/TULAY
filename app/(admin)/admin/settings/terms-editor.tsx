"use client";

import { useState } from "react";
import { z } from "zod";
import { useServerAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { RETURN_CLASS_LABEL } from "@/lib/agreements";
import { updateTerms } from "@/lib/actions/admin";
import type { TermsRow } from "@/lib/data/admin";
import { dateTime } from "@/lib/format";

const ORDER: TermsRow["returnClass"][] = ["standard", "custom", "final_sale"];

/** Browser check for instant feedback only. updateTerms validates again on the server. */
const termsInputSchema = z.object({
  returnClass: z.enum(["standard", "custom", "final_sale"]),
  body: z.string().trim().min(1, "Required").max(5000),
});

export function TermsEditor({ terms, canEdit }: { terms: TermsRow[]; canEdit: boolean }) {
  const sorted = [...terms].sort((a, b) => ORDER.indexOf(a.returnClass) - ORDER.indexOf(b.returnClass));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Agreement terms</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <p className="text-xs text-muted-foreground">
          Shown to buyer and supplier when they confirm a chat deal. Each agreement keeps the version it was confirmed
          with, so editing here never changes agreed deals. Drafts: pending legal review.
        </p>
        {sorted.map((t) => (
          <TermsForm key={t.returnClass} terms={t} canEdit={canEdit} />
        ))}
      </CardContent>
    </Card>
  );
}

function TermsForm({ terms, canEdit }: { terms: TermsRow; canEdit: boolean }) {
  const { returnClass, version, body, updatedAt } = terms;
  const title = RETURN_CLASS_LABEL[returnClass];
  const [text, setText] = useState(body);
  const { run, pending } = useServerAction();
  const valid = termsInputSchema.safeParse({ returnClass, body: text }).success;
  const changed = text !== body;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground">
          Version {version} · updated {dateTime(updatedAt)}
        </p>
      </div>
      <Textarea
        aria-label={`${title} terms`}
        rows={10}
        maxLength={5000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        readOnly={!canEdit}
      />
      <p className="text-right text-xs text-muted-foreground">{text.length} / 5000</p>
      {canEdit && (
        <div>
          <Button
            disabled={pending || !changed || !valid}
            onClick={() => run(() => updateTerms({ returnClass, body: text }), "Terms saved")}
          >
            Save
          </Button>
        </div>
      )}
    </section>
  );
}
