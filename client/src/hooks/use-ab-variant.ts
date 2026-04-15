import { useState } from "react";

export function useAbVariant(_testName: string, variants: string[]): string {
  const [variant] = useState<string>(() =>
    variants[Math.floor(Math.random() * variants.length)]
  );
  return variant;
}
