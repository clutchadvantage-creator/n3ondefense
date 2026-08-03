\set ON_ERROR_STOP on

SELECT format('CREATE ROLE n3ondefense_api LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT CONNECTION LIMIT 10', :'db_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'n3ondefense_api')
\gexec

SELECT 'CREATE DATABASE n3ondefense OWNER n3ondefense_api'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'n3ondefense')
\gexec

REVOKE ALL ON DATABASE n3ondefense FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE n3ondefense TO n3ondefense_api;
