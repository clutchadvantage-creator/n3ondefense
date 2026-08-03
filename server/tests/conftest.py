import os

os.environ.setdefault('N3ON_DATABASE_URL', 'postgresql+psycopg://unused:unused@127.0.0.1:5432/unused')
os.environ.setdefault('N3ON_JWT_SECRET', 'test-jwt-secret-that-is-at-least-thirty-two-bytes')
os.environ.setdefault('N3ON_RUN_SEED_SECRET', 'test-seed-secret-that-is-at-least-thirty-two-bytes')
os.environ.setdefault('N3ON_ADMIN_API_KEY', 'test-admin-secret-that-is-long-enough')
