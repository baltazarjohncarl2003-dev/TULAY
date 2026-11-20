"use client";

import { CameraIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useTransition } from "react";
import { toast } from "sonner";
import { setAvatar } from "@/lib/actions/account";
import { createClient } from "@/lib/supabase/client";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 2 * 1024 * 1024; // matches the avatars bucket limit

/** Round profile picture (or initial) with a camera button that uploads to avatars/<user id>/ and saves it. */
export function AvatarUpload({ userId, name, url }: { userId: string; name: string; url: string | null }) {
  const router = useRouter();
  const inputId = useId();
  const [pending, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const ext = TYPES[file.type];
    if (!ext || file.size > MAX_BYTES) {
      toast.error("Pictures must be JPG, PNG or WebP, 2 MB or smaller");
      return;
    }
    const storagePath = `${userId}/${crypto.randomUUID()}.${ext}`;
    startTransition(async () => {
      const bucket = createClient().storage.from("avatars");
      const { error } = await bucket.upload(storagePath, file, { contentType: file.type });
      if (error) {
        toast.error("Upload failed. Try again.");
        return;
      }
      const res = await setAvatar(storagePath);
      if (!res.ok) {
        await bucket.remove([storagePath]); // don't leave an unused file behind; setAvatar clears any that survive
        toast.error(res.error);
        return;
      }
      toast.success("Profile picture updated");
      router.refresh();
    });
  }

  return (
    <div className="relative">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- small public storage image, no optimizer needed
        <img src={url} alt="" className="size-20 rounded-full object-cover" />
      ) : (
        <div className="flex size-20 items-center justify-center rounded-full bg-primary text-3xl font-bold text-primary-foreground">
          {name.slice(0, 1).toUpperCase()}
        </div>
      )}
      <label
        htmlFor={inputId}
        className="absolute -right-1 -bottom-1 grid size-8 cursor-pointer place-items-center rounded-full border bg-background shadow-sm hover:bg-muted has-[:disabled]:opacity-50"
      >
        <CameraIcon aria-hidden="true" className="size-4" />
        <span className="sr-only">{pending ? "Uploading picture" : "Change profile picture"}</span>
        <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={pending} onChange={onChange} />
      </label>
    </div>
  );
}
