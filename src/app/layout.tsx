import type { Metadata, Viewport } from "next";
import { publicPath } from "@/lib/messenger/assets";
import "./globals.css";

export const metadata: Metadata = {
  title: "Messenger",
  description: "It's a small planet, but someone's gotta make the deliveries.",
  icons: {
    icon: [
      { url: publicPath("/assets/favicon32-BC0QIL61.png"), sizes: "32x32", type: "image/png" },
      { url: publicPath("/assets/favicon16-B6JSd80n.png"), sizes: "16x16", type: "image/png" },
    ],
  },
  openGraph: {
    title: "Messenger",
    description: "It's a small planet, but someone's gotta make the deliveries.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Messenger",
    description: "It's a small planet, but someone's gotta make the deliveries.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
        <style>{`
          @font-face {
            font-family: "Messenger Chinese";
            src: url("${publicPath("/assets/fonts/ZCOOLQingKeHuangYou-Regular.ttf")}") format("truetype");
            font-display: swap;
          }
        `}</style>
      </head>
      <body className="messenger-body">{children}</body>
    </html>
  );
}
