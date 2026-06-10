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
        sans: ["var(--font-sans)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        mono: ["var(--font-sans)", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "monospace"],
        display: ["var(--font-display)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        ink: "#0c0d11", // panel base
        obsidian: "#070708", // site base bg (operator console black)
        smoke: "#14161b", // elevated panels / inputs
        ash: "#262a32", // borders
        bone: "#d6d2c4", // body text (cool terminal)
        cream: "#f2eee2", // bright text
        rust: "#d4512e", // warnings (more alive)
        gold: "#f0b429", // brand / action (electric amber)
        goldlit: "#ffd567", // glow highlight
        phosphor: "#5ad19a", // system ok / online / readouts
      },
      letterSpacing: {
        cinema: "-0.02em",
      },
      boxShadow: {
        glow: "0 0 24px -4px rgba(240, 180, 41, 0.45)",
        "glow-lg": "0 0 56px -8px rgba(240, 180, 41, 0.5)",
      },
      dropShadow: {
        gold: "0 0 10px rgba(240, 180, 41, 0.55)",
        "gold-lg": "0 0 22px rgba(240, 180, 41, 0.6)",
      },
      animation: {
        "caret": "caret 1.05s steps(1) infinite",
        "boot-in": "boot-in 260ms ease-out both",
        "scan-line": "scan-line 3s linear infinite",
        "flicker": "flicker 4s linear infinite",
        "fade-in": "fade-in 200ms ease-out",
        "slide-up": "slide-up 320ms cubic-bezier(0.16, 1, 0.3, 1)",
        "pop-in": "pop-in 200ms ease-out",
        "reveal": "reveal 700ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "intro": "intro 900ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "glow-pulse": "glow-pulse 3.2s ease-in-out infinite",
        "grain-drift": "grain-drift 8s steps(6) infinite",
        "mascot-breathe": "mascot-breathe 4s ease-in-out infinite",
        "mascot-pulse": "mascot-pulse 1.2s ease-in-out infinite",
        "mascot-blink": "mascot-blink 5s ease-in-out infinite",
        "mascot-bounce": "mascot-bounce 1.4s ease-in-out infinite",
        "mascot-tick": "mascot-tick 0.9s ease-out infinite",
        "mascot-pop": "mascot-pop 1s ease-in-out infinite",
      },
      keyframes: {
        // Blinking block cursor for the operator console.
        caret: {
          "0%, 50%": { opacity: "1" },
          "50.01%, 100%": { opacity: "0" },
        },
        // Boot reveal: content resolves in after a sequence finishes typing.
        "boot-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "none" },
        },
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
        // Scroll-reveal: a section rises and resolves into focus.
        reveal: {
          "0%": { transform: "translateY(28px)", opacity: "0", filter: "blur(6px)" },
          "100%": { transform: "translateY(0)", opacity: "1", filter: "blur(0)" },
        },
        // Title-card intro: blur-fade-in like a film credit resolving.
        intro: {
          "0%": { transform: "translateY(14px)", opacity: "0", filter: "blur(10px)" },
          "100%": { transform: "translateY(0)", opacity: "1", filter: "blur(0)" },
        },
        // Slow gold breathing glow for hero accents + CTAs.
        "glow-pulse": {
          "0%, 100%": { filter: "drop-shadow(0 0 4px rgba(201,169,110,0.25))" },
          "50%": { filter: "drop-shadow(0 0 16px rgba(201,169,110,0.6))" },
        },
        // Subtle film-grain drift.
        "grain-drift": {
          "0%": { transform: "translate(0,0)" },
          "100%": { transform: "translate(-4%,3%)" },
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
