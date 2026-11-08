import { useSyncExternalStore } from "react";
import type { AnimatedToast, AnimatedToastAction, ToastStatus } from "@/components/motion/animated-toast-stack";

/**
 * Toast state shared by the whole shell. Toasts can be updated in place, which is what the
 * review queue uses: one toast stays while an action waits, then becomes its result.
 */

const DURATION = 4200;
const LIMIT = 4;

let toasts: AnimatedToast[] = [];
let seed = 0;
const listeners = new Set<() => void>();
const timers = new Map<string, number>();

function emit() {
  for (const listener of listeners) listener();
}

function clearTimer(id: string) {
  const timer = timers.get(id);
  if (timer !== undefined) {
    window.clearTimeout(timer);
    timers.delete(id);
  }
}

function schedule(id: string, duration: number) {
  clearTimer(id);
  if (duration <= 0) return;
  timers.set(
    id,
    window.setTimeout(() => dismiss(id), duration),
  );
}

/** Remove a toast and its timer. */
function dismiss(id: string) {
  clearTimer(id);
  const next = toasts.filter((item) => item.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  emit();
}

export interface ShowToastInput {
  title: string;
  status?: ToastStatus;
  description?: string;
  action?: AnimatedToastAction;
  duration?: number;
  dismissible?: boolean;
}

/** Add a toast, or replace one with the same id, and return its id. */
function show(input: ShowToastInput & { id?: string }): string {
  const id = input.id ?? `toast-${Date.now()}-${seed++}`;
  const wrapped: AnimatedToastAction | undefined = input.action
    ? {
        label: input.action.label,
        onClick: (item) => {
          input.action?.onClick(item);
          dismiss(id);
        },
      }
    : undefined;
  const duration = input.duration ?? DURATION;
  const toast: AnimatedToast = {
    id,
    title: input.title,
    description: input.description,
    status: input.status ?? "success",
    action: wrapped,
    duration,
    dismissible: input.dismissible ?? true,
    createdAt: Date.now(),
  };
  const existing = toasts.findIndex((item) => item.id === id);
  if (existing >= 0) {
    toasts = toasts.map((item) => (item.id === id ? toast : item));
  } else {
    toasts = [...toasts, toast].slice(-LIMIT);
  }
  emit();
  schedule(id, duration);
  return id;
}

export interface UpdateToastInput {
  title?: string;
  status?: ToastStatus;
  description?: string;
  action?: AnimatedToastAction;
  duration?: number;
  dismissible?: boolean;
}

/** Patch a live toast. A new duration restarts its timer; `action: undefined` removes it. */
function update(id: string, patch: UpdateToastInput): void {
  let nextDuration: number | undefined;
  toasts = toasts.map((item) => {
    if (item.id !== id) return item;
    nextDuration = patch.duration ?? item.duration;
    return {
      ...item,
      ...patch,
      // An absent action in the patch keeps the current one; an explicit undefined clears it.
      action: "action" in patch ? patch.action : item.action,
      createdAt: Date.now(),
    };
  });
  emit();
  if (nextDuration !== undefined) schedule(id, nextDuration);
}

export const toast = {
  success: (title: string, action?: AnimatedToastAction) => show({ title, status: "success", action }),
  error: (title: string, action?: AnimatedToastAction) => show({ title, status: "error", action }),
  show,
  update,
  dismiss,
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return toasts;
}

export function useToasts() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function dismissToast(id: string) {
  dismiss(id);
}
