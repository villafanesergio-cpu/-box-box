import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3000',
    launchOptions: process.env.BOXBOX_CHROMIUM_PATH ? {
      executablePath: process.env.BOXBOX_CHROMIUM_PATH,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote'],
    } : {},
  },
  webServer: [
    { command: 'node tests/fixtures/supabase-server.mjs', port:54329 },
    { command:'npm run dev -- --hostname 127.0.0.1', port:3000,
      env:{NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54329',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'test-key'} },
  ],
});
