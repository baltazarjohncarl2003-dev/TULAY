export const REQUIRED_DOCUMENTS = ["dti_sec", "mayors_permit", "bir", "valid_id"] as const;

export function missingDocuments(kinds: string[]): (typeof REQUIRED_DOCUMENTS)[number][] {
  return REQUIRED_DOCUMENTS.filter((k) => !kinds.includes(k));
}

const DAY_MS = 86_400_000;

/** Whole business days (Mon-Fri) after `from` up to and including `to`, both YYYY-MM-DD. 0 if to <= from. */
export function businessDaysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  let count = 0;
  for (let t = start + DAY_MS; t <= end; t += DAY_MS) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

export function profileCompleteness(
  app: {
    description: string;
    city: string;
    province: string;
    moq: number;
    leadDays: number;
    documents: { kind: string }[];
  } | null,
): { done: number; total: number; items: { label: string; done: boolean }[] } {
  const items = [
    { label: "Business description (50+ characters)", done: !!app && app.description.trim().length >= 50 },
    { label: "Location", done: !!app && !!app.city.trim() && !!app.province.trim() },
    { label: "MOQ and lead time", done: !!app && app.moq > 0 && app.leadDays > 0 },
    {
      label: "All 4 required documents",
      done: !!app && missingDocuments(app.documents.map((d) => d.kind)).length === 0,
    },
  ];
  return { done: items.filter((i) => i.done).length, total: items.length, items };
}
