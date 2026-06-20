// Global test setup: satisfy env validation so importing @sai/shared doesn't throw.
// The env schema parses process.env at IMPORT time, so without these any test that
// (even transitively) imports env would crash before running. These are fake-but-
// valid fixtures — no real DB or API is contacted.
//
// IMPORTANT: this only neutralizes the env-validation crash. The real @sai/shared
// module stays intact, so individual tests can still override specific pieces
// (e.g. guardrails.test.ts mocks getDb to avoid a real DB write) AND future
// integration tests can use the real getDb against a test database.
process.env.DATABASE_URL          = 'postgresql://localhost:5432/test';
process.env.ANTHROPIC_API_KEY     = 'sk-ant-not-a-real-key';
process.env.VOYAGE_API_KEY        = 'pa-not-a-real-key';
process.env.STRIPE_SECRET_KEY     = 'sk_test_not_a_real_key';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_not_a_real_secret';
process.env.JWT_SECRET            = 'not-a-real-jwt-secret-32chars-min';
process.env.API_KEY               = 'not-a-real-api-key-32-chars-minimum!';
process.env.ALLOWED_ORIGINS       = 'http://localhost:5173';
process.env.NODE_ENV              = 'test';