/**
 * Render memory text. react-markdown never renders raw HTML, so user content
 * can't inject scripts.
 */
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface Props {
  children: string;
  className?: string;
}

export default function Markdown({ children, className }: Props) {
  return (
    <div
      className={cn(
        'prose prose-neutral max-w-none font-serif text-[1.1rem] leading-relaxed dark:prose-invert',
        'prose-headings:font-serif prose-headings:font-medium prose-p:my-3 prose-a:underline-offset-4',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: linkChildren }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {linkChildren}
            </a>
          ),
          img: () => null,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
