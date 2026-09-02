import { useCallback, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";

type UseWritingHeartbeatOptions = {
  projectId?: number;
  enabled?: boolean;
  intervalMs?: number;
};

export function useWritingHeartbeat({
  projectId,
  enabled = true,
  intervalMs = 60_000,
}: UseWritingHeartbeatOptions) {
  const heartbeatMutation = trpc.writing.heartbeat.useMutation();

  const hasKeystrokeSinceLastHeartbeatRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const projectIdRef = useRef<number | undefined>(projectId);

  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  const noteKeystroke = useCallback(() => {
    hasKeystrokeSinceLastHeartbeatRef.current = true;
  }, []);

  const tick = useCallback(() => {
    if (!enabled || !projectIdRef.current) return;
    if (!hasKeystrokeSinceLastHeartbeatRef.current) return;
    hasKeystrokeSinceLastHeartbeatRef.current = false;
    heartbeatMutation.mutate({ projectId: projectIdRef.current });
  }, [enabled, heartbeatMutation]);

  useEffect(() => {
    if (!enabled) return;
    timerRef.current = window.setInterval(() => {
      tick();
    }, intervalMs);

    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, intervalMs, tick]);

  return { noteKeystroke };
}
