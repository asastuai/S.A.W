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
        "fade-in": "fade-in 200ms ease-out",
        "slide-up": "slide-up 320ms cubic-bezier(0.16, 1, 0.3, 1)",
        "pop-in": "pop-in 200ms ease-out",
        "mascot-breathe": "mascot-breathe 4s ease-in-out infinite",
        "mascot-pulse": "mascot-pulse 1.2s ease-in-out infinite",
        "mascot-blink": "mascot-blink 5s ease-in-out infinite",
        "mascot-bounce": "mascot-bounce 1.4s ease-in-out infinite",
        "mascot-tick": "mascot-tick 0.9s ease-out infinite",
        "mascot-pop": "mascot-pop 1s ease-in-out infinite",
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
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-up": {
          "0%": { transform: "translateY(40px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "pop-in": {
          "0%": { transform: "scale(0.96)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "mascot-breathe": {
          "0%, 100%": { transform: "scaleY(1) scaleX(1)" },
          "50%": { transform: "scaleY(1.015) scaleX(1.005)" },
        },
        "mascot-pulse": {
          "0%, 100%": { transform: "scale(1)", filter: "drop-shadow(0 0 0 #c9a96e)" },
          "50%": { transform: "scale(1.02)", filter: "drop-shadow(0 0 6px #c9a96e)" },
        },
        "mascot-blink": {
          "0%, 92%, 96%, 100%": { transform: "scaleY(1)" },
          "94%": { transform: "scaleY(0.05)" },
        },
        "mascot-bounce": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "mascot-tick": {
          "0%": { transform: "translateX(-4px)", opacity: "0" },
          "30%": { opacity: "1" },
          "100%": { transform: "translateX(8px)", opacity: "0" },
        },
        "mascot-pop": {
          "0%, 100%": { transform: "scale(0.6)", opacity: "0.4" },
          "50%": { transform: "scale(1)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
