import type { Metadata } from "next";
import type { ReactNode } from "react";

// This route is an internal Playwright e2e fixture (see ./page.tsx). It must
// stay reachable in production because `pnpm test:e2e:prod` targets the live URL,
// but it should never be indexed by search engines nor followed as a real page.
export const metadata: Metadata = {
  title: "perps ui fixture (e2e)",
  robots: { index: false, follow: false },
};

export default function TestPerpsUiLayout({ children }: { children: ReactNode }) {
  return children;
}
