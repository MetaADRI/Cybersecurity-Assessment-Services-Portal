import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';

export interface ApiState<T> {
  data: T | null;
  error: ApiError | Error | null;
  loading: boolean;
  refetch: () => void;
  setData: (updater: (prev: T | null) => T | null) => void;
}

/**
 * Small data-fetching hook. `path = null` disables the request (useful while a
 * required id is not known yet), which is how empty states avoid bad requests.
 */
export function useApi<T>(path: string | null): ApiState<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [version, setVersion] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    api<T>(path, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setDataState(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });
    return () => controller.abort();
  }, [path, version]);

  const refetch = useCallback(() => setVersion((v) => v + 1), []);
  const setData = useCallback(
    (updater: (prev: T | null) => T | null) => setDataState((prev) => updater(prev)),
    [],
  );

  return { data, error, loading, refetch, setData };
}

/** Run a mutation with loading/error state and refresh support. */
export function useMutation<TInput, TOutput>(
  fn: (input: TInput) => Promise<TOutput>,
): {
  run: (input: TInput) => Promise<TOutput | null>;
  loading: boolean;
  error: string | null;
  reset: () => void;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (input: TInput): Promise<TOutput | null> => {
      setLoading(true);
      setError(null);
      try {
        const result = await fn(input);
        setLoading(false);
        return result;
      } catch (err) {
        setLoading(false);
        const message =
          err instanceof ApiError
            ? formatApiError(err)
            : err instanceof Error
              ? err.message
              : 'Something went wrong';
        setError(message);
        return null;
      }
    },
    [fn],
  );

  return { run, loading, error, reset: () => setError(null) };
}

/** Human readable message including field-level validation details. */
export function formatApiError(err: unknown): string {
  if (err instanceof ApiError) {
    if (Array.isArray(err.details) && err.details.length > 0) {
      const parts = err.details
        .map((d) =>
          d && typeof d === 'object' && 'message' in d
            ? String((d as { message: string }).message)
            : '',
        )
        .filter(Boolean);
      if (parts.length > 0) return `${err.message}: ${parts.join('; ')}`;
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}
