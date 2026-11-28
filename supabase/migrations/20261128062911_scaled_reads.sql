-- Reads that stay small as data grows (speed audit 2026-11-28). Read-only functions, no table, index or policy
-- changes. All run as the caller (security invoker), so the existing RLS decides what each person sees.

-- ---------------------------------------------------------------- catalog search

-- The search words of a catalog query, with admin synonyms, as one tsquery (null = no searchable word).
-- Shared by search_catalog and search_catalog_supplier_ids so both match the same listings.
create function public.catalog_tsquery(p_query text) returns tsquery
language plpgsql stable set search_path = '' as $$
declare
  qtext text := left(btrim(coalesce(p_query, '')), 200);
  q tsquery;
  part tsquery;
  w text;
  syn text;
begin
  for w in
    select distinct m[1] from regexp_matches(lower(qtext), '[a-z0-9]+', 'g') as m where m[1] !~ '^[0-9]+$' limit 12
  loop
    part := plainto_tsquery('english', w);
    continue when numnode(part) = 0; -- stop word
    for syn in select s.synonym from public.search_synonyms s where plainto_tsquery('english', s.term) = plainto_tsquery('english', w) loop
      if numnode(plainto_tsquery('english', syn)) > 0 then
        part := part || plainto_tsquery('english', syn);
      end if;
    end loop;
    q := case when q is null then part else q || part end;
  end loop;
  return q;
end $$;

-- Same as before, with the query words from catalog_tsquery and an "oldest" sort.
create or replace function public.search_catalog(
  p_query text default '',
  p_category_slug text default null,
  p_listing_type public.listing_type default null,
  p_business_type public.business_type default null,
  p_province text default null,
  p_min_price_centavos bigint default null,
  p_max_price_centavos bigint default null,
  p_max_moq integer default null,
  p_sort text default 'relevance',
  p_page integer default 1,
  p_page_size integer default 12
) returns table (product_id uuid, score real, total_count bigint)
language plpgsql stable set search_path = '' as $$
declare
  qtext text := left(btrim(coalesce(p_query, '')), 200);
  qty integer := substring(replace(qtext, ',', '') from '[0-9]{1,9}')::integer;
  lim integer := least(greatest(coalesce(p_page_size, 12), 1), 500);
  skip integer := (least(greatest(coalesce(p_page, 1), 1), 1000) - 1) * lim;
  q tsquery := public.catalog_tsquery(qtext);
begin
  return query
  with recursive cats as (
    select c.id from public.categories c where c.slug = p_category_slug
    union all
    select c.id from public.categories c join cats on c.parent_id = cats.id
  ),
  hits as (
    select p.id, p.created_at, p.indicative_price_centavos as price, p.moq, p.title,
      case when qtext = '' then 0 else
        (case when q is null then 0 else ts_rank(d.doc, q) end)
        + extensions.word_similarity(qtext, p.title)
        + (case when qty is not null and qty >= p.moq then 0.1 else 0 end)
      end::real as rank_score
    from public.products p
    join public.suppliers s on s.id = p.supplier_id
    join public.categories c on c.id = p.category_id
    cross join lateral (
      select setweight(to_tsvector('english', p.title), 'A')
          || setweight(to_tsvector('english', c.name), 'B')
          || setweight(to_tsvector('english', p.description), 'C')
          || setweight(to_tsvector('english', s.keywords), 'D') as doc
    ) d
    where p.status = 'approved' and s.status = 'verified'
      and (p_category_slug is null or p.category_id in (select cats.id from cats))
      and (p_listing_type is null or p.listing_type = p_listing_type)
      and (p_business_type is null or s.business_type = p_business_type)
      and (p_province is null or s.province = p_province)
      and (p_min_price_centavos is null or p.indicative_price_centavos >= p_min_price_centavos)
      and (p_max_price_centavos is null or p.indicative_price_centavos <= p_max_price_centavos)
      and (p_max_moq is null or p.moq <= p_max_moq)
      and (
        qtext = ''
        or (q is not null and d.doc @@ q)
        or extensions.word_similarity(qtext, p.title) >= 0.5
      )
  )
  select h.id, h.rank_score, count(*) over ()
  from hits h
  order by
    case when p_sort = 'price_asc' then h.price end asc nulls last,
    case when p_sort = 'price_desc' then h.price end desc nulls last,
    case when p_sort = 'moq' then h.moq end asc,
    case when p_sort = 'name' then h.title end asc,
    case when p_sort = 'relevance' then h.rank_score end desc,
    case when p_sort = 'oldest' then h.created_at end asc,
    h.created_at desc, h.id
  limit lim offset skip;
end $$;

-- Suppliers with at least one live listing matching the query (the marketplace Suppliers tab). One array, so
-- the API row limit does not apply. The match is search_catalog's text condition.
create function public.search_catalog_supplier_ids(p_query text) returns uuid[]
language sql stable set search_path = '' as $$
  with params as (select left(btrim(coalesce(p_query, '')), 200) as qtext, public.catalog_tsquery(p_query) as q)
  select coalesce(array_agg(distinct p.supplier_id), '{}')
  from params
  cross join public.products p
  join public.suppliers s on s.id = p.supplier_id
  join public.categories c on c.id = p.category_id
  where params.qtext <> '' and p.status = 'approved' and s.status = 'verified'
    and (
      (params.q is not null and (
        setweight(to_tsvector('english', p.title), 'A')
        || setweight(to_tsvector('english', c.name), 'B')
        || setweight(to_tsvector('english', p.description), 'C')
        || setweight(to_tsvector('english', s.keywords), 'D')) @@ params.q)
      or extensions.word_similarity(params.qtext, p.title) >= 0.5
    );
$$;

-- Live listing counts per category, whether any service is live, and each verified supplier's 4 newest
-- listings as tiles. One JSON value, so the API row limit does not apply.
create function public.catalog_overview() returns jsonb
language sql stable set search_path = '' as $$
  with live as (
    select p.id, p.supplier_id, p.title, p.listing_type, p.indicative_price_centavos, p.moq, p.unit, c.slug,
      row_number() over (partition by p.supplier_id order by p.created_at desc, p.id) as n
    from public.products p
    join public.suppliers s on s.id = p.supplier_id
    join public.categories c on c.id = p.category_id
    where p.status = 'approved' and s.status = 'verified'
  )
  select jsonb_build_object(
    'categories', coalesce((select jsonb_object_agg(x.slug, x.n) from (select slug, count(*) as n from live group by slug) x), '{}'),
    'has_services', exists (select 1 from live where listing_type = 'service'),
    'tiles', coalesce((
      select jsonb_object_agg(t.supplier_id, t.tiles)
      from (
        select l.supplier_id, jsonb_agg(jsonb_build_object(
          'id', l.id,
          'title', l.title,
          'category_slug', l.slug,
          'price_centavos', l.indicative_price_centavos,
          'moq', l.moq,
          'unit', l.unit,
          'image_path', (select m.storage_path from public.product_media m where m.product_id = l.id order by m.sort_order limit 1)
        ) order by l.n) as tiles
        from live l
        where l.n <= 4
        group by l.supplier_id
      ) t
    ), '{}')
  );
$$;

grant execute on function public.catalog_tsquery(text), public.search_catalog_supplier_ids(text), public.catalog_overview()
  to anon, authenticated;

-- ---------------------------------------------------------------- chats

-- The caller's chats, one row each, newest activity first: direct conversations and RFQ threads (one per
-- invited, not declined, supplier). Unread = the other party wrote after the caller's chat_reads marker.
-- Keyset paging: pass the last row's (coalesce(last_at, '-infinity'), id) as p_before_at, p_before_id.
create function public.chat_inbox(
  p_before_at timestamptz default null,
  p_before_id text default null,
  p_limit integer default 100,
  p_unread_only boolean default false
) returns table (
  id text, kind text, side text, name text, subtitle text, conversation_id uuid, rfq_id uuid, supplier_id uuid,
  closed boolean, unread boolean, last_at timestamptz, last_body text, negotiation boolean
)
language sql stable set search_path = '' as $$
  with me as (select auth.uid() as uid, public.my_supplier_id() as sid),
  chats as (
    select c.id::text as id, 'direct'::text as kind,
      case when c.buyer_id = me.uid then 'buyer' else 'supplier' end as side,
      case when c.buyer_id = me.uid then coalesce(s.business_name, 'Supplier') else c.buyer_name end as name,
      ''::text as subtitle, c.id as conversation_id, null::uuid as rfq_id, c.supplier_id, false as closed,
      exists (
        select 1 from public.direct_messages m
        where m.conversation_id = c.id and m.sender_id <> me.uid
          and m.created_at > coalesce((select r.last_read_at from public.chat_reads r where r.thread_id = c.id::text), '-infinity')
      ) as unread,
      coalesce(lm.created_at, c.last_message_at) as last_at, lm.body as last_body,
      exists (select 1 from public.chat_offers o where o.conversation_id = c.id)
        or exists (select 1 from public.direct_messages m where m.conversation_id = c.id and m.kind = 'rfq') as negotiation
    from public.direct_conversations c
    cross join me
    left join public.suppliers s on s.id = c.supplier_id
    left join lateral (
      select m.created_at, m.body from public.direct_messages m
      where m.conversation_id = c.id order by m.created_at desc, m.id desc limit 1
    ) lm on true
    where c.buyer_id = me.uid or c.supplier_id = me.sid
    union all
    select r.id::text || ':' || i.supplier_id::text, 'rfq',
      case when r.buyer_id = me.uid then 'buyer' else 'supplier' end,
      -- Buyers stay anonymous to suppliers in RFQ threads.
      case when r.buyer_id = me.uid then coalesce(s.business_name, 'Supplier') else 'Buyer · ' || r.ref end,
      r.ref || ' · ' || r.product, null, r.id, i.supplier_id,
      r.status = 'cancelled', -- matches send_rfq_message
      exists (
        select 1 from public.rfq_messages m
        where m.rfq_id = r.id and m.supplier_id = i.supplier_id and m.sender_id <> me.uid
          and m.created_at > coalesce(
            (select rd.last_read_at from public.chat_reads rd where rd.thread_id = r.id::text || ':' || i.supplier_id::text),
            '-infinity')
      ),
      lm.created_at, lm.body, true
    from public.rfq_invites i
    join public.rfqs r on r.id = i.rfq_id
    cross join me
    left join public.suppliers s on s.id = i.supplier_id
    left join lateral (
      select m.created_at, m.body from public.rfq_messages m
      where m.rfq_id = r.id and m.supplier_id = i.supplier_id order by m.created_at desc, m.id desc limit 1
    ) lm on true
    where i.status <> 'declined' and (r.buyer_id = me.uid or i.supplier_id = me.sid)
  )
  select ch.* from chats ch
  where (not p_unread_only or ch.unread)
    and (p_before_at is null or (coalesce(ch.last_at, '-infinity'), ch.id) < (p_before_at, p_before_id))
  order by coalesce(ch.last_at, '-infinity') desc, ch.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

-- Unread chats for the header badge, counted up to 100 (the badge shows 99+).
create function public.chat_unread_count() returns integer
language sql stable set search_path = '' as $$
  select count(*)::integer from public.chat_inbox(null, null, 100, true);
$$;

revoke execute on function public.chat_inbox(timestamptz, text, integer, boolean), public.chat_unread_count() from public, anon;
grant execute on function public.chat_inbox(timestamptz, text, integer, boolean), public.chat_unread_count() to authenticated;

-- ---------------------------------------------------------------- deal counts

-- All-time counts for the dashboard tiles, for the caller's buying and selling side.
-- buyer_latest_quotes counts one quote per RFQ and supplier (the latest revision), like latestQuotesOf.
create function public.deal_counts() returns jsonb
language sql stable set search_path = '' as $$
  with me as (select auth.uid() as uid, public.my_supplier_id() as sid)
  select jsonb_build_object(
    'buyer_rfqs', (select count(*) from public.rfqs r join me on r.buyer_id = me.uid),
    'buyer_open_rfqs', (
      select count(*) from public.rfqs r join me on r.buyer_id = me.uid
      where r.status not in ('draft', 'supplier_selected', 'cancelled')
    ),
    'buyer_quotes', (select count(*) from public.quotes q join public.rfqs r on r.id = q.rfq_id join me on r.buyer_id = me.uid),
    'buyer_latest_quotes', (
      select count(distinct (q.rfq_id, q.supplier_id)) from public.quotes q join public.rfqs r on r.id = q.rfq_id join me on r.buyer_id = me.uid
    ),
    'buyer_selections', (select count(*) from public.selections s join me on s.buyer_id = me.uid),
    'supplier_invites', (select count(*) from public.rfq_invites i join me on i.supplier_id = me.sid),
    'supplier_quotes', (select count(*) from public.quotes q join me on q.supplier_id = me.sid),
    'supplier_selections', (select count(*) from public.selections s join me on s.supplier_id = me.sid)
  );
$$;

revoke execute on function public.deal_counts() from public, anon;
grant execute on function public.deal_counts() to authenticated;
