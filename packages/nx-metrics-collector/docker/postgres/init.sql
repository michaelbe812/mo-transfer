-- read-only role for Grafana; tables are created later by the collector (owner nxmetrics) → default privileges
create role grafana login password 'grafana';
grant connect on database nxmetrics to grafana;
grant usage on schema public to grafana;
alter default privileges for role nxmetrics in schema public grant select on tables to grafana;
