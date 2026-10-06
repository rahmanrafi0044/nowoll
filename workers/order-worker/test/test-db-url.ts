// The worker's OWN test database (package tests run in parallel; the API's wipe nowoll_test).
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://nowoll:nowoll_local_password@localhost:5432/nowoll_worker_test'
