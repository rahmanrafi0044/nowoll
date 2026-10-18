// Fixed addresses for the browser tests. Different ports and a different
// database from `pnpm dev` (3000/3001, nowoll_dev), so both can run side by side
// and the tests never touch your development data.
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  'postgresql://nowoll:nowoll_local_password@localhost:5432/nowoll_e2e'
export const API_PORT = 3101
export const SHOP_PORT = 3100
export const API_URL = `http://localhost:${API_PORT}`
export const SHOP_URL = `http://localhost:${SHOP_PORT}`
// Step 50: the admin panel, and Mailpit — where the e2e notification worker
// "sends" its emails (the dev one from docker-compose.yml; a service in CI).
export const ADMIN_PORT = 3102
export const ADMIN_URL = `http://localhost:${ADMIN_PORT}`
export const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025'
// Where the e2e API pretends to keep uploaded photos (".invalid" never resolves).
export const E2E_PHOTOS_URL = 'https://e2e-images.invalid'
