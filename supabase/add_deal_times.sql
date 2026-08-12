-- Deal time-of-day support, plus removal of three columns the UI never used.
--
-- RUN THIS BEFORE DEPLOYING the matching frontend change. The post form now
-- writes start_time/end_time, so posting a deal will fail until these columns
-- exist.

-- 1. When during the day the deal runs.
--    end_time stays nullable: plenty of deals run "from 9pm until they sell out".
alter table public.deals add column if not exists start_time time;
alter table public.deals add column if not exists end_time   time;

-- 2. Drop the dead columns.
--    - category was never written by the post form or the insert; it rendered
--      as an empty badge.
--    - distance and hours were hardcoded at insert time to the constants
--      "near you" and "See description", identical on every row.
alter table public.deals drop column if exists category;
alter table public.deals drop column if exists distance;
alter table public.deals drop column if exists hours;
