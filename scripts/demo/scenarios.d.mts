export interface DemoScenario {
  id: string;
  prompt: { en: string; es: string };
  keywords: string[];
  layers: { id: string; technologies: { id: string; reason: { en: string; es: string } }[] }[];
  practices: string[];
  checks: string[];
}
export function matchScenario<T extends Pick<DemoScenario, "keywords">>(input: string, scenarios: readonly T[]): T | null;
