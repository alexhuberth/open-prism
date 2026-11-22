-- Allow 'text' file type used by ProjectFileType ('tex' | 'text' | 'image' | 'binary')
alter table public.project_files
  drop constraint if exists project_files_type_check;

alter table public.project_files
  add constraint project_files_type_check
  check (type in ('tex', 'text', 'bib', 'cls', 'sty', 'image', 'binary'));
