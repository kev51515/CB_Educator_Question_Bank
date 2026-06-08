/**
 * MarkdownEditor
 * ==============
 * Shared rich-text editor based on TipTap. Renders a toolbar (bold, italic,
 * heading, list, link, code) over a contentEditable area. Outputs HTML (the
 * caller stores it as a string — DB columns we use are plain text, so they
 * accept HTML transparently). Reads/writes via `value` / `onChange` like a
 * controlled component.
 */
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { useEffect } from "react";
import type { ReactNode } from "react";

export interface MarkdownEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;        // px, default 160
  disabled?: boolean;
  showToolbar?: boolean;     // default true
  characterLimit?: number;   // optional cap
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  minHeight = 160,
  disabled = false,
  showToolbar = true,
  characterLimit,
}: MarkdownEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } }),
    ],
    content: value,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: `prose prose-sm dark:prose-invert max-w-none focus:outline-none px-3 py-2 ${
          characterLimit ? "" : ""
        }`,
        style: `min-height: ${minHeight}px;`,
      },
    },
    onUpdate: ({ editor }: { editor: Editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Sync external value changes (e.g. reset)
  useEffect(() => {
    if (editor && editor.getHTML() !== value) {
      editor.commands.setContent(value, false);
    }
  }, [value, editor]);

  if (!editor) return null;

  const count = editor.getText().length;
  const overLimit = characterLimit !== undefined && count > characterLimit;

  // M30: contentEditable strips its outline; lift focus indication to the
  // wrapper via focus-within so keyboard users still see where focus is.
  return (
    <div className={`rounded-lg ring-1 ring-slate-200 dark:ring-slate-700 bg-white dark:bg-slate-900 focus-within:ring-2 focus-within:ring-indigo-500 ${overLimit ? "ring-rose-400" : ""}`}>
      {showToolbar && !disabled && (
        <div className="flex items-center gap-1 flex-wrap px-2 py-1 border-b border-slate-100 dark:border-slate-800">
          <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} label="B" className="font-bold" />
          <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} label="I" className="italic" />
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} label="H" />
          <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} label="• List" />
          <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} label="1. List" />
          <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive("code")} label="<>" />
          <ToolbarButton
            onClick={() => {
              const url = window.prompt("URL");
              if (url) editor.chain().focus().setLink({ href: url }).run();
            }}
            active={editor.isActive("link")}
            ariaLabel="Insert link"
            label={
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            }
          />
        </div>
      )}
      <EditorContent editor={editor} />
      {placeholder && count === 0 && (
        <div className="px-3 -mt-8 pointer-events-none text-sm text-slate-500 dark:text-slate-400">{placeholder}</div>
      )}
      {characterLimit !== undefined && (
        <div className={`px-3 py-1 text-xs ${overLimit ? "text-rose-600" : "text-slate-500 dark:text-slate-400"}`}>
          {count} / {characterLimit}
        </div>
      )}
    </div>
  );
}

interface ToolbarButtonProps {
  onClick: () => void;
  active: boolean;
  label: ReactNode;
  className?: string;
  ariaLabel?: string;
}

function ToolbarButton({ onClick, active, label, className = "", ariaLabel }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`px-2 py-1 text-sm rounded transition ${
        active
          ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300"
          : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
      } ${className}`}
    >
      {label}
    </button>
  );
}
