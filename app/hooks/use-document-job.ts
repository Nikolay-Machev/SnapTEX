import { useEffect, useState } from "react";
import type { DocumentConversionResult } from "~/recognition/types";
import type { DocumentJob } from "~/services/document-jobs.server";

const STORAGE = "snaptex-pending-document";
export type JobTicket = DocumentJob & { token: string };
export type JobAccepted = { success: true; job: JobTicket };
export function pendingDocumentExists() {
  try {
    return Boolean(sessionStorage.getItem(STORAGE));
  } catch {
    return false;
  }
}
function restoredTicket(): JobTicket | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE) ?? "null");
    if (typeof value?.id === "string" && typeof value?.token === "string")
      return value;
  } catch {
    /* browser storage can be disabled */
  }
}
export function useDocumentJob(enabled: boolean, accepted?: JobTicket) {
  const [ticket, setTicket] = useState<JobTicket>();
  const [progress, setProgress] = useState<DocumentJob>();
  const [result, setResult] = useState<DocumentConversionResult>();
  const [error, setError] = useState("");
  const [pollWarning, setPollWarning] = useState("");
  useEffect(() => {
    if (!enabled) return;
    const next = accepted ?? restoredTicket();
    if (!next) return;
    setTicket(next);
    setProgress(next);
    setResult(undefined);
    setError("");
    try {
      sessionStorage.setItem(STORAGE, JSON.stringify(next));
    } catch {
      /* polling still works */
    }
  }, [enabled, accepted]);

  useEffect(() => {
    if (!ticket) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    function finished() {
      setTicket(undefined);
      try {
        sessionStorage.removeItem(STORAGE);
      } catch {
        /* optional persistence */
      }
    }
    async function poll() {
      try {
        const response = await fetch(`/api/document-jobs/${ticket!.id}`, {
          headers: { "X-Snaptex-Job-Token": ticket!.token },
          signal: controller.signal,
        });
        if (!response.ok) {
          if (response.status === 404) {
            setError(
              "The document job has expired or is unavailable. Please submit it again.",
            );
            finished();
            return;
          }
          throw new Error("poll");
        }
        const data = (await response.json()) as { job: DocumentJob };
        if (controller.signal.aborted) return;
        setProgress(data.job);
        setPollWarning("");
        if (data.job.status === "succeeded" && data.job.result) {
          setResult(data.job.result);
          finished();
          return;
        }
        if (data.job.status === "failed" || data.job.status === "cancelled") {
          setError(data.job.error ?? "Document conversion cancelled.");
          finished();
          return;
        }
        timer = setTimeout(poll, 1000);
      } catch {
        if (!controller.signal.aborted) {
          setPollWarning(
            "Connection interrupted. Your job continues; retrying its status…",
          );
          timer = setTimeout(poll, 5000);
        }
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [ticket]);

  async function cancel() {
    if (!ticket) return;
    try {
      const response = await fetch(`/api/document-jobs/${ticket.id}`, {
        method: "DELETE",
        headers: { "X-Snaptex-Job-Token": ticket.token },
      });
      if (!response.ok) throw new Error("cancel");
      setTicket(undefined);
      setError("Document conversion cancelled.");
      try {
        sessionStorage.removeItem(STORAGE);
      } catch {
        /* optional persistence */
      }
    } catch {
      setPollWarning("Could not cancel the job. Please try again.");
    }
  }
  return {
    busy: Boolean(ticket),
    progress,
    result,
    error,
    pollWarning,
    cancel,
  };
}
