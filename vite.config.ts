import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
    plugins: [tailwindcss(), svelte()],
    clearScreen: false,
    server: {
        port: 1420,
        strictPort: true,
    },
    envPrefix: ["VITE_", "TAURI_ENV_"],
    optimizeDeps: {
        exclude: ["@texture/ui", "@texture/ui-schema", "@texture/testing"],
    },
    build: {
        target: "es2021",
    },
});
