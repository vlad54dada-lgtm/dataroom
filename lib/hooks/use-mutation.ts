"use client";

import { useState } from "react";
import { toast } from "sonner";

export interface MutationOptions<TArgs extends unknown[], TResult> {
  /** Apply an optimistic patch; return a rollback to run on failure. */
  optimistic?: (...args: TArgs) => (() => void) | void;
  successToast?: string | ((result: TResult) => string);
  /**
   * Resolve the error toast message. Return null to suppress the toast for
   * errors a dialog renders inline (e.g. DuplicateNameError). When omitted,
   * no toast is shown. Errors are always rethrown so callers can react.
   */
  errorToast?: (error: unknown) => string | null;
  onSuccess?: (result: TResult, ...args: TArgs) => void;
}

/**
 * Centralizes the mutation lifecycle — optimistic patch, toast, rollback —
 * so call sites stay a few lines and no component hand-rolls try/catch/toast.
 * `run` is intentionally not memoized: it's only ever called from event
 * handlers, never used as a dependency.
 */
export function useMutation<TArgs extends unknown[], TResult>(
  mutate: (...args: TArgs) => Promise<TResult>,
  options: MutationOptions<TArgs, TResult> = {},
) {
  const [pending, setPending] = useState(false);

  const run = async (...args: TArgs): Promise<TResult> => {
    setPending(true);
    const rollback = options.optimistic
      ? options.optimistic(...args)
      : undefined;
    try {
      const result = await mutate(...args);
      if (options.successToast) {
        toast.success(
          typeof options.successToast === "string"
            ? options.successToast
            : options.successToast(result),
        );
      }
      options.onSuccess?.(result, ...args);
      return result;
    } catch (error) {
      if (typeof rollback === "function") rollback();
      const message = options.errorToast?.(error);
      if (message) toast.error(message);
      throw error;
    } finally {
      setPending(false);
    }
  };

  return { run, pending };
}
