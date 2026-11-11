-- Stage 2 Discovery: catalog search.
-- English full-text (stems plurals: boxes -> box) over title, category, description and supplier keywords,
-- expanded with admin-editable synonyms, plus trigram matching on the title for typos.

create extension if not exists pg_trgm with schema extensions;

-- Stored in both directions, lowercase single words.
create table public.search_synonyms (
  term text not null check (term ~ '^[a-z0-9]{1,40}$'),
  synonym text not null check (synonym ~ '^[a-z0-9]{1,40}$'),
  primary key (term, synonym),
  check (term <> synonym)
);

insert into public.search_synonyms (term, synonym)
select a, b from (values
  ('pouch', 'sachet'), ('box', 'carton'), ('bottle', 'jar'), ('label', 'sticker'), ('cup', 'tub'),
  ('paper', 'kraft'), ('tee', 'shirt'), ('tumbler', 'mug'), ('lanyard', 'id')
) as v (a, b)
union all
select b, a from (values
  ('pouch', 'sachet'), ('box', 'carton'), ('bottle', 'jar'), ('label', 'sticker'), ('cup', 'tub'),
  ('paper', 'kraft'), ('tee', 'shirt'), ('tumbler', 'mug'), ('lanyard', 'id')
) as v (a, b);

revoke all on public.search_synonyms from anon, authenticated;
grant select on public.search_synonyms to anon, authenticated;
alter table public.search_synonyms enable row level security;
create policy "search_synonyms: public" on public.search_synonyms for select to anon, authenticated using (true);

create function public.admin_add_search_synonym(p_term text, p_synonym text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  a text := lower(btrim(coalesce(p_term, '')));
  b text := lower(btrim(coalesce(p_synonym, '')));
begin
  if not public.has_admin_role('verifier') then
    raise exception 'Verifier role with MFA required' using errcode = '42501';
  end if;
  insert into public.search_synonyms (term, synonym) values (a, b), (b, a) on conflict do nothing;
  perform private.audit('search_synonym.add', 'search_synonyms', a || '~' || b);
end $$;

create function public.admin_remove_search_synonym(p_term text, p_synonym text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  a text := lower(btrim(coalesce(p_term, '')));
  b text := lower(btrim(coalesce(p_synonym, '')));
begin
  if not public.has_admin_role('verifier') then
    raise exception 'Verifier role with MFA required' using errcode = '42501';
  end if;
  delete from public.search_synonyms where (term, synonym) in ((a, b), (b, a));
  perform private.audit('search_synonym.remove', 'search_synonyms', a || '~' || b);
end $$;

-- Public product search. Runs as the caller (RLS applies) and only ever returns live listings.
-- Any matching word counts; more and better-placed matches rank higher. A number in the query is read
-- as the wanted quantity, and listings whose MOQ it meets rank a little higher.
-- Sorts: relevance (default), newest, price_asc, price_desc, moq, name. Unknown sorts fall back to newest.
-- shortcut: tsvectors are built per query over every live listing (no index); add a stored, indexed
-- search column once the catalog passes roughly 50k listings or search gets slow.
create function public.search_catalog(
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
  lim integer := least(greatest(coalesce(p_page_size, 12), 1), 60);
  skip integer := (least(greatest(coalesce(p_page, 1), 1), 1000) - 1) * lim;
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
    h.created_at desc, h.id
  limit lim offset skip;
end $$;

revoke execute on function public.admin_add_search_synonym(text, text), public.admin_remove_search_synonym(text, text)
  from public, anon;
grant execute on function public.admin_add_search_synonym(text, text), public.admin_remove_search_synonym(text, text)
  to authenticated;
grant execute on function
  public.search_catalog(text, text, public.listing_type, public.business_type, text, bigint, bigint, integer, text, integer, integer)
  to anon, authenticated;
