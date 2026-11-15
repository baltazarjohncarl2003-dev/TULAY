// Business facts used by the footer and legal pages. Fill these in once; every page reads them from here.
// TODO(owner): replace each [bracketed] value before launch. Support email is an open item in CLAUDE.md.
export const SITE = {
  name: "TULAY",
  legalName: "[Registered business name]",
  registration: "[DTI/SEC registration no.]",
  address: "[Registered business address, Philippines]",
  supportEmail: "[support email]",
  dpoName: "[Data Protection Officer name]",
  dpoEmail: "[DPO email]",
  phone: "[Contact number]",
  venue: "[City]", // courts with jurisdiction over disputes
  legalStatus: "Draft for legal review. Not yet in effect.",
} as const;

/** False while a SITE value still holds its [bracketed] placeholder; callers hide it instead of printing it. */
export const isSet = (value: string) => !value.startsWith("[");

/** The value, or `fallback` while it is still a placeholder. */
export const setOr = (value: string, fallback: string) => (isSet(value) ? value : fallback);

