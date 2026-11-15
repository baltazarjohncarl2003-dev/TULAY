"use client";

import { useState } from "react";
import { z } from "zod";
import { Field, NativeSelect, useServerAction, useServerForm } from "@/components/form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CommissionRow, SettingRow } from "@/lib/data/admin";
import { CATEGORIES } from "@/lib/categories";
import { dateTime, label, php } from "@/lib/format";
import { addCommissionSchedule, addSearchSynonym, removeSearchSynonym, updateSetting } from "@/lib/actions/admin";
import { commissionScheduleSchema, settingSchema } from "@/lib/validation/forms";

/** What this admin may change here (the database enforces the same sub-roles). */
export type SettingsCan = { settings: boolean; schedule: boolean; synonyms: boolean };

export function SettingsClient({
  settings,
  schedules,
  synonyms,
  can,
}: {
  settings: SettingRow[];
  schedules: CommissionRow[];
  synonyms: { term: string; synonym: string }[];
  can: SettingsCan;
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Platform settings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {!can.settings && <p className="text-sm text-muted-foreground">Read only. Changing settings needs the super admin role.</p>}
          {settings.map((s) => (
            <SettingForm key={s.key} setting={s} canEdit={can.settings} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Commission schedule</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Starts</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{new Date(c.startsAt).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })}</TableCell>
                    <TableCell>{c.categoryName ?? "All categories"}</TableCell>
                    <TableCell>{`${Math.floor(c.rateBps / 100)}.${String(c.rateBps % 100).padStart(2, "0")}%`}</TableCell>
                    <TableCell>{c.note}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            Steps can only start in the future and are never edited. The rate in force at checkout is frozen on each
            order.
          </p>
          {can.schedule ? (
            <AddScheduleForm />
          ) : (
            <p className="text-sm text-muted-foreground">Scheduling a step needs the finance role.</p>
          )}
        </CardContent>
      </Card>

      <SynonymsCard synonyms={synonyms} canEdit={can.synonyms} />
    </>
  );
}

/** The typed number in plain units, so 5000 bps is never mistaken for 5000%. */
function unitHint(key: string, text: string): string | null {
  if (!/^\d{1,12}$/.test(text)) return null;
  const n = Number(text);
  if (key.endsWith("_bps")) return `${Math.floor(n / 100)}.${String(n % 100).padStart(2, "0")}% (10000 = 100%)`;
  if (key.endsWith("_centavos")) return `${php(n)}${n === 0 ? " (off until set)" : ""}`;
  return /_(days|hours|minutes)$/.exec(key)?.[1] ?? null;
}

const OPEN_ITEM = /^OPEN ITEM[^:]*:\s*/;

function SettingForm({ setting, canEdit }: { setting: SettingRow; canEdit: boolean }) {
  const { key, value, description, updatedAt } = setting;
  const { errors, onSubmit, pending } = useServerForm(settingSchema, updateSetting, "Setting saved");
  const [text, setText] = useState(typeof value === "string" ? value : String(value));
  const open = OPEN_ITEM.test(description);
  const converted = typeof value === "number" ? unitHint(key, text) : null;
  const hint = `${description.replace(OPEN_ITEM, "")}${converted ? ` Now: ${converted}.` : ""} Last changed ${dateTime(updatedAt)}.`;
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <input type="hidden" name="key" value={key} />
      <Field label={label(key)} name="value" hint={hint} errors={errors} className="flex-1">
        <Input
          id={key}
          aria-label={label(key)}
          name="value"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!canEdit}
          inputMode={typeof value === "number" ? "numeric" : undefined}
        />
      </Field>
      {open && <Badge variant="outline">Open item</Badge>}
      {canEdit && (
        <Button type="submit" disabled={pending}>
          Save
        </Button>
      )}
    </form>
  );
}

const synonymFormSchema = z.object({
  term: z.string().trim().min(2, "At least 2 characters").max(60),
  synonym: z.string().trim().min(2, "At least 2 characters").max(60),
});

function SynonymsCard({ synonyms, canEdit }: { synonyms: { term: string; synonym: string }[]; canEdit: boolean }) {
  const { errors, onSubmit, pending } = useServerForm(synonymFormSchema, addSearchSynonym, "Synonym added");
  const { run, pending: removing } = useServerAction();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Search synonyms</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          Two words that should find each other in marketplace search, such as tarp and tarpaulin.
        </p>
        {synonyms.length === 0 ? (
          <p className="text-sm text-muted-foreground">No synonyms yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {synonyms.map((x) => (
              <li key={`${x.term}~${x.synonym}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2">
                <span>
                  {x.term} <span aria-hidden="true">↔</span> {x.synonym}
                </span>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={removing}
                    aria-label={`Remove ${x.term} and ${x.synonym}`}
                    onClick={() => run(() => removeSearchSynonym(x), "Synonym removed")}
                  >
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit ? (
          <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-3 sm:items-end">
            <Field label="Word" name="term" errors={errors}>
              <Input id="term" name="term" maxLength={60} />
            </Field>
            <Field label="Also finds" name="synonym" errors={errors}>
              <Input id="synonym" name="synonym" maxLength={60} />
            </Field>
            <Button type="submit" disabled={pending}>
              Add synonym
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">Changing synonyms needs the verifier role.</p>
        )}
      </CardContent>
    </Card>
  );
}

function AddScheduleForm() {
  const { errors, onSubmit, pending } = useServerForm(
    commissionScheduleSchema,
    addCommissionSchedule,
    "Commission step scheduled",
  );
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
      <Field label="Rate (%)" name="ratePercent" errors={errors}>
        <Input id="ratePercent" name="ratePercent" inputMode="decimal" placeholder="0.00" />
      </Field>
      <Field label="Starts on (Philippine time, midnight)" name="startsOn" errors={errors}>
        <Input id="startsOn" name="startsOn" type="date" />
      </Field>
      <Field label="Category" name="categorySlug" errors={errors}>
        <NativeSelect id="categorySlug" name="categorySlug" defaultValue="">
          <option value="">All categories</option>
          {CATEGORIES.filter((c) => c.parentSlug === null).map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Note (optional)" name="note" errors={errors}>
        <Input id="note" name="note" maxLength={300} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          Schedule step
        </Button>
      </div>
    </form>
  );
}
