/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Lifted dark theme for readability (less crushed blacks)
        "space-black": "#0f111a",
        "space-dark": "#141827",
        "space-panel": "#1b2033",
        "space-border": "#3a3f5f",
        "accent-red": "#ff4444",
        "accent-amber": "#ffb347",

        // Clean spacecraft OS accents
        "accent-cyan": "#6ff7ff",
        "accent-lime": "#a6ff7a",
      },
      fontFamily: {
        // Barlow/JetBrains Mono are loaded in index.html.
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        sans: ["'Barlow'", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
