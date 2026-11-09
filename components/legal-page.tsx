import { Notice } from "@/components/common";
import { SITE } from "@/lib/site";

/** Layout for policy pages: title, draft notice, readable prose. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:py-14">
      <header className="flex flex-col gap-2">
        <span className="text-xs font-semibold tracking-wide text-primary uppercase">{SITE.name} policies</span>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">Last updated: {updated}</p>
      </header>
      <Notice tone="warn">{SITE.legalStatus}</Notice>
      <article className="flex flex-col gap-4 text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ul]:list-disc [&_ul]:space-y-1">
        {children}
      </article>
    </main>
  );
}
