import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-9 w-9", className)} aria-hidden="true">
      <rect width="32" height="32" rx="10" fill="#005A32" />
      <path d="M11 24V8h6.2a5 5 0 0 1 0 10H11" fill="none" stroke="#A1D99B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="22.5" cy="23" r="2.2" fill="#74C476" />
    </svg>
  );
}

export function Logo({ light, className }: { light?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <div className="leading-none">
        <p className={cn("text-[17px] font-bold tracking-tight", light ? "text-white" : "text-ink")}>Petrosupply</p>
        <p className={cn("mt-1 text-[11px] font-medium", light ? "text-brand-200" : "text-muted")}>Gestão financeira</p>
      </div>
    </div>
  );
}
