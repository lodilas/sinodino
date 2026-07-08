create extension if not exists pgcrypto;
create extension if not exists vector with schema extensions;

create type public.link_status as enum ('pending', 'published', 'archived');
create type public.app_role as enum ('student', 'moderator', 'admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Student:in',
  role public.app_role not null default 'student',
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

create table public.links (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null,
  description text not null,
  category_id uuid not null references public.categories(id) on delete restrict,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  status public.link_status not null default 'pending',
  quality_rating integer check (quality_rating between 1 and 5),
  audience text,
  language text,
  region text,
  resource_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique
);

create table public.link_tags (
  link_id uuid not null references public.links(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (link_id, tag_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.links(id) on delete cascade,
  body text not null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.content_embeddings (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('link', 'comment')),
  source_id uuid not null,
  content text not null,
  embedding extensions.vector(1536),
  created_at timestamptz not null default now()
);

create index links_category_id_idx on public.links(category_id);
create index links_status_idx on public.links(status);
create index comments_link_id_idx on public.comments(link_id);
create index content_embeddings_embedding_idx
  on public.content_embeddings
  using ivfflat (embedding extensions.vector_cosine_ops)
  with (lists = 100);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger links_set_updated_at
before update on public.links
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'user_name', 'Student:in')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_moderator()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('moderator', 'admin')
  );
$$;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.links enable row level security;
alter table public.tags enable row level security;
alter table public.link_tags enable row level security;
alter table public.comments enable row level security;
alter table public.content_embeddings enable row level security;

create policy "Profiles are readable by everyone"
on public.profiles for select
using (true);

create policy "Users can update their own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Categories are readable by everyone"
on public.categories for select
using (true);

create policy "Moderators manage categories"
on public.categories for all
to authenticated
using (public.is_moderator())
with check (public.is_moderator());

create policy "Published links are readable by everyone"
on public.links for select
using (status = 'published' or public.is_moderator() or created_by = auth.uid());

create policy "Authenticated users can submit links"
on public.links for insert
to authenticated
with check (auth.uid() is not null and created_by = auth.uid() and status = 'pending');

create policy "Users can update their pending links"
on public.links for update
to authenticated
using (created_by = auth.uid() and status = 'pending')
with check (created_by = auth.uid() and status = 'pending');

create policy "Moderators manage all links"
on public.links for all
to authenticated
using (public.is_moderator())
with check (public.is_moderator());

create policy "Tags are readable by everyone"
on public.tags for select
using (true);

create policy "Moderators manage tags"
on public.tags for all
to authenticated
using (public.is_moderator())
with check (public.is_moderator());

create policy "Link tags are readable by everyone"
on public.link_tags for select
using (true);

create policy "Moderators manage link tags"
on public.link_tags for all
to authenticated
using (public.is_moderator())
with check (public.is_moderator());

create policy "Comments on visible links are readable"
on public.comments for select
using (
  exists (
    select 1
    from public.links
    where links.id = comments.link_id
      and (links.status = 'published' or links.created_by = auth.uid() or public.is_moderator())
  )
);

create policy "Authenticated users can comment on published links"
on public.comments for insert
to authenticated
with check (
  auth.uid() is not null
  and created_by = auth.uid()
  and exists (
    select 1
    from public.links
    where links.id = comments.link_id
      and links.status = 'published'
  )
);

create policy "Users can update their own comments"
on public.comments for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

create policy "Moderators manage comments"
on public.comments for all
to authenticated
using (public.is_moderator())
with check (public.is_moderator());

create policy "Only moderators read embeddings"
on public.content_embeddings for select
to authenticated
using (public.is_moderator());

create policy "Only moderators manage embeddings"
on public.content_embeddings for all
to authenticated
using (public.is_moderator())
with check (public.is_moderator());

insert into public.categories (name, slug, description, sort_order) values
  ('Politik und Gesellschaft', 'politik-gesellschaft', 'Quellen zu Politik, Gesellschaft und Gegenwart.', 10),
  ('Geschichte', 'geschichte', 'Historische Hintergruende und Quellen.', 20),
  ('Wirtschaft', 'wirtschaft', 'Material zu Wirtschaft, Handel und Entwicklung.', 30),
  ('Kultur und Sprache', 'kultur-sprache', 'Ressourcen zu Kultur, Sprache und Bildung.', 40),
  ('Unterrichtsmaterial', 'unterrichtsmaterial', 'Direkt einsetzbare Materialien fuer Lehrveranstaltungen.', 50);
