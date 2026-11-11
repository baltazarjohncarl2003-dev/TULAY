// Suspense boundary for public pages: listings are read per request (cacheComponents needs one).
export default function Loading() {
  return <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">Loading…</div>;
}
