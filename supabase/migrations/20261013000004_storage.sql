-- =====================================================================
-- Hausgrado · arquivos (fotos e vídeos das O.S.)
-- Bucket privado "os-media". Caminho obrigatório: {shop_id}/{service_order_id}/{arquivo}
-- O app mostra os arquivos com URLs assinadas (expiram), nunca públicas.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('os-media', 'os-media', false, 52428800,   -- 50 MB por arquivo (vídeos curtos)
        array['image/jpeg','image/png','image/webp','image/heic','video/mp4','video/quicktime','video/webm'])
on conflict (id) do nothing;

create policy os_media_select on storage.objects for select to authenticated
  using (bucket_id = 'os-media' and (storage.foldername(name))[1] = public.current_shop_id()::text);

create policy os_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'os-media' and (storage.foldername(name))[1] = public.current_shop_id()::text);

create policy os_media_update on storage.objects for update to authenticated
  using (bucket_id = 'os-media' and (storage.foldername(name))[1] = public.current_shop_id()::text);

create policy os_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'os-media' and (storage.foldername(name))[1] = public.current_shop_id()::text);
