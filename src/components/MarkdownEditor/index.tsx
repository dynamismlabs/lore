/**
 * Calm writing surface (tiptap) that reads and writes Markdown. Formatting is
 * available from a small menu when text is selected; otherwise it stays out of
 * the way.
 */
import { useEffect, useRef } from 'react';
import { Typography } from '@tiptap/extension-typography';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import { type Editor, EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { StarterKit } from '@tiptap/starter-kit';
import { Bold, Heading2, Italic, List, ListOrdered, Quote } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  initialMarkdown?: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  /** Gives the parent the editor (e.g. to insert dictated text at the cursor). */
  onReady?: (editor: Editor) => void;
  /** Extra classes for the editable area (font size, min height…). */
  contentClassName?: string;
}

function hasFinePointer() {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;
}

export default function MarkdownEditor({
  initialMarkdown = '',
  onChange,
  placeholder = 'What happened?',
  autoFocus = false,
  className,
  onReady,
  contentClassName,
}: Props) {
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  });
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, codeBlock: false, code: false }),
      Placeholder.configure({ placeholder }),
      Typography,
      Markdown,
    ],
    content: initialMarkdown,
    contentType: 'markdown',
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-neutral dark:prose-invert max-w-none font-serif text-[1.15rem] leading-relaxed',
          'prose-p:my-3 prose-headings:font-serif prose-headings:font-medium',
          contentClassName,
        ),
      },
    },
    onCreate: ({ editor }) => {
      onReadyRef.current?.(editor);
      // Put the cursor in the body — unless the person already started typing
      // somewhere else (e.g. the title), so we never steal their focus.
      if (!autoFocus) return;
      requestAnimationFrame(() => {
        const active = document.activeElement;
        const typingElsewhere =
          active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
        // The view may not be attached yet (or already torn down) — skip quietly.
        if (typingElsewhere || editor.isDestroyed || !editor.view.dom.isConnected) return;
        try {
          editor.commands.focus('end');
        } catch {
          // Focus is a nicety; never break the writer over it.
        }
      });
    },
    onUpdate: ({ editor }) => onChangeRef.current(editor.getMarkdown()),
  });

  return (
    <div className={cn('lore-editor', className)}>
      {/* Desktop only: on phones the native selection popup is better, and
          markdown shortcuts (**bold**, # heading, - list) still work. */}
      {editor && hasFinePointer() && (
        <BubbleMenu
          editor={editor}
          className="flex items-center gap-0.5 rounded-lg border bg-popover p-1 shadow-md"
        >
          {[
            {
              icon: Bold,
              label: 'Bold',
              active: 'bold',
              run: () => editor.chain().focus().toggleBold().run(),
            },
            {
              icon: Italic,
              label: 'Italic',
              active: 'italic',
              run: () => editor.chain().focus().toggleItalic().run(),
            },
            {
              icon: Heading2,
              label: 'Heading',
              active: 'heading',
              run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
            },
            {
              icon: Quote,
              label: 'Quote',
              active: 'blockquote',
              run: () => editor.chain().focus().toggleBlockquote().run(),
            },
            {
              icon: List,
              label: 'List',
              active: 'bulletList',
              run: () => editor.chain().focus().toggleBulletList().run(),
            },
            {
              icon: ListOrdered,
              label: 'Numbered list',
              active: 'orderedList',
              run: () => editor.chain().focus().toggleOrderedList().run(),
            },
          ].map(({ icon: Icon, label, active, run }) => (
            <button
              key={label}
              type="button"
              onClick={run}
              aria-label={label}
              className={cn(
                'rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground',
                editor.isActive(active) && 'bg-accent text-foreground',
              )}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
