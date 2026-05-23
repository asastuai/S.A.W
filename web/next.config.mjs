/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@asastuai/saw-sdk"],
  webpack: (config) => {
    config.externals = config.externals || [];
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Clickjacking defense — no iframe embedding. If we ever
          // need a Telegram MiniApp embed, swap to SAMEORIGIN + a
          // CSP frame-ancestors that lists web.telegram.org.
          { key: "X-Frame-Options", value: "DENY" },
          // MIME-sniff protection.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Send referrer same-origin only on cross-origin nav.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Lock down browser capabilities we don't use.
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
