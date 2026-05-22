import type { Metadata } from "next";
import "./globals.css";
import { SolanaWalletProvider } from "@/components/wallet-provider";
import { ErrorBoundary } from "@/components/error-boundary";
import { PrivyAuthProvider } from "@/components/privy-provider";
import { PosthogBootstrap } from "@/lib/posthog";
import { PwaRegister } from "@/components/pwa-register";

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
    <html lang="en">
      <body className="grain min-h-screen scan-line">
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
