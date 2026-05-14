import type { Metadata } from "next";
import "./globals.css";
import { SolanaWalletProvider } from "@/components/wallet-provider";
import { ErrorBoundary } from "@/components/error-boundary";

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
          <SolanaWalletProvider>{children}</SolanaWalletProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
