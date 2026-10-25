"use client";

/**
 * Search + source filter for /admin/upiti. A GET form (next/form → client-side navigation, and it
 * still works as a plain form), so every filter state is a shareable URL. The current status tab
 * is carried along; the page number is dropped on purpose (a new search starts on page 1).
 */
import Form from "next/form";
import { Button, Input, LinkButton, Select } from "@/components/admin/ui";
import { LEAD_SOURCE_OPTIONS } from "@/lib/admin/status";
import { IconSearch } from "./icons";

export function LeadFilters({
  q,
  source,
  status,
  resetHref,
}: {
  q: string;
  source: string | null;
  /** current status tab ("aktivni" is the default and is not sent) */
  status: string;
  /** shown when a search or source filter is active */
  resetHref: string | null;
}) {
  return (
    <Form
      action="/admin/upiti"
      // remount when the URL changes (e.g. "Poništi"), so the inputs show the current filters
      key={`${status}|${source ?? ""}|${q}`}
      role="search"
      aria-label="Pretraga upita"
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      {status !== "aktivni" && <input type="hidden" name="status" value={status} />}
      <div className="relative min-w-0 flex-1">
        <Input
          name="q"
          type="search"
          label="Pretraga"
          defaultValue={q}
          placeholder="Ime, telefon, e-mail, grad ili broj upita"
          maxLength={100}
          autoComplete="off"
          enterKeyHint="search"
          className="pl-10"
        />
        <IconSearch size={16} className="pointer-events-none absolute bottom-3 left-3.5 text-mut" />
      </div>
      <Select
        name="source"
        label="Izvor"
        defaultValue={source ?? ""}
        fieldClassName="sm:w-48"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        options={[{ value: "", label: "Svi izvori" }, ...LEAD_SOURCE_OPTIONS]}
      />
      <div className="flex gap-2">
        <Button type="submit" variant="secondary" className="flex-1 sm:flex-none">
          Traži
        </Button>
        {resetHref && (
          <LinkButton href={resetHref} variant="ghost">
            Poništi
          </LinkButton>
        )}
      </div>
    </Form>
  );
}
