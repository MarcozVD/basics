import { useSyncExternalStore } from "react";
import type { AnimatedToast, ToastStatus } from "@/components/motion/animated-toast-stack";

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

function show(status: ToastStatus, title: string) {
  const id = `toast-${Date.now()}-${seed++}`;
  toasts = [...toasts, { id, title, status, duration: DURATION, dismissible: true, createdAt: Date.now() }].slice(-LIMIT);
  emit();
  window.setTimeout(() => dismiss(id), DURATION);
}

export const toast = {
  success: (message: string) => show("success", message),
  error: (message: string) => show("error", message),
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
