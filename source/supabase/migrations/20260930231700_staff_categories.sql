alter table public.et_staff
  add column if not exists category text not null default 'nursing';

alter table public.et_staff
  drop constraint if exists et_staff_category_check;

alter table public.et_staff
  add constraint et_staff_category_check
  check (category = any (array[
    'nursing'::text,
    'tcae'::text,
    'administrative'::text,
    'endocrinology'::text
  ]));

comment on column public.et_staff.category is
  'Professional collective: nursing, tcae, administrative, endocrinology.';
