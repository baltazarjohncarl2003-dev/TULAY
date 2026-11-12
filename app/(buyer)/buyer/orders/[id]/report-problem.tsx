"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Field, useServerAction } from "@/components/form";
import { Notice } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import { openClaim } from "@/lib/actions/claims";
import { createClient } from "@/lib/supabase/client";
import type { Order } from "@/lib/types";

// Instant feedback only; openClaim and the database check the same rules again.
const DAY_MS = 24 * 60 * 60 * 1000;
const EVIDENCE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"] as const;
const EXTENSIONS: Record<(typeof EVIDENCE_TYPES)[number], string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_FILES = 10;

type Settings = { damageDays: number; returnDays: number; defectDays: number };

const KINDS = [
  { value: "damage", text: "Damaged, wrong or missing", days: "damageDays", note: "" },
  { value: "return", text: "Change of mind return", days: "returnDays", note: ", standard items only, you pay return shipping" },
  { value: "defect", text: "Print defect", days: "defectDays", note: ", custom items" },
] as const satisfies readonly { value: string; text: string; days: keyof Settings; note: string }[];

const evidenceFile = z.object({
  type: z.enum(EVIDENCE_TYPES, "Use a PDF, JPG, PNG or WebP"),
  size: z.number().max(MAX_BYTES, "Files must be 50 MB or smaller"),
});

const reportInput = z.object({
  type: z.enum(["damage", "return", "defect"], "Pick what happened"),
  itemIds: z.array(z.string().uuid()),
  description: z.string().trim().min(10, "Describe the problem (10+ characters)").max(2000),
  files: z
    .array(evidenceFile)
    .min(1, "Add at least one photo or PDF")
    .max(MAX_FILES, `Add up to ${MAX_FILES} files`),
});

export function ReportProblem({
  orderId,
  items,
  deliveredAt,
  settings,
}: {
  orderId: string;
  items: Order["items"];
  deliveredAt: string | null;
  settings: Settings;
}) {
  const router = useRouter();
  const { run, pending } = useServerAction();
  const [open, setOpen] = useState(false);
  // Made once per report (first open) so a retry after a failed save reuses the same claim id.
  const [claimId, setClaimId] = useState<string | null>(null);
  const [openedAt, setOpenedAt] = useState(0);

  function openForm() {
    if (!claimId) setClaimId(crypto.randomUUID());
    setOpenedAt(Date.now());
    setOpen(true);
  }

  // Days since delivery, measured when the form opened. Unreadable dates show every type; the server decides.
  const delivered = Date.parse(deliveredAt ?? "");
  const elapsedDays = Number.isFinite(delivered) ? (openedAt - delivered) / DAY_MS : 0;
  const available = KINDS.filter((k) => elapsedDays <= settings[k.days]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!claimId) {
      toast.error("Close and open the form again.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    // An empty file input still yields a File with size 0, so treat that as "none chosen".
    const files = fd.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
    const check = reportInput.safeParse({
      type: String(fd.get("type") ?? ""),
      itemIds: fd.getAll("itemIds"),
      description: String(fd.get("description") ?? ""),
      files: files.map((f) => ({ type: f.type, size: f.size })),
    });
    if (!check.success) {
      toast.error(check.error.issues[0]?.message ?? "Check the report");
      return;
    }
    const d = check.data;
    const evidence = files.map((file, i) => ({
      file,
      path: `${orderId}/claims/${claimId}/${crypto.randomUUID()}.${EXTENSIONS[d.files[i].type]}`,
      fileName: file.name.slice(0, 200),
    }));

    run(
      async (): Promise<ActionResult> => {
        const supabase = createClient();
        const uploads = await Promise.all(
          evidence.map((e) =>
            supabase.storage.from("order-files").upload(e.path, e.file, { contentType: e.file.type, upsert: false }),
          ),
        );
        if (uploads.some((u) => u.error)) return { ok: false, error: "Upload failed. Try again." };
        return openClaim({
          claimId,
          orderId,
          type: d.type,
          itemIds: d.itemIds,
          description: d.description,
          evidence: evidence.map((e) => ({ path: e.path, fileName: e.fileName })),
        });
      },
      "Problem reported",
      () => router.push(`/buyer/claims/${claimId}`),
    );
  }

  if (!open) {
    return <Button variant="outline" onClick={openForm}>Report a problem</Button>;
  }

  if (available.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <Notice>The report windows for this order have closed.</Notice>
        <Button variant="outline" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">What happened?</legend>
        {available.map((k) => (
          <label key={k.value} className="flex items-start gap-2">
            <input type="radio" name="type" value={k.value} className="mt-1 size-4 accent-primary" />
            <span>{`${k.text} — within ${settings[k.days]} days${k.note}`}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">Which items? (leave all unchecked for the whole order)</legend>
        {items.map((item) => (
          <label key={item.id} className="flex items-center gap-2">
            <input type="checkbox" name="itemIds" value={item.id} className="size-4 accent-primary" />
            <span>{item.variantName ? `${item.title} (${item.variantName})` : item.title}</span>
          </label>
        ))}
      </fieldset>

      <Field label="What is the problem?" name="description" hint="At least 10 characters.">
        <Textarea id="description" name="description" maxLength={2000} />
      </Field>

      <Field label="Photos or videos" name="file" hint={`Up to ${MAX_FILES} files: JPG, PNG, WebP, PDF, MP4 or MOV, 50 MB each.`}>
        <input
          id="file"
          name="file"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,application/pdf,video/mp4,video/quicktime"
          className="text-sm file:mr-3 file:rounded-md file:border file:px-2.5 file:py-1"
        />
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          Send report
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
