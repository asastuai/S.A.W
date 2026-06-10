import type { Metadata } from "next";
import { Martian_Mono, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { SolanaWalletProvider } from "@/components/wallet-provider";
import { ErrorBoundary } from "@/components/error-boundary";
import { PrivyAuthProvider } from "@/components/privy-provider";
import { PosthogBootstrap } from "@/lib/posthog";
import { PwaRegister } from "@/components/pwa-register";
import { StatusHeader } from "@/components/terminal/status-header";

// Operator Console type system. Martian Mono = wide, technical, military display
// (hero, panel numbers, section titles). IBM Plex Mono = the default voice for
// the whole UI (body, readouts, commands) — the site is monospace end to end.
const display = Martian_Mono({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body className="grain min-h-screen scan-line font-sans antialiased">
        <StatusHeader />
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
