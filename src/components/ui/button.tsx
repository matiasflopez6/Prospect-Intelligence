import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-sunken",
  ghost: "text-ink-2 hover:bg-sunken",
  danger: "border border-line-strong bg-surface text-bad hover:bg-bad-soft",
};
const sizes: Record<Size, string> = { sm: "h-7 px-2.5 text-sm", md: "h-8 px-3 text-sm" };

export const buttonClass = (variant: Variant = "secondary", size: Size = "md", className?: string) =>
  cn(base, variants[variant], sizes[size], className);

export function Button({
  variant,
  size,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
