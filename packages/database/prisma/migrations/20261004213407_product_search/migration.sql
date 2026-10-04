-- =============================================================================
-- Product full-text search
-- =============================================================================
--
-- `search_vector` is a GENERATED column: Postgres recomputes it automatically
-- whenever name, tags or description change. Our code never writes it.
--
-- Weights rank where a word was found: A (name) > B (tags) > C (description),
-- so a search for "shirt" lists products NAMED "shirt" before products that
-- merely mention shirts in their description.
--
-- 'english' applies stemming ("shirts" → "shirt", "printed" → "print"), so
-- customers don't have to type the exact word form.
-- =============================================================================

-- Generated columns may only use IMMUTABLE functions (same input → same output,
-- forever). array_to_string is marked STABLE in Postgres for generic arrays,
-- although for text[] it is effectively immutable — so we wrap it.
CREATE FUNCTION "nowoll_tags_to_text"(text[]) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$ SELECT array_to_string($1, ' ') $$;

ALTER TABLE "products" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("nowoll_tags_to_text"("tags"), '')), 'B') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'C')
  ) STORED;

-- GIN index: an "inverted index" (word → list of products), the standard
-- index type for full-text search. Keeps searching fast as the catalog grows.
CREATE INDEX "products_search_vector_idx" ON "products" USING GIN ("search_vector");
