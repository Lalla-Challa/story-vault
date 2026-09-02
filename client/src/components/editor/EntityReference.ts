import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import { EntityReferenceView } from "./EntityReferenceView";

export type EntityReferenceKind = "actor" | "environment" | "system" | "character" | "lore";

const KIND_LABEL: Record<string, string> = {
  actor: "Character",
  character: "Character",
  environment: "Location",
  system: "System",
  lore: "Lore",
};

export interface EntityReferenceSuggestionItem {
  id: number;
  entityType: EntityReferenceKind;
  label: string;
  subtitle?: string;
}

export interface EntityReferenceOptions {
  HTMLAttributes: Record<string, unknown>;
  /** Standard @tiptap/suggestion configuration. */
  suggestion: Partial<SuggestionOptions<EntityReferenceSuggestionItem, unknown>>;
}

/**
 * A custom inline entity reference node.
 *
 * - Renders as bold `@Name` in the editor (via a React NodeView).
 * - Persists `entityId` + `entityType` as HTML data attributes so it survives
 *   serialization to the database and round-trips through parseHTML.
 * - `renderText` emits `[Character: Name (ID: 123)]` for plain-text export and
 *   for the AI agent when it reads scene content.
 */
export const EntityReference = Node.create<EntityReferenceOptions>({
  name: "entityReference",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return {
      HTMLAttributes: {},
      suggestion: {
        items: async () => [],
        render: () => ({}),
      },
    };
  },

  addAttributes() {
    return {
      entityId: { default: null },
      entityType: { default: "actor" },
      label: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-entity-id]",
        getAttrs: (dom) => {
          if (typeof dom === "string") return false;
          const el = dom as HTMLElement;
          const id = el.getAttribute("data-entity-id");
          if (!id) return false;
          return {
            entityId: id,
            entityType: el.getAttribute("data-entity-type") || "actor",
            label: (el.textContent || "").replace(/^@/, ""),
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-entity-id": node.attrs.entityId,
        "data-entity-type": node.attrs.entityType,
      }),
      `@${node.attrs.label}`,
    ];
  },

  renderText({ node }) {
    const prefix = KIND_LABEL[node.attrs.entityType as string] ?? "Entity";
    return `[${prefix}: ${node.attrs.label} (ID: ${node.attrs.entityId})]`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(EntityReferenceView as any);
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
        command: ({ editor, range, props }) => {
          const { entityType, id, label } = props as unknown as EntityReferenceSuggestionItem;
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              {
                type: this.name,
                attrs: { entityId: id, entityType, label },
              },
              { type: "text", text: " " },
            ])
            .run();
        },
      }),
    ];
  },
});