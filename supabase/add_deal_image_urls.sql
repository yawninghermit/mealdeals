-- Multi-photo support: up to 5 photos per deal.
--
-- RUN THIS BEFORE DEPLOYING the matching frontend change. Both write paths now
-- send image_urls, so posting and editing will fail until the column exists.

-- Ordered list of photo URLs. The first entry is the cover shown in the feed.
alter table public.deals add column if not exists image_urls text[] not null default '{}';

-- Backfill existing single-photo deals so nothing loses its picture.
update public.deals
   set image_urls = array[image_url]
 where image_url is not null
   and coalesce(array_length(image_urls, 1), 0) = 0;

-- image_url is deliberately kept, still written as the first photo. Anything
-- reading a deal's single representative image (share previews, older clients)
-- keeps working, and it costs one text column.

-- Cap the array server-side so the limit doesn't depend on the client behaving.
alter table public.deals drop constraint if exists deals_image_urls_max;
alter table public.deals add constraint deals_image_urls_max
  check (coalesce(array_length(image_urls, 1), 0) <= 5);
