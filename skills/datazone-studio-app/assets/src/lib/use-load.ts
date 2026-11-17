import { DependencyList, useCallback, useEffect, useRef, useState } from "react";

export type LoadState<T> = {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  /** Re-run the load, e.g. after a write. Keeps the current data on screen while it runs. */
  reload: () => void;
};

/**
 * Loading, error and data for one async read. When `deps` change the old data is cleared (it answers
 * a question nobody is asking any more); `reload()` keeps it on screen. Responses from superseded runs
 * are dropped, so a fast filter change never shows the slower, older answer.
 */
export function useLoad<T>(load: () => Promise<T>, deps: DependencyList): LoadState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(0);
  const lastAttempt = useRef(attempt);

  useEffect(() => {
    const run = ++latest.current;
    if (lastAttempt.current === attempt) setData(undefined);
    lastAttempt.current = attempt;
    setLoading(true);
    setError(null);
    load()
      .then((result) => {
        if (run === latest.current) setData(result);
      })
      .catch((problem: Error) => {
        if (run === latest.current) setError(problem.message);
      })
      .finally(() => {
        if (run === latest.current) setLoading(false);
      });
    // `load` is a new closure every render; `deps` is what decides when to re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  const reload = useCallback(() => setAttempt((count) => count + 1), []);
  return { data, error, loading, reload };
}
