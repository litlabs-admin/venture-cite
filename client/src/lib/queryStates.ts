import type { ReactElement, ReactNode } from "react";
import { createElement } from "react";
import { ErrorState, type ErrorStateProps } from "@/components/ui/error-state";

// Centralizes the four query phases (loading / error / empty / data) so every
// page handles them the same way. Pass null/undefined for `data` and an
// `isEmpty` predicate to use empty rendering; otherwise the children render.
export interface RenderQueryStateArgs<T> {
  isLoading: boolean;
  isError: boolean;
  data: T | undefined;
  refetch: () => void;
  isRefetching?: boolean;
  skeleton: ReactNode;
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
  errorProps?: Omit<ErrorStateProps, "onRetry" | "isRetrying">;
  children: (data: T) => ReactNode;
}

export function renderQueryState<T>({
  isLoading,
  isError,
  data,
  refetch,
  isRefetching,
  skeleton,
  empty,
  isEmpty,
  errorProps,
  children,
}: RenderQueryStateArgs<T>): ReactNode {
  if (isLoading || data === undefined) {
    if (isError) {
      return createElement(ErrorState, {
        ...errorProps,
        onRetry: refetch,
        isRetrying: isRefetching,
      });
    }
    return skeleton as ReactElement;
  }
  if (isError) {
    return createElement(ErrorState, {
      ...errorProps,
      onRetry: refetch,
      isRetrying: isRefetching,
    });
  }
  if (empty && isEmpty && isEmpty(data)) {
    return empty as ReactElement;
  }
  return children(data) as ReactElement;
}
