"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Field } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendProof } from "@/lib/actions/delivery";
import { createClient } from "@/lib/supabase/client";

// Mirrors the order-files bucket limits (migration); the database and storage policies enforce them again.
const TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
const MAX_BYTES = 20 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const proofSchema = z.object({
  file: z
    .instanceof(File, { message: "Choose a file" })
    .refine((f) => f.size > 0, "Choose a file")
    .refine((f) => (TYPES as readonly string[]).includes(f.type), "Use a PDF, JPG, PNG or WebP")
    .refine((f) => f.size <= MAX_BYTES, "Files must be 20 MB or smaller"),
  note: z.string().trim().max(1000, "Keep the note under 1000 characters"),
});

export function ProofUpload({ orderId }: { orderId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = proofSchema.safeParse({ file: fd.get("file"), note: String(fd.get("note") ?? "") });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    const { file, note } = parsed.data;
    const storagePath = `${orderId}/proofs/${crypto.randomUUID()}.${EXTENSIONS[file.type]}`;

    startTransition(async () => {
      const { error } = await createClient()
        .storage.from("order-files")
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (error) {
        toast.error("Upload failed. Try again.");
        return;
      }
      const res = await sendProof(orderId, storagePath, note);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Proof sent to the buyer");
      formRef.current?.reset();
      router.refresh();
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <Field label="Proof file" name="file">
        <input
          id="file"
          name="file"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="text-sm file:mr-3 file:rounded-md file:border file:px-2.5 file:py-1"
        />
      </Field>
      <Field label="Note for the buyer (optional)" name="note">
        <Input id="note" name="note" type="text" />
      </Field>
      <Button type="submit" disabled={pending} className="w-fit">
        Send proof
      </Button>
    </form>
  );
}
