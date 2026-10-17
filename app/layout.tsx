import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PlungePalz Places",
  description: "Global database of sauna and cold plunge locations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
