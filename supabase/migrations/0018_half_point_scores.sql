-- Individual scores keep their half point (72.5) instead of rounding up to
-- 73, matching calcScore in src/movieUI.jsx. The Hitflix score (0015) still
-- comes back as a whole number: round(avg(r.score)) now averages the exact
-- scores, so it's no longer nudged up by every rounded .5.
--
-- A generated column's expression can't be altered in place, so score is
-- dropped and added back; Postgres fills it in for every existing review.
-- Nothing depends on the column (hitflix_scores reads it by name at run time).

alter table public.reviews drop column score;

alter table public.reviews add column score numeric(4, 1) generated always as (
  ((writing + performance + visuals + audio) * 5 + overall * 10) / 2.0
) stored;
