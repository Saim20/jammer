-- ============================================================
-- match_words
-- ============================================================
-- Vector cosine similarity search for AI agents.
-- Query with an embedding to find semantically related words.
-- Words without an embedding are excluded.
--
-- Embeddings are generated via Google Gemini gemini-embedding-001
-- with outputDimensionality=1536 and taskType=RETRIEVAL_QUERY.

create or replace function public.match_words(
  query_embedding vector(1536),
  match_threshold float   default 0.5,
  match_count     integer default 10
) returns table (
  id                 uuid,
  word               text,
  correct_definition text,
  difficulty         integer,
  similarity         float
) language plpgsql stable security definer set search_path = public as $$
begin
  return query
  select
    w.id,
    w.word,
    w.correct_definition,
    w.difficulty,
    1 - (w.embedding <=> query_embedding) as similarity
  from public.words w
  where w.embedding is not null
    and 1 - (w.embedding <=> query_embedding) > match_threshold
  order by w.embedding <=> query_embedding
  limit match_count;
end;
$$;

grant execute on function public.match_words to authenticated;
