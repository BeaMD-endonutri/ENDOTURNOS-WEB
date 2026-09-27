alter table public.et_tasks
  add column if not exists details text not null default '',
  add column if not exists note_color text not null default 'yellow',
  add column if not exists font_family text not null default 'nunito',
  add column if not exists is_bold boolean not null default false,
  add column if not exists is_italic boolean not null default false,
  add column if not exists is_underline boolean not null default false;

alter table public.et_tasks drop constraint if exists et_tasks_note_color_check;
alter table public.et_tasks add constraint et_tasks_note_color_check
  check (note_color in ('yellow','rose','sage','blue','lavender','cream'));

alter table public.et_tasks drop constraint if exists et_tasks_font_family_check;
alter table public.et_tasks add constraint et_tasks_font_family_check
  check (font_family in ('nunito','dm-sans','fraunces','caveat'));
