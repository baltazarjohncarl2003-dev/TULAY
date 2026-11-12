"use client";

import { useRef } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Field, useServerAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import { addArtwork } from "@/lib/actions/delivery";
import { createClient } from "@/lib/supabase/client";

const ARTWORK_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
const EXTENSIONS: Record<(typeof ARTWORK_TYPES)[number], string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_BYTES = 20 * 1024 * 1024;

// Instant feedback only; the storage bucket and addArtwork check the same rules again.
const artworkFile = z.object({
  type: z.enum(ARTWORK_TYPES, "Use a PDF, JPG, PNG or WebP"),
  size: z.number().max(MAX_BYTES, "Files must be 20 MB or smaller"),
});

export function ArtworkUpload({ orderId }: { orderId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const { run, pending } = useServerAction();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = new FormData(e.currentTarget).get("file");
    // An empty file input still yields a File with size 0, so treat that as "none chosen".
    if (!(file instanceof File) || file.size === 0) {
      toast.error("Choose a file");
      return;
    }
    const check = artworkFile.safeParse({ type: file.type, size: file.size });
    if (!check.success) {
      toast.error(check.error.issues[0]?.message ?? "Use a PDF, JPG, PNG or WebP up to 20 MB");
      return;
    }
    const storagePath = `${orderId}/artwork/${crypto.randomUUID()}.${EXTENSIONS[check.data.type]}`;
    const fileName = file.name.slice(0, 200);

    run(
      async () => {
        const { error } = await createClient()
          .storage.from("order-files")
          .upload(storagePath, file, { contentType: file.type, upsert: false });
        if (error) return { ok: false, error: "Upload failed. Try again." };
        return addArtwork(orderId, storagePath, fileName);
      },
      "Artwork uploaded",
      () => formRef.current?.reset(),
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <Field label="Artwork file" name="file" hint="PDF, JPG, PNG or WebP, up to 20 MB.">
        <input
          id="file"
          name="file"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="text-sm file:mr-3 file:rounded-md file:border file:px-2.5 file:py-1"
        />
      </Field>
      <Button type="submit" disabled={pending}>
        Upload artwork
      </Button>
    </form>
  );
}
