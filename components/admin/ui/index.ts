/**
 * Admin UI primitives — dark, quiet, matching the site (ink surfaces, accent #C9B99A,
 * Space Grotesk headings, Inter body). Server-component friendly except SubmitButton and
 * PasswordInput (client).
 *
 *   import { PageHeader, Card, CardHeader, Table, THead, TBody, TR, TH, TD, rowLinkClass,
 *            Badge, LeadStatusBadge, Button, LinkButton, SubmitButton, Input, Select, Textarea,
 *            EmptyState, Alert, StatCard } from "@/components/admin/ui";
 */
export { cx } from "./cx";
export { Button, LinkButton, Spinner, buttonClass, type ButtonSize, type ButtonVariant } from "./Button";
export { SubmitButton } from "./SubmitButton";
export { Field, Input, Select, Textarea, fieldIds } from "./Field";
export { PasswordInput } from "./PasswordInput";
export { Badge, LeadSourceBadge, LeadStatusBadge, QuoteStatusBadge } from "./Badge";
export { Table, THead, TBody, TR, TH, TD, rowLinkClass } from "./Table";
export { Card, CardHeader, StatCard } from "./Card";
export { EmptyState } from "./EmptyState";
export { PageHeader } from "./PageHeader";
export { Alert } from "./Alert";
export { AuthFrame } from "./AuthFrame";
export * from "./icons";
