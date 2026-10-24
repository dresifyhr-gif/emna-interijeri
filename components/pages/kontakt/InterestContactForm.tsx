"use client";

import type { ComponentProps } from "react";
import { useSearchParams } from "next/navigation";
import { ContactForm } from "@/components/forms/ContactForm";

type Props = ComponentProps<typeof ContactForm>;
type Interest = NonNullable<Props["interest"]>;

const fromParam: Record<string, Interest> = {
  kuhinja: "Kuhinja",
  kuhinje: "Kuhinja",
  ormar: "Ormar",
  ormari: "Ormar",
  interijer: "Interijer",
  interijeri: "Interijer",
  drugo: "Drugo",
};

/**
 * Reads `?interes=kuhinja|ormar|interijer|drugo` and presets the form.
 * Must sit inside <Suspense> (useSearchParams); the fallback is the plain form.
 */
export function InterestContactForm(props: Omit<Props, "interest">) {
  const params = useSearchParams();
  const interest = fromParam[(params.get("interes") ?? "").toLowerCase()];
  return <ContactForm key={interest ?? "none"} {...props} interest={interest} />;
}
