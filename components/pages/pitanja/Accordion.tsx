"use client";

import Link from "next/link";
import { useState } from "react";
import { Fill } from "@/components/site/Fill";
import type { Faq } from "./faq";

/**
 * Accessible disclosure list: each question is a <button aria-expanded> inside a heading,
 * answers stay in the DOM (crawlable) and are `inert` while closed.
 * Height animates with grid-template-rows, so it respects prefers-reduced-motion via globals.css.
 */
export function Accordion({ items, groupId }: { items: Faq[]; groupId: string }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <ul className="border-t border-hairline">
      {items.map((item) => {
        const isOpen = open.has(item.id);
        const qid = `${groupId}-${item.id}-q`;
        const aid = `${groupId}-${item.id}-a`;
        return (
          <li key={item.id} id={`pitanje-${item.id}`} className="scroll-mt-28 border-b border-hairline">
            <h3>
              <button
                id={qid}
                type="button"
                aria-expanded={isOpen}
                aria-controls={aid}
                onClick={() => toggle(item.id)}
                className="group flex w-full items-start justify-between gap-6 py-6 text-left sm:py-7"
              >
                <span
                  className={`font-head text-[18px] font-medium leading-snug tracking-head-sm transition-colors duration-300 sm:text-[21px] ${
                    isOpen ? "text-graphite" : "text-graphite/85 group-hover:text-graphite"
                  }`}
                >
                  {item.q}
                </span>
                <span
                  aria-hidden
                  className={`relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all duration-500 ease-premium ${
                    isOpen ? "border-graphite bg-graphite text-white" : "border-graphite/20 text-graphite group-hover:border-graphite"
                  }`}
                >
                  <span className="absolute h-px w-3 bg-current" />
                  <span
                    className={`absolute h-3 w-px bg-current transition-transform duration-500 ease-premium ${
                      isOpen ? "scale-y-0" : "scale-y-100"
                    }`}
                  />
                </span>
              </button>
            </h3>
            <div
              id={aid}
              role="region"
              aria-labelledby={qid}
              inert={!isOpen}
              className={`grid transition-[grid-template-rows,opacity] duration-500 ease-premium ${
                isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden">
                <div className="max-w-2xl pb-8 pr-10 text-[15px] leading-relaxed text-taupe sm:text-base">
                  <p>
                    {item.a}
                    {item.todo && (
                      <>
                        {" "}
                        <Fill value={null} label={item.todo} />
                      </>
                    )}
                  </p>
                  {item.link && (
                    <Link
                      href={item.link.href}
                      className="mt-4 inline-flex items-center gap-2 text-[13.5px] font-medium text-graphite underline-offset-4 hover:underline"
                    >
                      {item.link.label} →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
