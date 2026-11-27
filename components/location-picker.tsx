"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useId, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type LatLng = { lat: number; lng: number };

const MANILA: [number, number] = [14.5995, 120.9842];

const fmt = (n: number) => n.toFixed(6);

/** Both fields must be valid coordinates, otherwise there is no pin. */
function parsePin(lat: string, lng: string): LatLng | null {
  if (lat.trim() === "" || lng.trim() === "") return null;
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  return { lat: a, lng: b };
}

export function LocationPicker({
  defaultValue,
  errors,
  hint,
}: {
  defaultValue?: LatLng | null;
  errors?: Record<string, string[] | undefined>;
  hint?: string;
}) {
  const [lat, setLat] = useState(defaultValue ? fmt(defaultValue.lat) : "");
  const [lng, setLng] = useState(defaultValue ? fmt(defaultValue.lng) : "");
  const [status, setStatus] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const uid = useId();
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  // Map callbacks are created once, so they write through this ref to the latest setters.
  const setPin = useRef((p: LatLng) => {
    setLat(fmt(p.lat));
    setLng(fmt(p.lng));
  });

  const pin = parsePin(lat, lng);
  const outsidePH = pin && (pin.lat < 4 || pin.lat > 22 || pin.lng < 116 || pin.lng > 127);

  // Create the map once, in the browser only.
  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;
    let ro: ResizeObserver | null = null;
    import("leaflet").then((L) => {
      if (cancelled || !el.current) return;
      leafletRef.current = L;
      const start = parsePin(lat, lng);
      map = L.map(el.current).setView(start ? [start.lat, start.lng] : MANILA, start ? 17 : 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      }).addTo(map);
      map.on("click", (e) => setPin.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
      mapRef.current = map;
      // Re-measure when the container becomes visible (dialog, tab).
      ro = new ResizeObserver(() => map?.invalidateSize());
      ro.observe(el.current);
      setMapReady(true);
    });
    return () => {
      cancelled = true;
      ro?.disconnect();
      map?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial values only; later changes go through the sync effect
  }, []);

  // Keep the marker in step with the inputs.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!mapReady || !L || !map) return;
    if (!pin) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      const m = L.marker([pin.lat, pin.lng], {
        draggable: true,
        keyboard: true,
        title: "Location pin",
        alt: "Location pin",
        icon: L.divIcon({
          className: "",
          html: '<div style="width:20px;height:20px;border-radius:9999px;background:#dc2626;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>',
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        }),
      }).addTo(map);
      m.on("dragend", () => {
        const p = m.getLatLng();
        setPin.current({ lat: p.lat, lng: p.lng });
      });
      markerRef.current = m;
    } else {
      markerRef.current.setLatLng([pin.lat, pin.lng]);
    }
    if (!map.getBounds().contains([pin.lat, pin.lng])) map.panTo([pin.lat, pin.lng]);
  }, [pin?.lat, pin?.lng, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps -- pin is derived from these two values

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setStatus("Your browser does not support location. Click the map or type the coordinates.");
      return;
    }
    setStatus("Finding your location...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPin.current({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 17);
        setStatus("Pin set to your location. Drag it to fine-tune.");
      },
      (err) =>
        setStatus(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied. Allow it in your browser, or click the map instead."
            : err.code === err.TIMEOUT
              ? "Finding your location took too long. Try again or click the map."
              : "Your location is unavailable right now. Click the map or type the coordinates.",
        ),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function clearPin() {
    setLat("");
    setLng("");
    setStatus("Pin cleared.");
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-medium">Exact location</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={useMyLocation}>
          Use my location
        </Button>
        <Button type="button" variant="ghost" onClick={clearPin} disabled={!lat && !lng}>
          Clear pin
        </Button>
      </div>
      <div
        ref={el}
        role="application"
        aria-label="Map. Click or drag the pin to set the exact location. The latitude and longitude fields below do the same."
        className="z-0 h-64 w-full overflow-hidden rounded-lg border"
      />
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-lat`}>Latitude</Label>
          <Input
            id={`${uid}-lat`}
            name="lat"
            type="number"
            step="any"
            inputMode="decimal"
            placeholder="14.599500"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            aria-invalid={errors?.lat?.[0] ? true : undefined}
            aria-describedby={errors?.lat?.[0] ? `${uid}-lat-error` : undefined}
          />
          {errors?.lat?.[0] && (
            <p id={`${uid}-lat-error`} className="text-xs text-destructive" role="alert">
              {errors.lat[0]}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-lng`}>Longitude</Label>
          <Input
            id={`${uid}-lng`}
            name="lng"
            type="number"
            step="any"
            inputMode="decimal"
            placeholder="120.984200"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            aria-invalid={errors?.lng?.[0] ? true : undefined}
            aria-describedby={errors?.lng?.[0] ? `${uid}-lng-error` : undefined}
          />
          {errors?.lng?.[0] && (
            <p id={`${uid}-lng-error`} className="text-xs text-destructive" role="alert">
              {errors.lng[0]}
            </p>
          )}
        </div>
      </div>
      <div aria-live="polite" className="min-h-4 text-xs">
        {outsidePH && (
          <p className="text-amber-800 dark:text-amber-300">
            This pin looks to be outside the Philippines. Check the coordinates.
          </p>
        )}
        <p className="text-muted-foreground">{status}</p>
      </div>
    </div>
  );
}
