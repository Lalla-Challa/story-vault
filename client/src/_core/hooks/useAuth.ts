import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

/**
 * Local-first auth hook. The "user" is the single local account; auth state
 * is really the vault state: configured (PIN created) and unlocked.
 */
export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = getLoginUrl() } =
    options ?? {};
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery();
  const vaultStateQuery = trpc.auth.vaultState.useQuery();

  const lockMutation = trpc.auth.lock.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const lock = useCallback(async () => {
    try {
      await lockMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      utils.auth.me.setData(undefined, null);
      await utils.auth.vaultState.invalidate();
      await utils.auth.me.invalidate();
    }
  }, [lockMutation, utils]);

  const state = useMemo(() => {
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || lockMutation.isPending,
      error: meQuery.error ?? lockMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
      vaultConfigured: vaultStateQuery.data?.configured ?? false,
      vaultUnlocked: vaultStateQuery.data?.unlocked ?? false,
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    lockMutation.error,
    lockMutation.isPending,
    vaultStateQuery.data,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || lockMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath;
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    lockMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    /** Locks the vault (closes the encrypted DB). */
    lock,
    /** Backwards-compatible alias. */
    logout: lock,
  };
}