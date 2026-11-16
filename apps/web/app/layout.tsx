import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? "http://127.0.0.1:3000"),
  title: { default: "Flownix — Alpha intelligence", template: "%s | Flownix" },
  description:
    "Private, evidence-first long-term Binance Alpha accumulation research. Independent, no live execution.",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg", apple: "/brand/app-icon.png" },
  openGraph: {
    title: "Flownix — Evidence before inference",
    description: "Independent long-term Alpha intelligence",
    images: ["/brand/opengraph.png"],
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
