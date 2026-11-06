import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/Header";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jbmono" });

export const metadata: Metadata = {
  title: "HopPay - Stablecoin payouts on Solana",
  description: "Pay contractors, contributors and suppliers in USDC from one CSV. Routed through MultiHopper with TRM screening built in.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <Providers>
          <Header />
          <main className="mx-auto max-w-6xl px-4 pb-24 pt-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
