import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "TULAY", template: "%s · TULAY" },
  description: "TULAY connects Philippine businesses with verified suppliers, manufacturers, wholesalers and service providers.",
};

export const viewport: Viewport = { themeColor: "#dc2626" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-PH" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2"
        >
          Skip to content
        </a>
        {children}
        <Toaster richColors theme="light" position="top-center" />
      </body>
    </html>
  );
}
