"use client";

import { Field, NativeSelect, useServerForm } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CommissionRow, SettingRow } from "@/lib/data/admin";
import { CATEGORIES } from "@/lib/demo/data";
import { label } from "@/lib/format";
import { addCommissionSchedule, updateSetting } from "@/lib/actions/admin";
import { commissionScheduleSchema, settingSchema } from "@/lib/validation/forms";

export function SettingsClient({ settings, schedules }: { settings: SettingRow[]; schedules: CommissionRow[] }) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Platform settings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {settings.map((s) => (
            <SettingForm key={s.key} setting={s} />
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
          <AddScheduleForm />
        </CardContent>
      </Card>
    </>
  );
}

function SettingForm({ setting }: { setting: SettingRow }) {
  const { key, value, description } = setting;
  const { errors, onSubmit, pending } = useServerForm(settingSchema, updateSetting, "Setting saved");
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <input type="hidden" name="key" value={key} />
      <Field label={label(key)} name="value" hint={description} errors={errors} className="flex-1">
        <Input
          id={key}
          aria-label={label(key)}
          name="value"
          defaultValue={typeof value === "string" ? value : String(value)}
          inputMode={typeof value === "number" ? "numeric" : undefined}
        />
      </Field>
      <Button type="submit" disabled={pending}>
        Save
      </Button>
    </form>
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
