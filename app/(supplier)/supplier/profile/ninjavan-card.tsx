"use client";

import { Field, NativeSelect, useServerForm } from "@/components/form";
import { LocationPicker } from "@/components/location-picker";
import type { Vehicle } from "@/lib/shipping/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { savePickupSettings } from "@/lib/actions/supplier";
import type { PickupSettings } from "@/lib/data/supplier";
import { pickupSettingsSchema } from "@/lib/validation/forms";

export function NinjaVanCard({ pickup, vehicles }: { pickup: PickupSettings | null; vehicles: Vehicle[] }) {
  const { errors, onSubmit, pending } = useServerForm(pickupSettingsSchema, savePickupSettings, "Pickup settings saved");

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm">
        Courier orders are booked on TULAY&apos;s Lalamove account. The driver picks up at your map pin, so keep the address, pin and vehicle current.
      </p>

      <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        <p className="text-sm font-medium sm:col-span-2">Pickup address</p>
        <Field label="Sender name" name="senderName" errors={errors}>
          <Input id="senderName" name="senderName" maxLength={100} defaultValue={pickup?.sender_name ?? ""} />
        </Field>
        <Field label="Phone" name="phone" errors={errors}>
          <Input id="phone" name="phone" inputMode="tel" placeholder="09XXXXXXXXX" defaultValue={pickup?.phone ?? ""} />
        </Field>
        <Field label="Street address" name="line1" errors={errors}>
          <Input id="line1" name="line1" maxLength={200} defaultValue={pickup?.line1 ?? ""} />
        </Field>
        <Field label="Building, unit (optional)" name="line2" errors={errors}>
          <Input id="line2" name="line2" maxLength={200} defaultValue={pickup?.line2 ?? ""} />
        </Field>
        <Field label="Barangay (optional)" name="barangay" errors={errors}>
          <Input id="barangay" name="barangay" maxLength={100} defaultValue={pickup?.barangay ?? ""} />
        </Field>
        <Field label="City" name="city" errors={errors}>
          <Input id="city" name="city" maxLength={100} defaultValue={pickup?.city ?? ""} />
        </Field>
        <Field label="Province" name="province" errors={errors}>
          <Input id="province" name="province" maxLength={100} defaultValue={pickup?.province ?? ""} />
        </Field>
        <Field label="Postal code (optional)" name="postalCode" errors={errors}>
          <Input id="postalCode" name="postalCode" inputMode="numeric" maxLength={4} defaultValue={pickup?.postal_code ?? ""} />
        </Field>
        <Field label="Usual parcel weight (kg)" name="parcelWeightKg" errors={errors}>
          <Input
            id="parcelWeightKg"
            name="parcelWeightKg"
            inputMode="decimal"
            defaultValue={pickup ? String(pickup.parcel_weight_grams / 1000) : "1"}
          />
        </Field>
        <div className="sm:col-span-2">
          <LocationPicker
            defaultValue={pickup?.lat != null && pickup?.lng != null ? { lat: pickup.lat, lng: pickup.lng } : null}
            errors={errors}
          />
        </div>
        {vehicles.length > 0 ? (
          <Field label="Delivery vehicle" name="serviceType" errors={errors}>
            <NativeSelect id="serviceType" name="serviceType" defaultValue={pickup?.lalamove_service_type ?? ""}>
              <option value="">Choose a vehicle</option>
              {vehicles.map((v) => (
                <option key={v.key} value={v.key}>
                  {v.description}
                  {v.loadKg != null ? ` (up to ${v.loadKg} kg)` : ""}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : (
          <>
            <input type="hidden" name="serviceType" value={pickup?.lalamove_service_type ?? ""} />
            <p className="text-sm text-muted-foreground sm:col-span-2">
              Vehicle choices load from Lalamove once it is connected.
            </p>
          </>
        )}
        <div className="flex items-end sm:col-span-2">
          <Button type="submit" disabled={pending}>
            Save pickup settings
          </Button>
        </div>
      </form>
    </div>
  );
}
