import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror the `@/*` path alias from tsconfig.json.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Modules read these at import time (src/lib/auth.ts throws without the
    // secrets; the allow-lists are parsed once). Placeholder values only — no
    // test talks to Google or a database; Prisma is mocked throughout.
    env: {
      TZ: "UTC",
      BETTER_AUTH_SECRET: "test-secret-not-for-production-000000",
      BETTER_AUTH_URL: "http://localhost:3000",
      GOOGLE_CLIENT_ID: "test-client-id",
      GOOGLE_CLIENT_SECRET: "test-client-secret",
      ALLOWED_EMAIL_DOMAINS: "idinsight.org",
      EXTRA_ALLOWED_EMAILS: "admin@example.com",
      READONLY_API_KEYS: "test-readonly-key",
    },
  },
});
