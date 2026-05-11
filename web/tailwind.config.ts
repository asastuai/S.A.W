import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "monospace"],
        display: ["ui-serif", "Georgia", "Cambria", "serif"],
      },
      colors: {
        ink: "#0a0a0a",
        smoke: "#1a1a1a",
        ash: "#2a2a2a",
        bone: "#e8e4d8",
        cream: "#f4f0e6",
        rust: "#b7410e",
        gold: "#c9a96e",
      },
      animation: {
        "scan-line": "scan-line 3s linear infinite",
        "flicker": "flicker 4s linear infinite",
      },
      keyframes: {
        "scan-line": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        flicker: {
          "0%, 19.999%, 22%, 62.999%, 64%, 64.999%, 70%, 100%": {
            opacity: "1",
          },
          "20%, 21.999%, 63%, 63.999%, 65%, 69.999%": {
            opacity: "0.4",
          },
        },
      },
    },
  },
  plugins: [],
};

export default config;
