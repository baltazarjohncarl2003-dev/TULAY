const MAX = 48;

/** Chat name when the AI gave none: the first message, cut at a word boundary. */
export function fallbackTitle(message: string): string {
  const clean = message.replace(/\s+/g, " ").trim();
  if (clean.length <= MAX) return clean;
  const cut = clean.slice(0, MAX);
  const space = cut.lastIndexOf(" ");
  return `${(space > 20 ? cut.slice(0, space) : cut).replace(/[\s,.:;-]+$/, "")}…`;
}
