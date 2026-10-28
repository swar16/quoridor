import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: { "import.meta.env.VERCEL": JSON.stringify(process.env.VERCEL === "1") },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
