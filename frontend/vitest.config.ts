import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["__tests__/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "./coverage",
      include: [
        "app/**/*.{ts,tsx}",
        "components/**/*.{ts,tsx}",
        "contexts/**/*.{ts,tsx}",
        "hooks/**/*.{ts,tsx}",
        "lib/**/*.{ts,tsx}",
      ],
      exclude: [
        "**/*.d.ts",
        "**/*.test.{ts,tsx}",
        "**/*.spec.{ts,tsx}",
        "e2e/**",
        "tests/**",
        "app/layout.tsx",
        "app/[locale]/layout.tsx",
        "app/[locale]/admin/layout.tsx",
        "app/[locale]/tracking/test/page.tsx",
        "components/ui/**",
        "components/landing/**",
        "components/theme-provider.tsx",
        "components/tracking/DynamicDeliveryMap.tsx",
        "hooks/use-mobile.ts",
        "hooks/use-mobile.tsx",
        "hooks/use-now.ts",
        "hooks/use-toast.ts",
        "lib/navigation.ts",
        "lib/public-copy.ts",
        "lib/types.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
})
