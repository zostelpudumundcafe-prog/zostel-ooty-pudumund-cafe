import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Zostel Ooty Pudumund | Cafe Menu",
  description: "Vibrant QR Code ordering system for Zostel Ooty Pudumund Cafe. Order and pay instantly.",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className={`${outfit.variable} font-sans h-full bg-zostel-gray-light text-zostel-charcoal antialiased`}>
        <div className="max-w-md mx-auto min-h-full bg-white shadow-lg flex flex-col relative border-x border-zostel-gray-dark/20">
          {children}
        </div>
      </body>
    </html>
  );
}
