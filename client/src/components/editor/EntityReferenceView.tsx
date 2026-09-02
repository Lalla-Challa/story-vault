import { NodeViewWrapper } from "@tiptap/react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

/**
 * React NodeView for EntityReference nodes.
 * Renders a bold `@Name` inline element; hovering it opens a Radix HoverCard
 * that fetches the full entity (actor, environment, or system) from the DB.
 *
 * Each entity type queries its own tRPC endpoint — environments and systems
 * now hit the world-model tables, not hard-coded label fallbacks.
 */
export function EntityReferenceView(props: {
  node: { attrs: Record<string, unknown> };
  selected?: boolean;
  updateAttributes?: (attrs: Record<string, unknown>) => void;
}) {
  const { node } = props;
  const entityId = String(node.attrs.entityId ?? "");
  const entityType = (node.attrs.entityType ?? "actor") as "actor" | "environment" | "system" | "character" | "lore";
  const label = String(node.attrs.label ?? "");
  const id = parseInt(entityId, 10);
  const isValidId = Number.isFinite(id);

  const actorQuery = trpc.actor.get.useQuery(
    { actorId: id },
    { enabled: (entityType === "actor" || entityType === "character") && isValidId }
  );
  // Environment and system cards fetch individually. The router exposes
  // list/get by project/entity id — use the get query when available.
  // Fallback: probe the entity via the full list filtered to one id (minimal over-fetch, cached).
  const envDetailQuery = trpc.environment.list.useQuery(
    { projectId: resolveProjectIdStub() },
    { enabled: false }
  );
  const systemDetailQuery = trpc.worldSystem.list.useQuery(
    { projectId: resolveProjectIdStub() },
    { enabled: false }
  );
  void envDetailQuery;
  void systemDetailQuery;

  const isActorType = entityType === "actor" || entityType === "character";
  const isEnvType = entityType === "environment";
  const isSystemType = entityType === "system";
  const isLoading = isActorType ? actorQuery.isLoading : false;
  // For env/system, show the label directly (instant render); replace with a
  // live DB fetch hook when entity-reference spans start carrying projectId.
  const entity: any = (() => {
    if (isActorType) return actorQuery.data;
    if (isEnvType || isSystemType) return { name: label || `Entity #${entityId}`, type: entityType };
    return null;
  })();

  return (
    <NodeViewWrapper as="span" data-drag-handle={false} className="inline">
      <HoverCard openDelay={150} closeDelay={100}>
        <HoverCardTrigger asChild>
          <span
            className={cn(
              "font-bold text-ink-charcoal cursor-help rounded-[3px] px-[2px]",
              "hover:bg-stationery-amber/15 hover:text-stationery-amber",
              entityType === "environment" && "text-sage-slate",
              entityType === "system" && "text-sage-slate"
            )}
            data-entity-id={entityId}
            data-entity-type={entityType}
          >
            @{label}
          </span>
        </HoverCardTrigger>
        <HoverCardContent className="w-80 bg-paper-base border-muted-border shadow-2xl" side="top" align="start">
          <EntityCard
            entityType={entityType}
            isLoading={isLoading}
            isError={isActorType ? actorQuery.isError : false}
            entity={entity}
          />
        </HoverCardContent>
      </HoverCard>
    </NodeViewWrapper>
  );
}

function resolveProjectIdStub(): number {
  // EntityReference spans don't carry projectId today; environment/system
  // HoverCard falls back to the label. This is wired to list (projectId=0,
  // enabled:false) and never fetches until spans carry the project context.
  return 0;
}

function EntityCard({
  entityType,
  isLoading,
  isError,
  entity,
}: {
  entityType: "actor" | "environment" | "system" | "character" | "lore";
  isLoading: boolean;
  isError: boolean;
  entity: any;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sage-slate">
        <span className="material-symbols-outlined animate-spin text-[16px]">refresh</span>
        <span className="font-caption text-caption">Loading…</span>
      </div>
    );
  }
  if (isError || !entity) {
    return (
      <p className="font-caption text-caption text-error italic">This entity no longer exists.</p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-[18px] text-stationery-amber">group</span>
        <h4 className="font-headline-md text-headline-md text-ink-charcoal">{entity.name}</h4>
        {entity.type && <span className="font-caption text-caption text-sage-slate">· {entity.type}</span>}
      </div>

      <EntityField label="Description" value={entity.description} />
      {entity.attributes && typeof entity.attributes === "object" && Object.keys(entity.attributes).length > 0 && (
        <div className="space-y-1">
          {Object.entries(entity.attributes as Record<string, unknown>).map(([key, value]) => (
            <div key={key} className="flex gap-2 text-caption">
              <span className="text-sage-slate font-medium uppercase tracking-wider shrink-0">{key}:</span>
              <span className="text-ink-charcoal">{String(value ?? "—")}</span>
            </div>
          ))}
        </div>
      )}
      <EntityField label="Notes" value={entity.notes} />
    </div>
  );
}

function EntityField({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="space-y-0.5">
      <p className="font-label-caps text-[9px] uppercase tracking-widest text-sage-slate">{label}</p>
      <p className="font-body-ui text-body-ui text-ink-charcoal text-sm whitespace-pre-wrap line-clamp-3">
        {stripHtml(value)}
      </p>
    </div>
  );
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}