-- Abuse limits from the security audit (findings 5 and 7): a per-account cap on chat messages, and a cap on how
-- many files one upload folder can hold. Both numbers are admin settings.

insert into public.platform_settings (key, value, description) values
  ('chat_messages_per_minute', '20', 'Chat messages one account can send per minute, across all conversations.'),
  ('upload_max_files_per_folder', '50', 'Most files one upload folder can hold: an order''s artwork, its proofs or its claim photos, a listing''s images, or a supplier''s documents.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------- chat message rate

create index rfq_messages_sender_idx on public.rfq_messages (sender_id, created_at);
create index direct_messages_sender_idx on public.direct_messages (sender_id, created_at);

-- Runs before a typed message is stored, whichever function sends it. Offers are left out (see the trigger
-- below): they are money steps with their own rules and must not fail on a chat limit.
create function private.check_message_rate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.rfq_messages where sender_id = new.sender_id and created_at > now() - interval '1 minute')
     + (select count(*) from public.direct_messages where sender_id = new.sender_id and created_at > now() - interval '1 minute')
     >= coalesce(private.setting_int('chat_messages_per_minute'), 20) then
    raise exception 'You are sending messages too fast. Wait a minute and try again.' using errcode = '22023';
  end if;
  return new;
end $$;

create trigger rfq_messages_rate before insert on public.rfq_messages
  for each row execute function private.check_message_rate();
create trigger direct_messages_rate before insert on public.direct_messages
  for each row when (new.kind in ('text', 'rfq')) execute function private.check_message_rate();

-- ---------------------------------------------------------------- upload folder caps

-- True while an upload folder holds fewer files than the admin setting allows. Security definer: a subquery on
-- storage.objects inside its own insert policy would recurse through the select policies (as my_avatar_file_count).
create function public.upload_folder_has_room(p_bucket text, p_folder text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select count(*) from storage.objects o where o.bucket_id = p_bucket and starts_with(o.name, p_folder || '/'))
    < coalesce(private.setting_int('upload_max_files_per_folder'), 50);
$$;
revoke execute on function public.upload_folder_has_room(text, text) from public, anon;
grant execute on function public.upload_folder_has_room(text, text) to authenticated;

-- The five upload policies again, each with the folder cap added as its last condition.
drop policy "supplier-documents: owner uploads" on storage.objects;
create policy "supplier-documents: owner uploads" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'supplier-documents'
    and (select public.is_active_user())
    and exists (
      select 1 from public.suppliers s
      where s.id::text = (storage.foldername(name))[1] and s.owner_id = (select auth.uid())
    )
    and public.upload_folder_has_room('supplier-documents', (storage.foldername(name))[1])
  );

drop policy "product-media: owner uploads" on storage.objects;
create policy "product-media: owner uploads" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-media'
    and (select public.is_active_user())
    and exists (
      select 1 from public.products p join public.suppliers s on s.id = p.supplier_id
      where s.id::text = (storage.foldername(name))[1] and p.id::text = (storage.foldername(name))[2]
        and s.owner_id = (select auth.uid()) and s.status = 'verified'
    )
    and public.upload_folder_has_room('product-media', (storage.foldername(name))[1] || '/' || (storage.foldername(name))[2])
  );

drop policy "order-files: buyer uploads artwork" on storage.objects;
create policy "order-files: buyer uploads artwork" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'order-files' and (storage.foldername(name))[2] = 'artwork' and (select public.is_active_user())
    and exists (select 1 from public.orders o where o.id::text = (storage.foldername(name))[1] and o.buyer_id = (select auth.uid()))
    and public.upload_folder_has_room('order-files', (storage.foldername(name))[1] || '/artwork')
  );

drop policy "order-files: buyer uploads claim evidence" on storage.objects;
create policy "order-files: buyer uploads claim evidence" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'order-files' and (storage.foldername(name))[2] = 'claims' and (select public.is_active_user())
    and exists (select 1 from public.orders o where o.id::text = (storage.foldername(name))[1] and o.buyer_id = (select auth.uid()))
    and public.upload_folder_has_room('order-files', (storage.foldername(name))[1] || '/claims')
  );

drop policy "order-files: supplier uploads proofs" on storage.objects;
create policy "order-files: supplier uploads proofs" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'order-files' and (storage.foldername(name))[2] = 'proofs' and (select public.is_active_user())
    and exists (select 1 from public.orders o join public.suppliers s on s.id = o.supplier_id
                where o.id::text = (storage.foldername(name))[1] and o.paid_at is not null
                  and s.owner_id = (select auth.uid()) and s.status = 'verified')
    and public.upload_folder_has_room('order-files', (storage.foldername(name))[1] || '/proofs')
  );

revoke execute on all functions in schema private from public, anon, authenticated;
