import { Badge } from "@/components/ui/badge";
import type { HealthStatus } from "@/lib/health";
import { cn } from "@/lib/utils";

export type StatusKind = HealthStatus | "maintenance";

/** Status is the only place red, orange and green appear. */
export const STATUS_TEXT: Record<StatusKind, string> = {
  healthy: "text-success",
  attention: "text-warning",
  critical: "text-destructive",
  maintenance: "text-foreground",
};

const STATUS_BADGE: Record<StatusKind, string> = {
  healthy: "border-success/30 bg-success/10 text-success",
  attention: "border-warning/30 bg-warning/10 text-warning",
  critical: "border-destructive/30 bg-destructive/10 text-destructive",
  maintenance: "border-border bg-muted text-foreground",
};

export function StatusBadge({ status, children, className }: { status: StatusKind; children: React.ReactNode; className?: string }) {
  return (
    <Badge variant="outline" className={cn(STATUS_BADGE[status], className)}>
      {children}
    </Badge>
  );
}
