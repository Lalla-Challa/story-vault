import { useEffect, useRef, useState, useCallback } from "react";

interface UseAutoSaveOptions {
  /** Content to auto-save */
  content: string;
  /** Delay in ms before saving (default: 1500) */
  debounceMs?: number;
  /** Function to call when saving */
  onSave: (content: string) => Promise<void>;
  /** Optional: call when sync status changes */
  onStatusChange?: (status: "idle" | "saving" | "saved" | "error") => void;
  /** Enable auto-save (default: true) */
  enabled?: boolean;
}

/**
 * Hook for auto-saving content with debouncing and status tracking
 * @example
 * const { status, isOutOfSync } = useAutoSave({
 *   content: editorContent,
 *   onSave: async (content) => {
 *     await saveToDatabase(content);
 *   },
 *   onStatusChange: setSyncStatus,
 * });
 */
export function useAutoSave({
  content,
  debounceMs = 1500,
  onSave,
  onStatusChange,
  enabled = true,
}: UseAutoSaveOptions) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [isOutOfSync, setIsOutOfSync] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const lastSavedContent = useRef<string>(content);

  const updateStatus = useCallback(
    (newStatus: typeof status) => {
      setStatus(newStatus);
      onStatusChange?.(newStatus);
    },
    [onStatusChange]
  );

  // Mark as out-of-sync when content changes
  useEffect(() => {
    if (content !== lastSavedContent.current && content.trim()) {
      setIsOutOfSync(true);
    }
  }, [content]);

  // Auto-save with debounce
  useEffect(() => {
    if (!enabled || !content.trim()) return;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(async () => {
      try {
        updateStatus("saving");
        await onSave(content);
        lastSavedContent.current = content;
        setIsOutOfSync(false);
        updateStatus("saved");

        // Reset to idle after 1.5 seconds
        setTimeout(() => {
          updateStatus("idle");
        }, 1500);
      } catch (error) {
        console.error("[Auto-save] Error:", error);
        updateStatus("error");
        // Retry after 2 seconds
        setTimeout(() => {
          updateStatus("idle");
        }, 2000);
      }
    }, debounceMs);

    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [content, debounceMs, enabled, onSave, updateStatus]);

  return {
    status,
    isOutOfSync,
    isSaving: status === "saving",
    isSaved: status === "saved",
    hasError: status === "error",
  };
}
