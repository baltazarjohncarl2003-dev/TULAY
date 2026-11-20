-- Profile pictures (owner's V2 list, item 9). One public image per account, shown in the workspace bar and account card.

alter table public.profiles
  add column avatar_path text,
  -- A profile may only point at a file in its own folder: avatars/<profile id>/<file>.
  add constraint profiles_avatar_path_own_folder
    check (avatar_path is null or (avatar_path like id::text || '/%' and length(avatar_path) <= 200));

grant update (avatar_path) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']);

-- Public bucket: anyone may read by URL. Writes only into <your user id>/ by an active account.
create policy "avatars: owner uploads" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (select public.is_active_user())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "avatars: owner reads" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: owner deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
