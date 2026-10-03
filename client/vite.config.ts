import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["fuel-mark.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Fitbiter",
        short_name: "Fitbiter",
        description: "STAY FIT. LOG YOUR BITS. A thoughtful daily nutrition and movement log.",
        theme_color: "#f4f5ef",
        background_color: "#f4f5ef",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/fuel-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/fuel-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
          { src: "/fuel-mark.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
    }),
  ],
  server: { proxy: { "/api": "http://localhost:3001" } },
});