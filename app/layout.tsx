import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://mellow-english-companion.nativekrill4.chatgpt.site"),
  title: "Mellow — Your English safe space",
  description:
    "A private English companion that listens, remembers, and grows with you.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "Mellow — Your English safe space",
    description: "A private English companion that listens, remembers, and grows with you.",
    type: "website",
    images: [{ url: "/og.png", width: 1672, height: 941, alt: "Mellow — Your English safe space" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mellow — Your English safe space",
    description: "A private English companion that listens, remembers, and grows with you.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
