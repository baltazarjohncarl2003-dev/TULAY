import { ImageResponse } from "next/og";

// Default link-preview image for every page that does not set its own (product pages use the product photo).
export const alt = "TULAY: the bridge to better business. Philippine B2B marketplace.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#dc2626",
          color: "#ffffff",
        }}
      >
        <div style={{ fontSize: 132, fontWeight: 800, letterSpacing: -4 }}>TULAY</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.1 }}>The bridge to better business.</div>
          <div style={{ fontSize: 34, opacity: 0.9 }}>
            Find verified Philippine suppliers, manufacturers and wholesalers. Request quotes and order in one place.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
