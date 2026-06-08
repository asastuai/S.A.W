import type { Metadata } from "next";
import { Oswald, Inter } from "next/font/google";
import "./globals.css";
import { SolanaWalletProvider } from "@/components/wallet-provider";
import { ErrorBoundary } from "@/components/error-boundary";
import { PrivyAuthProvider } from "@/components/privy-provider";
import { PosthogBootstrap } from "@/lib/posthog";
import { PwaRegister } from "@/components/pwa-register";

// Cinematic-noir type system. Oswald = condensed title-sequence display;
// Inter = clean body prose. Mono (system) stays for classified stamps + data.
const display = Oswald({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});
const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SAW — Secret Agent Wallet",
  description:
    "Custody, policy, and oversight for AI agents on Solana. Be the handler of your agent.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="grain vignette min-h-screen scan-line font-sans antialiased">
        <ErrorBoundary>
          <PosthogBootstrap />
          <PwaRegister />
          <PrivyAuthProvider>
            <SolanaWalletProvider>{children}</SolanaWalletProvider>
          </PrivyAuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
