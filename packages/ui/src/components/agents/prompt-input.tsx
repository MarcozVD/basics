"use client";
// beui.dev/components/agents/prompt-input
// Adapted for Basics: model select and "+" actions removed, `submitOn` adds a
// ⌘/Ctrl+Enter mode (plain Enter keeps the newline), and the send button can
// carry a visible label and a loading indicator instead of the stop state.

import { ArrowUp, Square } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/motion/button/base";
import { SPRING_SWAP } from "@/lib/ease";
import { cn } from "@/lib/utils";

export interface PromptInputProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "defaultValue" | "onChange" | "onSubmit" | "children"> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onSubmit?: (value: string) => void | Promise<void>;
  loading?: boolean;
  onStop?: () => void;
  minRows?: number;
  maxRows?: number;
  /** "enter" (default): Enter sends, Shift+Enter breaks the line. "mod-enter": ⌘/Ctrl+Enter sends. */
  submitOn?: "enter" | "mod-enter";
  /** Accessible name of the send button; shown next to the icon when `showSubmitLabel`. */
  submitLabel?: string;
  showSubmitLabel?: boolean;
  /** Replaces the arrow while `loading` and no `onStop` is given. */
  loadingIndicator?: ReactNode;
  /** Keep the text after sending (controlled callers usually want this). */
  keepValueOnSubmit?: boolean;
  leadingAction?: ReactNode;
  className?: string;
  ref?: Ref<HTMLTextAreaElement>;
}

export function PromptInput({
  value,
  defaultValue = "",
  onValueChange,
  onSubmit,
  loading = false,
  onStop,
  minRows = 2,
  maxRows = 8,
  submitOn = "enter",
  submitLabel = "Send prompt",
  showSubmitLabel = false,
  loadingIndicator,
  keepValueOnSubmit = false,
  leadingAction,
  className,
  disabled,
  placeholder = "Ask the agent to do something…",
  "aria-label": ariaLabel = "Prompt",
  onKeyDown,
  ref,
  ...textareaProps
}: PromptInputProps) {
  const reduce = useReducedMotion() ?? false;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const measurementRef = useRef<HTMLDivElement>(null);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const currentValue = value ?? internalValue;
  const canSubmit = Boolean(currentValue.trim()) && !disabled && !loading;
  const stoppable = loading && Boolean(onStop);

  useImperativeHandle(ref, () => textareaRef.current as HTMLTextAreaElement, []);

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    const measurement = measurementRef.current;
    if (!textarea || !measurement || textarea.value !== currentValue) return;

    const lineHeight = 24;
    const nextHeight = Math.min(Math.max(measurement.scrollHeight, minRows * lineHeight), maxRows * lineHeight);
    const height = `${nextHeight}px`;
    if (textarea.style.height !== height) textarea.style.height = height;
  }, [currentValue, maxRows, minRows]);

  useLayoutEffect(() => {
    resizeTextarea();
  }, [resizeTextarea]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(resizeTextarea);
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [resizeTextarea]);

  const setValue = (next: string) => {
    if (value === undefined) setInternalValue(next);
    onValueChange?.(next);
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const prompt = currentValue.trim();
    if (!prompt || disabled || loading) return;

    onSubmit?.(prompt);
    if (value === undefined && !keepValueOnSubmit) setInternalValue("");
    textareaRef.current?.focus({ preventScroll: true });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.key !== "Enter" || event.nativeEvent.isComposing) return;
    const mod = event.metaKey || event.ctrlKey;
    if (submitOn === "mod-enter" ? !mod : event.shiftKey) return;
    event.preventDefault();
    submit();
  };

  const iconKey = stoppable ? "stop" : loading ? "loading" : "send";

  return (
    <form
      onSubmit={submit}
      className={cn(
        "relative w-full rounded-2xl border border-border/80 bg-background p-2 transition-colors focus-within:border-foreground/40 focus-within:ring-2 focus-within:ring-ring/40",
        disabled && "opacity-60",
        className,
      )}
    >
      <div
        ref={measurementRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute inset-x-2 top-0 whitespace-pre-wrap px-2 text-sm leading-6 [overflow-wrap:break-word]"
      >
        {`${currentValue}​`}
      </div>
      <textarea
        ref={textareaRef}
        value={currentValue}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        rows={minRows}
        {...textareaProps}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        className="scrollbar-hide block w-full resize-none overflow-y-auto bg-transparent px-2 pt-1.5 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground"
      />

      <div className="mt-1 flex min-h-8 items-center gap-1">
        {leadingAction}

        <Button
          type={stoppable ? "button" : "submit"}
          size={showSubmitLabel ? "sm" : "icon"}
          pressScale={0.97}
          disabled={stoppable ? false : !canSubmit}
          aria-label={stoppable ? "Stop generating" : submitLabel}
          aria-busy={loading || undefined}
          onClick={stoppable ? onStop : undefined}
          className={cn("ml-auto rounded-full", showSubmitLabel ? "pr-2.5 pl-3.5" : "size-8")}
        >
          {showSubmitLabel ? <span aria-hidden="true">{submitLabel}</span> : null}
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={iconKey}
              aria-hidden="true"
              initial={reduce ? { opacity: 1 } : { opacity: 0, y: 3, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -3, scale: 0.8 }}
              transition={reduce ? { duration: 0 } : SPRING_SWAP}
              className="grid size-4 place-items-center"
            >
              {stoppable ? (
                <Square className="size-3 fill-current" />
              ) : loading && loadingIndicator ? (
                loadingIndicator
              ) : (
                <ArrowUp className="size-4" />
              )}
            </motion.span>
          </AnimatePresence>
        </Button>
      </div>
    </form>
  );
}
