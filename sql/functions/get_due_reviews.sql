-- ============================================================
-- get_due_reviews
-- ============================================================
-- Returns cards whose review interval has expired, oldest-due first.
-- category is derived from difficulty via difficulty_to_category().

create or replace function public.get_due_reviews(
  p_user_id uuid,
  p_limit   integer default 20
) returns table (
  id               uuid,
  word             text,
  correct_definition text,
  distractors      text[],
  difficulty       integer,
  category         public.word_category,
  set_id           uuid,
  repetitions      integer,
  ease_factor      float,
  interval_days    integer,
  next_review_at   timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  if p_user_id != auth.uid() then
    raise exception 'Unauthorized';
  end if;

  return query
  select
    w.id, w.word, w.correct_definition, w.distractors, w.difficulty,
    public.difficulty_to_category(w.difficulty),
    w.set_id,
    fr.repetitions, fr.ease_factor, fr.interval_days, fr.next_review_at
  from public.flashcard_reviews fr
  join public.words w on w.id = fr.word_id
  where fr.user_id = p_user_id
    and fr.next_review_at <= now()
  order by fr.next_review_at asc
  limit p_limit;
end;
$$;

grant execute on function public.get_due_reviews to authenticated;
