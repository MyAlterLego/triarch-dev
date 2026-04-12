import type { Metadata } from "next";
import { Rajdhani, Exo_2, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const rajdhani = Rajdhani({
  variable: "--font-rajdhani",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const exo2 = Exo_2({
  variable: "--font-exo2",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Triarch Dev | Custom App Development",
  description:
    "Custom software development by Triarch Security LLC. AI-powered tools, custom CRMs, and bespoke applications built for your business.",
  openGraph: {
    title: "Triarch Dev | Custom App Development",
    description:
      "Your idea, engineered. Custom software built with substance, not hype.",
    url: "https://www.triarch.dev",
    siteName: "Triarch Dev",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${rajdhani.variable} ${exo2.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
