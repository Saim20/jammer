-- ============================================================
-- submit_game_session
-- ============================================================
-- Single atomic function for ALL end-of-game persistence:
--   1. Inserts a game_sessions row
--   2. Bulk-inserts session_words rows
--   3. Upserts user_word_stats aggregate counters
--   4. Upserts the leaderboard personal best (never lowers a score)
-- Returns the new session UUID.

create or replace function public.submit_game_session(
  p_user_id   uuid,
  p_score     integer,
  p_max_score integer,
  p_words     jsonb,  -- [{"word_id":"<uuid>","answer_index":0,"time_taken":3}, ...]
  p_type      text    default 'global'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_session_id uuid;
  r            jsonb;
begin
  if p_user_id != auth.uid() then
    raise exception 'Unauthorized';
  end if;

  -- 1. Session record
  insert into public.game_sessions (user_id, score, word_count, max_score, type)
  values (p_user_id, p_score, jsonb_array_length(p_words), p_max_score, p_type)
  returning id into v_session_id;

  -- 2. Per-word results + aggregate stats (single loop, one round-trip per word)
  for r in select * from jsonb_array_elements(p_words) loop
    -- Raw session result (correct is a generated column — derived from answer_index)
    insert into public.session_words (session_id, word_id, answer_index, time_taken)
    values (
      v_session_id,
      (r->>'word_id')::uuid,
      (r->>'answer_index')::smallint,
      (r->>'time_taken')::integer
    );

    -- Aggregate counters (derive correctness from answer_index = 0)
    insert into public.user_word_stats
      (user_id, word_id, correct_count, incorrect_count, last_seen_at, last_correct)
    values (
      p_user_id,
      (r->>'word_id')::uuid,
      case when (r->>'answer_index')::smallint = 0 then 1 else 0 end,
      case when (r->>'answer_index')::smallint = 0 then 0 else 1 end,
      now(),
      coalesce((r->>'answer_index')::smallint = 0, false)
    )
    on conflict (user_id, word_id) do update set
      correct_count   = user_word_stats.correct_count
                          + case when (r->>'answer_index')::smallint = 0 then 1 else 0 end,
      incorrect_count = user_word_stats.incorrect_count
                          + case when (r->>'answer_index')::smallint = 0 then 0 else 1 end,
      last_seen_at    = now(),
      last_correct    = coalesce((r->>'answer_index')::smallint = 0, false);
  end loop;

  -- 3. Leaderboard personal best (never lower the score)
  insert into public.leaderboard (user_id, score, type)
  values (p_user_id, p_score, p_type)
  on conflict (user_id, type) do update set
    score      = greatest(leaderboard.score, excluded.score),
    created_at = case
      when excluded.score > leaderboard.score then now()
      else leaderboard.created_at
    end;

  return v_session_id;
end;
$$;

grant execute on function public.submit_game_session to authenticated;
