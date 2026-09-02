import { useEditor, EditorContent, ReactRenderer, Extension } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { EntityReference } from "@/components/editor/EntityReference";
import { FontFamily } from "@tiptap/extension-font-family";
import { TextStyle } from "@tiptap/extension-text-style";
import tippy from "tippy.js";
import {
  Bold, Italic, Undo, Redo, List,
  AlignLeft, AlignCenter, Languages
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { trpc } from "@/lib/trpc";

/**
 * Custom Text Direction extension to handle RTL/LTR per node.
 */
const TextDirection = Extension.create({
  name: 'textDirection',
  addOptions() {
    return {
      types: ['paragraph', 'heading'],
      directions: ['ltr', 'rtl', 'auto'],
      defaultDirection: 'ltr',
    }
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          dir: {
            default: this.options.defaultDirection,
            parseHTML: element => element.getAttribute('dir') || this.options.defaultDirection,
            renderHTML: attributes => ({ dir: attributes.dir }),
          },
        },
      },
    ]
  },
});

interface EditorLayout {
  direction: "ltr" | "rtl" | "auto";
  orientation: "horizontal" | "vertical";
  fontFamily: string;
  viewMode: "sanctuary" | "professional";
}

interface Props {
  projectId: number;
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  layout?: EditorLayout;
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      disabled={disabled}
      title={title}
      className={cn(
        "p-1.5 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed",
        active && "bg-slate-200 text-slate-900"
      )}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({ 
  projectId,
  value, 
  onChange, 
  placeholder, 
  className,
  layout = { direction: "ltr", orientation: "horizontal", fontFamily: "Literata", viewMode: "sanctuary" }
}: Props) {
  const utils = trpc.useUtils();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "Write your scene content here…",
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
      }),
      TextAlign.configure({
        types: ['paragraph'],
        alignments: ['left', 'center', 'right', 'justify'],
      }),
      TextStyle,
      FontFamily,
      TextDirection,
      EntityReference.configure({
        suggestion: {
          items: async ({ query }) => {
            const actors = await utils.actor.list.fetch({ projectId });
            const environments = await utils.environment.list.fetch({ projectId });
            const systems = await utils.worldSystem.list.fetch({ projectId });

            const actorItems = actors.map(c => ({ id: c.id, entityType: 'actor' as const, label: c.name, subtitle: 'Actor' }));
            const envItems = environments.map(e => ({ id: e.id, entityType: 'environment' as const, label: e.name, subtitle: 'Environment' }));
            const systemItems = systems.map(s => ({ id: s.id, entityType: 'system' as const, label: s.name, subtitle: 'System' }));

            return [...actorItems, ...envItems, ...systemItems]
              .filter(item => item.label.toLowerCase().includes(query.toLowerCase()))
              .slice(0, 10);
          },
          render: () => {
            let component: any;
            let popup: any;

            return {
              onStart: props => {
                component = new ReactRenderer(MentionList, {
                  props,
                  editor: props.editor,
                });

                if (!props.clientRect) {
                  return;
                }

                popup = tippy('body', {
                  getReferenceClientRect: props.clientRect as any,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: 'manual',
                  placement: 'bottom-start',
                });
              },

              onUpdate(props) {
                component.updateProps(props);

                if (!props.clientRect) {
                  return;
                }

                popup[0].setProps({
                  getReferenceClientRect: props.clientRect as any,
                });
              },

              onKeyDown(props) {
                if (props.event.key === 'Escape') {
                  popup[0].hide();
                  return true;
                }
                return component.ref?.onKeyDown(props);
              },

              onExit() {
                popup[0].destroy();
                component.destroy();
              },
            };
          },
        },
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html);
    },
    editorProps: {
      attributes: {
        class: cn(
          "outline-none min-h-full px-8 py-10 leading-[1.8] text-[1.1875rem] text-ink-charcoal selection:bg-stationery-amber/30 max-w-[800px] mx-auto",
          layout.viewMode === "professional" && "max-w-none"
        ),
      },
    },
  });

  // Sync external value changes
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (current !== value) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  // Handle layout changes
  useEffect(() => {
    if (!editor) return;
    editor.commands.setFontFamily(layout.fontFamily);
  }, [layout.fontFamily, editor]);

  if (!editor) return null;

  const isVertical = layout.orientation === "vertical";
  const isRtl = layout.direction === "rtl";

  return (
    <div className={cn(
      "flex flex-col border border-muted-border rounded-xl overflow-hidden shadow-sm transition-all duration-300",
      layout.viewMode === "professional" ? "document-page-container" : "bg-paper-base",
      className
    )}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-4 py-3 border-b border-muted-border bg-surface-container-low/50 backdrop-blur-sm sticky top-0 z-20 shrink-0">
        <div className="flex items-center gap-0.5">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive("bold")}
            title="Bold (Ctrl+B)"
          >
            <Bold className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive("italic")}
            title="Italic (Ctrl+I)"
          >
            <Italic className="w-4 h-4" />
          </ToolbarButton>
          
          <div className="w-px h-5 bg-muted-border mx-2" />
          
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive("bulletList")}
            title="Bullet List"
          >
            <List className="w-4 h-4" />
          </ToolbarButton>

          <div className="w-px h-5 bg-muted-border mx-2" />

          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign(isRtl ? "right" : "left").run()}
            active={editor.isActive({ textAlign: isRtl ? "right" : "left" })}
            title={isRtl ? "Align Right" : "Align Left"}
          >
            <AlignLeft className={cn("w-4 h-4", isRtl && "rotate-180")} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            active={editor.isActive({ textAlign: "center" })}
            title="Align Center"
          >
            <AlignCenter className="w-4 h-4" />
          </ToolbarButton>
        </div>

        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-1">
            <ToolbarButton
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
              title="Undo (Ctrl+Z)"
            >
              <Undo className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
              title="Redo (Ctrl+Y)"
            >
              <Redo className="w-4 h-4" />
            </ToolbarButton>
          </div>
        </div>
      </div>

      {/* Editor area */}
      <div className={cn(
        "flex-1 overflow-y-auto cursor-text ink-scrollbar relative transition-all duration-500",
        layout.viewMode === "professional" ? "p-12" : "bg-paper-base"
      )}>
        <div className={cn(
          "relative z-10",
          layout.viewMode === "professional" && "document-page",
          isVertical ? "writing-vertical-rl" : "writing-horizontal-tb"
        )} dir={layout.direction}>
          {/* Subtle page texture simulation */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' /%3E%3C/svg%3E")` }} />
          
          <EditorContent
            editor={editor}
          />
        </div>
      </div>
    </div>
  );
}

const MentionList = forwardRef((props: any, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index: number) => {
    const item = props.items[index];
    if (item) {
      props.command({ id: item.id, entityType: item.entityType, label: item.label });
    }
  };

  const upHandler = () => {
    setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
  };

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.items.length);
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  useEffect(() => setSelectedIndex(0), [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        upHandler();
        return true;
      }
      if (event.key === 'ArrowDown') {
        downHandler();
        return true;
      }
      if (event.key === 'Enter') {
        enterHandler();
        return true;
      }
      return false;
    },
  }));

  return (
    <div className="bg-paper-base border border-muted-border rounded-lg shadow-xl overflow-hidden min-w-[200px] z-[100]">
      {props.items.length ? (
        <div className="p-1">
          {props.items.map((item: any, index: number) => (
            <button
              key={index}
              onClick={() => selectItem(index)}
              className={cn(
                "w-full text-left px-3 py-2 rounded flex items-center justify-between gap-4 transition-colors",
                index === selectedIndex ? "bg-stationery-amber/20 text-ink-charcoal" : "hover:bg-surface-container-low text-sage-slate"
              )}
            >
              <div className="flex flex-col">
                <span className="font-medium text-sm">{item.label}</span>
                <span className="text-[9px] font-label-caps uppercase tracking-tighter opacity-70">{item.subtitle}</span>
              </div>
              {index === selectedIndex && (
                <span className="material-symbols-outlined text-sm">keyboard_return</span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="p-3 text-sm text-sage-slate italic">No results found</div>
      )}
    </div>
  );
});
MentionList.displayName = "MentionList";
