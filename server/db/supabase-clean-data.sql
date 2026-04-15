begin;

delete from public.attachments;
delete from public.page_history;
delete from public.pages;
delete from public.sections;
delete from public.notebooks;
delete from public.subjects;
delete from public.daily_stats;
delete from public.study_sessions;
delete from public.users;

commit;

select 'attachments' as tabela, count(*) as total from public.attachments
union all
select 'page_history' as tabela, count(*) as total from public.page_history
union all
select 'pages' as tabela, count(*) as total from public.pages
union all
select 'sections' as tabela, count(*) as total from public.sections
union all
select 'notebooks' as tabela, count(*) as total from public.notebooks
union all
select 'subjects' as tabela, count(*) as total from public.subjects
union all
select 'daily_stats' as tabela, count(*) as total from public.daily_stats
union all
select 'study_sessions' as tabela, count(*) as total from public.study_sessions
union all
select 'users' as tabela, count(*) as total from public.users
order by tabela;
