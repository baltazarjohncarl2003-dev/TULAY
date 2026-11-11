"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useId, useRef, useTransition } from "react";
import { toast } from "sonner";
import { useServerAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { addProductMedia, removeProductMedia } from "@/lib/actions/catalog";
import type { Product } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { PRODUCT_MEDIA_MAX_BYTES, PRODUCT_MEDIA_TYPES } from "@/lib/validation/forms";

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const BUCKET_MARKER = "/product-media/";

export function ProductImages({
  supplierId,
  productId,
  status,
  imageUrls,
}: {
  supplierId: string;
  productId: string;
  status: Product["status"];
  imageUrls: string[];
}) {
  const router = useRouter();
  const fileId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const { run, pending: removing } = useServerAction();

  function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = new FormData(e.currentTarget).get("file");
    // An empty file input still yields a File with size 0, so treat that as "none chosen".
    if (!(file instanceof File) || file.size === 0) {
      toast.error("Choose an image");
      return;
    }
    if (!(PRODUCT_MEDIA_TYPES as readonly string[]).includes(file.type) || file.size > PRODUCT_MEDIA_MAX_BYTES) {
      toast.error("Images must be JPG, PNG or WebP, 5 MB or smaller");
      return;
    }
    const storagePath = `${supplierId}/${productId}/${crypto.randomUUID()}.${EXTENSIONS[file.type]}`;

    startTransition(async () => {
      const { error } = await createClient()
        .storage.from("product-media")
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (error) {
        toast.error("Upload failed. Try again.");
        return;
      }
      const res = await addProductMedia({ productId, storagePath });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Image added");
      formRef.current?.reset();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {imageUrls.length > 0 && (
        <ul className="flex flex-wrap gap-3">
          {imageUrls.map((url) => (
            <li key={url} className="flex flex-col gap-1">
              <div className="relative size-20 overflow-hidden rounded-md border">
                <Image src={url} alt="" fill unoptimized sizes="5rem" className="object-cover" />
              </div>
              {status !== "approved" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={removing}
                  onClick={() => run(() => removeProductMedia(url.split(BUCKET_MARKER)[1] ?? ""), "Image removed")}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {status === "approved" ? (
        <p className="text-sm text-muted-foreground">Edit the listing to change its images.</p>
      ) : (
        <form ref={formRef} onSubmit={onUpload} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={fileId}>Add image</Label>
            <input
              id={fileId}
              name="file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="text-sm file:mr-3 file:rounded-md file:border file:px-2.5 file:py-1"
            />
          </div>
          <Button type="submit" disabled={pending}>
            Upload image
          </Button>
        </form>
      )}
    </div>
  );
}
