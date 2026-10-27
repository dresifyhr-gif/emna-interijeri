"use client";

import type { ComponentProps } from "react";
import { useSearchParams } from "next/navigation";
import { ContactForm } from "@/components/forms/ContactForm";
import { findGalleryPhoto } from "@/lib/lead-extras";

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
 * Reads `?interes=kuhinja|ormar|interijer|drugo`, `?izmjera=1` (ticks "Želim dogovoriti izmjeru") and
 * `?slika=<photo file name>` (the gallery photo they liked, e.g. from the /radovi lightbox) and presets the form.
 * Must sit inside <Suspense> (useSearchParams); the fallback is the plain form.
 */
export function InterestContactForm(props: Omit<Props, "interest" | "measurement" | "photo">) {
  const params = useSearchParams();
  const interest = fromParam[(params.get("interes") ?? "").toLowerCase()];
  const measurement = params.get("izmjera") === "1";
  const photo = findGalleryPhoto(params.get("slika"));
  return (
    <ContactForm
      key={`${interest ?? "none"}|${measurement ? "izmjera" : ""}|${photo?.src ?? ""}`}
      {...props}
      interest={interest}
      measurement={measurement}
      photo={photo}
    />
  );
}
