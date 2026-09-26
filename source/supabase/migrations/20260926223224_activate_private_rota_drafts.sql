alter policy "team views full rota" on public.et_assignments to authenticated using ((select et_private.is_supervisor()));
