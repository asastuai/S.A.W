"use client";

import posthog from "posthog-js";
import { useEffect } from "react";

let initialized = false;

export function initPosthog() {
  if (initialized) return;
  if (typeof window === "undefined") return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
  if (!key) return;
  posthog.init(key, {
    api_host: host,
    capture_pageview: true,
    capture_pageleave: true,
    session_recording: { maskAllInputs: true },
    autocapture: true,
  });
  initialized = true;
}

export function PosthogBootstrap() {
  useEffect(() => {
    initPosthog();
  }, []);
  return null;
}

export { posthog };
