-- Public request board: a buyer can post an approved RFQ where any verified supplier can see it and ask to quote.
-- Readers never touch public.rfqs directly (its RLS stays buyer / invited supplier / support); they go through
-- list_board_requests, which returns only safe columns. Responding creates an ordinary invite, so the existing
-- quote, counter-offer and selection flow runs unchanged.

alter table public.rfqs add column public_board boolean not null default false;
create index rfqs_board_idx on public.rfqs (created_at desc) where public_board;

-- An RFQ is on the board while it is approved, open, not past its date and has room for more active invites.
create function private.on_board(r public.rfqs) returns boolean
language sql stable security definer set search_path = '' as $$
  select r.public_board
    and r.status in ('matching', 'invited', 'quoting')
    and (r.required_by is null or r.required_by >= private.manila_today())
    and (select count(*) from public.rfq_invites i where i.rfq_id = r.id and i.status <> 'declined')
        < private.setting_int('rfq_max_invites');
$$;

-- Buyer: put an own request on the board or take it off, any time before a supplier is selected.
-- It shows only after TULAY approves it (private.on_board).
create function public.set_rfq_board(p_rfq_id uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  r public.rfqs;
begin
  select * into r from public.rfqs where id = p_rfq_id and buyer_id = uid for update;
  if r.id is null then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if r.status in ('supplier_selected', 'cancelled') then
    raise exception 'This request is closed' using errcode = '22023';
  end if;
  if r.public_board = coalesce(p_on, false) then
    return; -- already so: a retry or double click
  end if;
  update public.rfqs set public_board = coalesce(p_on, false) where id = p_rfq_id;
  perform private.audit(case when p_on then 'rfq.board_on' else 'rfq.board_off' end, 'rfqs', p_rfq_id::text);
end $$;

-- Anyone, signed in or not: open board requests, newest first, 24 per page. No buyer identity, budget or specs.
-- already_responded is true when the caller's supplier already has an invite on it (null when signed out).
create function public.list_board_requests(p_page integer default 1)
returns table (
  id uuid, ref text, product text, category_slug text, category_name text, description text,
  quantity integer, unit public.product_unit, province text, required_by date, created_at timestamptz,
  already_responded boolean, total bigint
)
language sql stable security definer set search_path = '' as $$
  select r.id, r.ref, r.product, c.slug, c.name, left(r.description, 300),
    r.quantity, r.unit, r.province, r.required_by, r.submitted_at,
    case when auth.uid() is null then null
         else exists (select 1 from public.rfq_invites i where i.rfq_id = r.id and i.supplier_id = public.my_supplier_id()) end,
    count(*) over ()
  from public.rfqs r
  left join public.categories c on c.id = r.category_id
  where private.on_board(r)
  order by r.submitted_at desc nulls last, r.id
  limit 24 offset (greatest(coalesce(p_page, 1), 1) - 1) * 24;
$$;

-- Verified supplier: ask to quote on a board request. Idempotent (a second call returns false and changes nothing).
-- private.invite refuses unverified suppliers and the buyer's own supplier account, and notifies the supplier.
create function public.respond_to_board_request(p_rfq_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  sid uuid;
  r public.rfqs;
  added boolean;
begin
  select id into sid from public.suppliers where owner_id = uid and status = 'verified';
  if sid is null then
    raise exception 'Only verified suppliers can quote. Apply to sell on TULAY first.' using errcode = '42501';
  end if;
  select * into r from public.rfqs where id = p_rfq_id for update;
  if r.id is null then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.rfq_invites where rfq_id = p_rfq_id and supplier_id = sid) then
    return false;
  end if;
  if not private.on_board(r) then
    raise exception 'This request is no longer open on the board' using errcode = '22023';
  end if;
  added := private.invite(p_rfq_id, sid, false);
  if added then
    if r.status = 'matching' then
      perform private.set_rfq_status(p_rfq_id, 'matching', 'invited', 'Supplier joined from the request board');
    end if;
    perform private.notify(r.buyer_id, 'A supplier wants to quote',
      'A verified supplier asked to quote on ' || r.ref || ': ' || r.product || '.', '/buyer/rfqs/' || r.id);
    perform private.audit('rfq.board_respond', 'rfqs', p_rfq_id::text, jsonb_build_object('supplier_id', sid));
  end if;
  return added;
end $$;

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function
  public.set_rfq_board(uuid, boolean),
  public.list_board_requests(integer),
  public.respond_to_board_request(uuid)
  from public, anon;
grant execute on function public.list_board_requests(integer) to anon, authenticated;
grant execute on function public.set_rfq_board(uuid, boolean), public.respond_to_board_request(uuid) to authenticated;
