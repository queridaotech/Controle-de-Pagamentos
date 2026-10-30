import type { Config } from "tailwindcss";

/**
 * Tokens do GREEN UX System: escala verde de 7 tons (brand 50–600) + tons
 * profundos (700–900) para menu, login e textos de destaque.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#EDF8E9",
          100: "#C7E9C0",
          200: "#A1D99B",
          300: "#74C476",
          400: "#41AB5D",
          500: "#238B45",
          600: "#005A32",
          700: "#00472A",
          800: "#06331F",
          900: "#0A2218",
        },
        page: "#EEF1EE",
        ink: "#0E1B14",
        muted: "#66756C",
        line: "#E3E9E4",
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans Variable"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "1.5rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(10,34,24,0.04), 0 8px 24px -12px rgba(10,34,24,0.10)",
      },
    },
  },
  plugins: [],
};

export default config;
