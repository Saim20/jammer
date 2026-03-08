-- ============================================================
-- get_weak_words
-- ============================================================
-- Returns words a user has answered incorrectly, ordered by failure count.
-- Powers the personalised "practice weak words" game mode.

create or replace function public.get_weak_words(
  p_user_id   uuid,
  p_limit     integer default 10,
  p_threshold integer default 1   -- min incorrect_count to qualify
) returns table (
  id                 uuid,
  word               text,
  correct_definition text,
  distractors        text[],
  difficulty         integer,
  incorrect_count    integer
) language plpgsql stable security definer set search_path = public as $$
begin
  if p_user_id != auth.uid() then
    raise exception 'Unauthorized';
  end if;

  return query
  select
    w.id,
    w.word,
    w.correct_definition,
    w.distractors,
    w.difficulty,
    uws.incorrect_count
  from public.user_word_stats uws
  join public.words w on w.id = uws.word_id
  where uws.user_id  = p_user_id
    and uws.incorrect_count >= p_threshold
  order by uws.incorrect_count desc, w.difficulty desc
  limit p_limit;
end;
$$;

grant execute on function public.get_weak_words to authenticated;
