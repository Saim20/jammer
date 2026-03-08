-- ============================================================
-- submit_flashcard_review
-- ============================================================
-- Applies the SM-2 algorithm and updates spaced-repetition state
-- + category progress.
--
-- quality scale:
--   0 → complete blackout (forgot)
--   1 → incorrect, but the answer felt familiar
--   2 → incorrect, but the correct answer was easy once seen
--   3 → correct with significant difficulty
--   4 → correct after a hesitation
--   5 → perfect recall, no hesitation

create or replace function public.submit_flashcard_review(
  p_user_id uuid,
  p_word_id uuid,
  p_quality integer  -- 0–5
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_repetitions    integer := 0;
  v_ease_factor    float   := 2.5;
  v_interval_days  integer := 1;
  v_new_ef         float;
  v_new_interval   integer;
  v_new_reps       integer;
  v_difficulty     integer;
  v_category       public.word_category;
  v_is_new         boolean := true;
begin
  if p_user_id != auth.uid() then
    raise exception 'Unauthorized';
  end if;

  -- Derive category from difficulty (no redundant column on words)
  select difficulty into v_difficulty from public.words where id = p_word_id;
  v_category := public.difficulty_to_category(v_difficulty);

  -- Fetch existing SM-2 state (if any)
  select repetitions, ease_factor, interval_days
  into v_repetitions, v_ease_factor, v_interval_days
  from public.flashcard_reviews
  where user_id = p_user_id and word_id = p_word_id;

  v_is_new := not found;

  -- SM-2: update ease factor (always, regardless of pass/fail)
  v_new_ef := v_ease_factor
              + (0.1 - (5 - p_quality) * (0.08 + (5 - p_quality) * 0.02));
  if v_new_ef < 1.3 then v_new_ef := 1.3; end if;

  if p_quality < 3 then
    -- Failed: reset
    v_new_reps     := 0;
    v_new_interval := 1;
  else
    -- Passed: advance schedule
    v_new_reps := v_repetitions + 1;
    if v_repetitions = 0 then
      v_new_interval := 1;
    elsif v_repetitions = 1 then
      v_new_interval := 6;
    else
      v_new_interval := round(v_interval_days * v_new_ef);
    end if;
  end if;

  -- Upsert review record
  insert into public.flashcard_reviews (
    user_id, word_id,
    repetitions, ease_factor, interval_days,
    next_review_at, last_quality, last_reviewed_at
  ) values (
    p_user_id, p_word_id,
    v_new_reps, v_new_ef, v_new_interval,
    now() + (v_new_interval || ' days')::interval,
    p_quality, now()
  )
  on conflict (user_id, word_id) do update set
    repetitions      = v_new_reps,
    ease_factor      = v_new_ef,
    interval_days    = v_new_interval,
    next_review_at   = now() + (v_new_interval || ' days')::interval,
    last_quality     = p_quality,
    last_reviewed_at = now();

  -- Update category progress — every word always belongs to a category
  insert into public.user_category_progress
    (user_id, category, words_seen, words_mastered, last_studied_at)
  values (
    p_user_id, v_category,
    case when v_is_new then 1 else 0 end,
    -- mastered = words with repetitions >= 3 in this category (recomputed)
    (select count(*)
     from public.flashcard_reviews fr2
     join public.words w2 on w2.id = fr2.word_id
     where fr2.user_id = p_user_id
       and fr2.repetitions >= 3
       and public.difficulty_to_category(w2.difficulty) = v_category),
    now()
  )
  on conflict (user_id, category) do update set
    words_seen     = user_category_progress.words_seen
                       + case when v_is_new then 1 else 0 end,
    words_mastered = (
      select count(*)
      from public.flashcard_reviews fr2
      join public.words w2 on w2.id = fr2.word_id
      where fr2.user_id = p_user_id
        and fr2.repetitions >= 3
        and public.difficulty_to_category(w2.difficulty) = v_category
    ),
    last_studied_at = now();
end;
$$;

grant execute on function public.submit_flashcard_review to authenticated;
