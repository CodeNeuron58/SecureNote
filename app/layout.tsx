import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { NavBar } from "@/components/NavBar";

export const metadata: Metadata = {
  title: {
    default: "SecureNote — share notes like secrets",
    template: "%s · SecureNote",
  },
  description:
    "End-to-end encrypted notes you can share with the people you choose. Every view is watermarked and logged, and the AI that searches your notes never leaves your browser.",
  openGraph: {
    title: "SecureNote — share notes like secrets",
    description:
      "End-to-end encrypted notes with per-viewer watermarks, an audit trail, and Gemma 3 AI that never leaves the browser.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "SecureNote — share notes like secrets",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0e13",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
      >
        <AuthProvider>
          <NavBar />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
