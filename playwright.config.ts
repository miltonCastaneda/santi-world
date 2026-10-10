import { defineConfig, devices } from "@playwright/test";

const DEV_PORT = 5199;
const PROD_PORT = 5299;

const chromium = {
  ...devices["Desktop Chrome"],
  viewport: { width: 1280, height: 720 },
  launchOptions: {
    // WebGL en headless (sin GPU) mediante SwiftShader.
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  },
};

export default defineConfig({
  testDir: "tests/e2e",
  // WebGL por software (SwiftShader) satura la CPU: un navegador a la vez.
  workers: 1,
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /\.prod\.spec\.ts$/,
      use: { ...chromium, baseURL: `http://localhost:${DEV_PORT}` },
    },
    {
      name: "prod",
      testMatch: /\.prod\.spec\.ts$/,
      use: { ...chromium, baseURL: `http://localhost:${PROD_PORT}` },
    },
  ],
  webServer: [
    {
      command: `npx vite --port ${DEV_PORT} --strictPort`,
      url: `http://localhost:${DEV_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `npx vite build && npx vite preview --port ${PROD_PORT} --strictPort`,
      url: `http://localhost:${PROD_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
