alter table public.et_staff
  drop constraint if exists et_staff_mascot_key_check;

alter table public.et_staff
  add constraint et_staff_mascot_key_check
  check (mascot_key = any (array[
    'apple'::text,
    'flame'::text,
    'puffin'::text,
    'worm'::text,
    'cat'::text,
    'llama'::text,
    'glucometer'::text,
    'pineapple'::text,
    'dumbbell'::text,
    'yogurt'::text,
    'toast'::text,
    'avocado'::text,
    'egg'::text,
    'turnip'::text,
    'thyroid'::text,
    'broccoli'::text,
    'strawberry'::text,
    'measuring_tape'::text
  ]));
