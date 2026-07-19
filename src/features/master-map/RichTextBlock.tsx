import { useEffect, useMemo } from "react";
import Link from "@tiptap/extension-link";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { DynamicPageBlockContent } from "./dynamicPageTypes";

type RichTextBlockProps = {
  content: DynamicPageBlockContent;
  onChange: (content: DynamicPageBlockContent) => void;
};

const emptyDoc = { type: "doc", content: [{ type: "paragraph" }] };

export function RichTextBlock({ content, onChange }: RichTextBlockProps) {
  const initialDoc = useMemo(() => getEditorDoc(content), []);
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        autolink: true,
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
    ],
    content: initialDoc,
    editorProps: {
      attributes: {
        class: "dynamic-page-rich-text-surface",
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange({
        ...content,
        doc: currentEditor.getJSON(),
        text: currentEditor.getText(),
      });
    },
  });

  useEffect(() => {
    if (!editor) return;
    const nextDoc = getEditorDoc(content);
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(nextDoc)) {
      editor.commands.setContent(nextDoc);
    }
  }, [content, editor]);

  if (!editor) return <div className="dynamic-page-rich-text-surface">Carregando editor...</div>;

  function setLink() {
    const previousUrl = editor?.getAttributes("link").href as string | undefined;
    const url = window.prompt("Informe o link", previousUrl ?? "https://");
    if (url === null) return;
    if (!url.trim()) {
      editor?.chain().focus().unsetLink().run();
      return;
    }
    editor?.chain().focus().setLink({ href: url.trim() }).run();
  }

  return (
    <div className="dynamic-page-rich-text">
      <div className="dynamic-page-editor-toolbar" role="toolbar" aria-label="Ferramentas de texto">
        <button type="button" className={editor.isActive("bold") ? "active" : ""} onClick={() => editor.chain().focus().toggleBold().run()}>B</button>
        <button type="button" className={editor.isActive("italic") ? "active" : ""} onClick={() => editor.chain().focus().toggleItalic().run()}>I</button>
        <button type="button" className={editor.isActive("heading", { level: 3 }) ? "active" : ""} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>Titulo</button>
        <button type="button" className={editor.isActive("bulletList") ? "active" : ""} onClick={() => editor.chain().focus().toggleBulletList().run()}>Lista</button>
        <button type="button" className={editor.isActive("orderedList") ? "active" : ""} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. Lista</button>
        <button type="button" className={editor.isActive("link") ? "active" : ""} onClick={setLink}>Link</button>
        <button type="button" onClick={() => editor.chain().focus().undo().run()}>Desfazer</button>
        <button type="button" onClick={() => editor.chain().focus().redo().run()}>Refazer</button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function getEditorDoc(content: DynamicPageBlockContent) {
  const doc = content.doc;
  if (doc && typeof doc === "object") return doc;
  const text = typeof content.text === "string" ? content.text : "";
  if (!text) return emptyDoc;
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}
