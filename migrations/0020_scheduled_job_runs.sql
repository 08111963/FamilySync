-- Schedulazione durevole per job periodici (es. monitor equilibrio piani):
-- last-run persistito su DB con claim atomico, perché su autoscale le istanze
-- non restano vive per l'intero intervallo (setInterval in-process non basta).
CREATE TABLE IF NOT EXISTS "scheduled_job_runs" (
  "job_name" varchar(64) PRIMARY KEY,
  "last_run_at" timestamp NOT NULL DEFAULT now()
);
