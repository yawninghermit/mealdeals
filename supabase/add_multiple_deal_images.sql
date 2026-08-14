-- Multiple photos per deal.
--
-- RUN THIS BEFORE DEPLOYING the matching client change. The new client writes
-- `image_urls` on every insert/update, so it will error with "column
-- image_urls does not exist" until this migration is applied. The old client
-- is unaffected by this migration, so applying it early is safe — the window
-- between running this and deploying is harmless.

-- 1. Add the array column. Defaults to an empty array so existing rows and
--    any in-flight writes from the old client stay valid.
alter table public.deals
  add column if not exists image_urls text[] not null default '{}';

-- 2. Backfill: every deal that already has a single photo gets a one-element
--    array, so nothing has to special-case "old deal vs new deal" at read time.
update public.deals
   set image_urls = array[image_url]
 where image_url is not null
   and image_url <> ''
   and cardinality(image_urls) = 0;

-- 3. Cap the array server-side. The client limits to 5 photos, but the client
--    is not a security boundary — without this, anyone posting through the API
--    directly could attach 10,000 URLs to a deal.
alter table public.deals
  drop constraint if exists deals_image_urls_max;
alter table public.deals
  add constraint deals_image_urls_max check (cardinality(image_urls) <= 5);

-- `image_url` is deliberately NOT dropped. It stays as the cover photo,
-- mirrored from image_urls[1] by the client on every write, because
-- middleware.js reads it directly to build the og:image tag for link previews
-- and any already-shared link would lose its unfurl image otherwise.
--
-- Verify:
--   select id, image_url, image_urls from public.deals order by created_at desc limit 10;
-- Every row with a photo should show image_url equal to image_urls[1].
