"use client";

import { useEffect, useRef, useState } from "react";
import { readTaskSubmissionWorkflow, type TaskLifecycleListItem } from "./taskLifecycleApi";
import { taskLifecycleItemFromWorkflow } from "./taskDeepLinkSelection";

export type TaskDeepLinkState = "idle" | "loading" | "resolved" | "unavailable";

export interface TaskDeepLinkResolution {
  deepLinkedItem: TaskLifecycleListItem | null;
  deepLinkState: TaskDeepLinkState;
}

/**
 * Resolves a /tasks?taskId=<id> deep link without broadening the personal list.
 *
 * 1. If the exact id is already in the loaded personal lifecycle list, the
 *    caller's list-based selection stays authoritative (this hook stays idle).
 * 2. Otherwise the guarded actor-authorized workflow reader
 *    (GET /tasks/:taskId/workflow) is called and, on success, mapped onto the
 *    canonical TaskSubmissionWorkspace item shape.
 * 3. A safe not-found/deny result surfaces "unavailable" without leaking any
 *    protected content and without substituting another task.
 *
 * Identity/race safety: a monotonic request token guarantees a late response
 * for an older task (A) can never replace a newly requested task (B), and a
 * re-render for the same target does not clear an already-resolved item.
 */
export function useTaskDeepLink({
  deepLinkedTaskId,
  tasks,
  isLoading,
}: {
  deepLinkedTaskId: string | null;
  tasks: readonly TaskLifecycleListItem[];
  isLoading: boolean;
}): TaskDeepLinkResolution {
  const [deepLinkedItem, setDeepLinkedItem] = useState<TaskLifecycleListItem | null>(null);
  const [deepLinkState, setDeepLinkState] = useState<TaskDeepLinkState>("idle");
  const requestRef = useRef(0);
  const targetRef = useRef<string | null>(null);

  useEffect(() => {
    // Advance even when the URL is cleared, the task enters the personal list,
    // or the list starts reloading: each transition invalidates older reads.
    const requestId = ++requestRef.current;
    if (!deepLinkedTaskId) {
      targetRef.current = null;
      setDeepLinkedItem(null);
      setDeepLinkState("idle");
      return;
    }
    if (tasks.some((task) => task.id === deepLinkedTaskId)) {
      targetRef.current = null;
      setDeepLinkedItem(null);
      setDeepLinkState("idle");
      return;
    }
    if (isLoading) return;

    if (targetRef.current !== deepLinkedTaskId) {
      setDeepLinkedItem(null);
    }
    targetRef.current = deepLinkedTaskId;
    setDeepLinkState("loading");

    readTaskSubmissionWorkflow(deepLinkedTaskId)
      .then((workflow) => {
        if (requestRef.current !== requestId) return;
        setDeepLinkedItem(taskLifecycleItemFromWorkflow(workflow));
        setDeepLinkState("resolved");
      })
      .catch(() => {
        if (requestRef.current !== requestId) return;
        setDeepLinkedItem(null);
        setDeepLinkState("unavailable");
      });
    return () => { requestRef.current += 1; };
  }, [deepLinkedTaskId, tasks, isLoading]);

  return {
    deepLinkedItem: deepLinkedItem?.id === deepLinkedTaskId ? deepLinkedItem : null,
    deepLinkState: targetRef.current === deepLinkedTaskId ? deepLinkState : "idle",
  };
}
