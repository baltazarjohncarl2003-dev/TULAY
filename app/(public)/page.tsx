const CATEGORIES = [
  "Custom shirts",
  "DTF prints",
  "Sublimation",
  "Packaging",
  "Customized mugs",
  "Customized IDs",
];

// Placeholder until Stage 2 renders categories from the database.
export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-12">
      <header className="flex flex-col gap-3">
        <span className="text-3xl font-bold tracking-tight text-primary">TULAY</span>
        <h1 className="text-2xl font-semibold sm:text-4xl">
          Custom print and packaging, direct from Philippine suppliers.
        </h1>
        <p className="text-muted-foreground">Coming soon.</p>
      </header>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {CATEGORIES.map((name) => (
          <li key={name} className="rounded-lg border bg-accent p-4 text-sm font-medium text-accent-foreground">
            {name}
          </li>
        ))}
      </ul>
    </main>
  );
}
