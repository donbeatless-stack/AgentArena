import { useEffect } from "react";
import { Clock3, RefreshCw } from "lucide-react";
import { useResource } from "../api";
import type { ExecutionJob } from "../types";
import { Button, Empty, ErrorState, Loading } from "./ui";
import { locale, st, t } from "../i18n";

const STATES = {
  queued: "Queued",
  running: "Executing",
  paused: "Paused",
  completed: "Completed",
  failed: "Failed",
};

export function ExecutionPanel({ arenaId }: { arenaId: number }) {
  const { data, error, reload } = useResource<ExecutionJob[]>(
    `/arenas/${arenaId}/tasks`,
  );
  useEffect(() => {
    if (!data?.some((job) => job.state === "running" || job.state === "queued"))
      return;
    const timer = setInterval(reload, 1500);
    return () => clearInterval(timer);
  }, [data, reload]);
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!data) return <Loading />;
  return (
    <section className="panel execution-panel">
      <div className="panel-heading">
        <h2>{t("Execution log")}</h2>
        <Button variant="ghost" onClick={reload}>
          <RefreshCw size={14} />
          {t("Refresh")}
        </Button>
      </div>
      {!data.length ? (
        <Empty title={t("No background jobs yet")} />
      ) : (
        data.map((job) => (
          <article key={job.id} className="execution-job">
            <div className="section-heading small">
              <h3>{t("Job {id}", { id: String(job.id).padStart(3, "0") })}</h3>
              <span
                className={job.state === "failed" ? "negative" : "positive"}
              >
                {t(STATES[job.state])}
              </span>
            </div>
            <div className="execution-facts">
              <span>
                <Clock3 size={14} />
                {new Date(job.created_at).toLocaleString(locale())}
              </span>
              <span>{t("{count} attempts", { count: job.attempts })}</span>
              <span>{t("Lease v{version}", { version: job.lease_version })}</span>
            </div>
            {job.error && (
              <p className={job.state === "failed" ? "negative" : ""}>
                {st(job.error)}
              </p>
            )}
            {job.owner && (
              <details className="context-data">
                <summary>{t("Worker")}</summary>
                <code>{job.owner}</code>
              </details>
            )}
          </article>
        ))
      )}
    </section>
  );
}
