import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const TEST_DATABASE_NAME = 'pocketledger_test_db';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for test migrations. Set it to the dedicated pocketledger_test_db connection.',
  );
}

let parsedUrl: URL;
try {
  parsedUrl = new URL(testDatabaseUrl);
} catch {
  throw new Error('TEST_DATABASE_URL is not a valid connection URL.');
}

if (
  parsedUrl.protocol !== 'postgresql:' ||
  parsedUrl.pathname !== `/${TEST_DATABASE_NAME}`
) {
  throw new Error(
    `Refusing to migrate: TEST_DATABASE_URL must target exactly ${TEST_DATABASE_NAME}.`,
  );
}

export default defineConfig({
  schema: './src/infrastructure/database/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: testDatabaseUrl,
  },
});
