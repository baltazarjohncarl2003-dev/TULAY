"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { Field, NativeSelect } from "@/components/form";
import { Button } from "@/components/ui/button";
import { addDocument } from "@/lib/actions/supplier";
import { createClient } from "@/lib/supabase/client";
import { SUPPLIER_DOCUMENT_KINDS, SUPPLIER_DOCUMENT_MAX_BYTES, SUPPLIER_DOCUMENT_TYPES } from "@/lib/validation/forms";

const EXTENSIONS: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };

export function DocumentUpload({ supplierId }: { supplierId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const kind = String(fd.get("kind"));
    const file = fd.get("file");
    // An empty file input still yields a File with size 0, so treat that as "none chosen".
    if (!(file instanceof File) || file.size === 0) {
      toast.error("Choose a file");
      return;
    }
    if (!(SUPPLIER_DOCUMENT_TYPES as readonly string[]).includes(file.type)) {
      toast.error("Use a PDF, JPG or PNG");
      return;
    }
    if (file.size > SUPPLIER_DOCUMENT_MAX_BYTES) {
      toast.error("Files must be 10 MB or smaller");
      return;
    }
    const storagePath = `${supplierId}/${crypto.randomUUID()}.${EXTENSIONS[file.type]}`;
    const fileName = file.name.slice(0, 200);

    startTransition(async () => {
      const { error } = await createClient()
        .storage.from("supplier-documents")
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (error) {
        toast.error("Upload failed. Try again.");
        return;
      }
      const res = await addDocument({ kind, storagePath, fileName });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Document uploaded");
      formRef.current?.reset();
      router.refresh();
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <Field label="Document type" name="kind">
        <NativeSelect id="kind" name="kind">
          {Object.entries(SUPPLIER_DOCUMENT_KINDS).map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="File" name="file">
        <input
          id="file"
          name="file"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="text-sm file:mr-3 file:rounded-md file:border file:px-2.5 file:py-1"
        />
      </Field>
      <Button type="submit" disabled={pending}>
        Upload
      </Button>
    </form>
  );
}
