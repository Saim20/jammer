-- ============================================================
-- EXTENSIONS
-- ============================================================

-- Vector similarity search for word embeddings and AI agent features
create extension if not exists vector;

-- Trigram index for fast fuzzy word search in the admin panel
create extension if not exists pg_trgm;
