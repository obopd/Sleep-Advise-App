#!/bin/bash
# Applies the migrations to a fresh local Postgres database and runs the access-control checks.
# Needs a local Postgres (the cloud session has one). Usage: npm run test:db
set -e
cd "$(dirname "$0")"
service postgresql start > /dev/null 2>&1 || true
for i in 1 2 3 4 5 6 7 8 9 10; do pg_isready -q && break; sleep 1; done
DB=sleep_advisor_test
run() { su postgres -c "psql -q -v ON_ERROR_STOP=1 $*"; }
run "-c 'drop database if exists $DB'" && run "-c 'create database $DB'"
run "-d $DB -f $PWD/stub.sql" > /dev/null
for f in ../../supabase/migrations/*.sql; do
  run "-d $DB -f $(realpath "$f")" > /dev/null
  run "-d $DB -f $(realpath "$f")" > /dev/null   # migrations must be safe to re-run
done
run "-d $DB -f $PWD/rls.sql"
