import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A second dev server must not overwrite the active server's HMR chunks.
  distDir: process.env.AFTERCLASS_E2E === "1" ? ".next-e2e" : ".next",
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
