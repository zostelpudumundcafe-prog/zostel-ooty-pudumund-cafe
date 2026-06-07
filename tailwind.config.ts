import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        zostel: {
          orange: {
            DEFAULT: "#FF5A36",
            light: "#FF7D60",
            dark: "#E04826",
            subtle: "#FFF0ED",
          },
          charcoal: {
            DEFAULT: "#1C1C1C",
            light: "#333333",
            dark: "#121212",
          },
          gray: {
            DEFAULT: "#F5F5F5",
            light: "#FAFAFA",
            dark: "#E5E5E5",
          },
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
