"use client";

import { useState } from "react";
import { EmptyState } from "@/components/common";
import { Field, useServerAction, useServerForm } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { deleteAddress, saveAddress } from "@/lib/actions/delivery";
import type { Address } from "@/lib/types";
import { addressSchema } from "@/lib/validation/forms";

/** One line of the address; empty parts are skipped. */
function addressLine(a: Address) {
  return [a.line1, a.line2, a.barangay, a.city, a.province, a.postalCode].filter(Boolean).join(", ");
}

export function AddressBook({ addresses }: { addresses: Address[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  // Bumped after a save or cancel so the uncontrolled inputs clear (or reload the chosen address).
  const [formRev, setFormRev] = useState(0);
  const editing = addresses.find((a) => a.id === editingId) ?? null;
  const remove = useServerAction();

  function reset() {
    setEditingId(null);
    setFormRev((n) => n + 1);
  }

  const { errors, onSubmit, pending } = useServerForm(
    addressSchema,
    (raw) => saveAddress(editingId, raw),
    "Address saved",
    reset,
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_28rem]">
      <section aria-label="Saved addresses" className="flex min-w-0 flex-col gap-3">
        {addresses.length === 0 && <EmptyState title="No delivery addresses yet. Add one to check out." />}
        {addresses.map((a) => (
          <Card key={a.id}>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 flex-col gap-1 text-sm">
                {a.label && <p className="font-semibold">{a.label}</p>}
                <p>
                  {a.recipient} · {a.phone}
                </p>
                <p className="text-muted-foreground">{addressLine(a)}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditingId(a.id)} aria-label={`Edit address for ${a.recipient}`}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={remove.pending}
                  aria-label={`Delete address for ${a.recipient}`}
                  onClick={() =>
                    remove.run(() => deleteAddress(a.id), "Address removed", () => {
                      if (editingId === a.id) reset();
                    })
                  }
                >
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">{editing ? "Edit address" : "Add address"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form key={`${editingId ?? "new"}-${formRev}`} onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
            <Field label="Label (optional)" name="label" errors={errors} className="sm:col-span-2">
              <Input id="label" name="label" placeholder="e.g. Warehouse" maxLength={40} defaultValue={editing?.label ?? ""} />
            </Field>
            <Field label="Recipient" name="recipient" errors={errors}>
              <Input id="recipient" name="recipient" autoComplete="name" defaultValue={editing?.recipient ?? ""} />
            </Field>
            <Field label="Mobile" name="phone" errors={errors}>
              <Input id="phone" name="phone" type="tel" placeholder="09XXXXXXXXX" defaultValue={editing?.phone ?? ""} />
            </Field>
            <Field label="Address line 1" name="line1" errors={errors} className="sm:col-span-2">
              <Input id="line1" name="line1" autoComplete="address-line1" defaultValue={editing?.line1 ?? ""} />
            </Field>
            <Field label="Address line 2 (optional)" name="line2" errors={errors} className="sm:col-span-2">
              <Input id="line2" name="line2" autoComplete="address-line2" defaultValue={editing?.line2 ?? ""} />
            </Field>
            <Field label="Barangay (optional)" name="barangay" errors={errors}>
              <Input id="barangay" name="barangay" defaultValue={editing?.barangay ?? ""} />
            </Field>
            <Field label="City / municipality" name="city" errors={errors}>
              <Input id="city" name="city" autoComplete="address-level2" defaultValue={editing?.city ?? ""} />
            </Field>
            <Field label="Province" name="province" errors={errors}>
              <Input id="province" name="province" autoComplete="address-level1" defaultValue={editing?.province ?? ""} />
            </Field>
            <Field label="Postal code (optional)" name="postalCode" errors={errors}>
              <Input id="postalCode" name="postalCode" inputMode="numeric" maxLength={4} defaultValue={editing?.postalCode ?? ""} />
            </Field>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="submit" disabled={pending}>
                {editing ? "Save address" : "Add address"}
              </Button>
              {editing && (
                <Button type="button" variant="outline" onClick={reset}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
