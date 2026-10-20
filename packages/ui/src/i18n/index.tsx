import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import { type AppConfig, type Language, setConfig } from "../lib/api";
import { queryKeys, useConfig } from "../lib/queries";
import { en } from "./en";
import { es } from "./es";

export type TranslationKey = keyof typeof en;

interface I18nContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function detectLanguage(): Language {
  if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("es")) return "es";
  return "en";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const config = useConfig();
  const queryClient = useQueryClient();
  const [override, setOverride] = useState<Language | null>(null);
  const language = override ?? config.data?.language ?? detectLanguage();

  const mutation = useMutation({
    mutationFn: setConfig,
    onSuccess: (data) => queryClient.setQueryData<AppConfig>(queryKeys.config, data),
    onError: () => {
      setOverride(null);
      toast.error(language === "es" ? es["state.error.title"] : en["state.error.title"]);
    },
  });

  const setLanguage = useCallback(
    (next: Language) => {
      setOverride(next);
      mutation.mutate({ language: next });
    },
    [mutation],
  );

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => {
      const dictionary = language === "es" ? es : en;
      let text = dictionary[key] ?? en[key];
      if (vars) {
        for (const [name, value] of Object.entries(vars)) text = text.split(`{${name}}`).join(String(value));
      }
      return text;
    },
    [language],
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within I18nProvider");
  return context;
}

export function useT() {
  return useI18n().t;
}
