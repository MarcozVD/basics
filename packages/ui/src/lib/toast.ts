import { useSyncExternalStore } from "react";
import type { AnimatedToast, AnimatedToastAction, ToastStatus } from "@/components/motion/animated-toast-stack";

const DURATION = 4200;
const LIMIT = 4;

let toasts: AnimatedToast[] = [];
let seed = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function dismiss(id: string) {
  toasts = toasts.filter((item) => item.id !== id);
  emit();
}

function show(status: ToastStatus, title: string, action?: AnimatedToastAction) {
  const id = `toast-${Date.now()}-${seed++}`;
  const wrapped: AnimatedToastAction | undefined = action
    ? {
        label: action.label,
        onClick: (item) => {
          action.onClick(item);
          dismiss(id);
        },
      }
    : undefined;
  toasts = [...toasts, { id, title, status, action: wrapped, duration: DURATION, dismissible: true, createdAt: Date.now() }].slice(-LIMIT);
  emit();
  window.setTimeout(() => dismiss(id), DURATION);
}

export const toast = {
  success: (message: string, action?: AnimatedToastAction) => show("success", message, action),
  error: (message: string, action?: AnimatedToastAction) => show("error", message, action),
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
