import '@testing-library/jest-dom/vitest';
import { loadEnv } from '../server/src/config/env';

loadEnv();

// The server logs JSON lines during integration tests; keep test output quiet
// unless a test explicitly asks for logs.
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'error';
process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? 'test-session-secret-not-for-production';
process.env.NODE_ENV = 'test';
