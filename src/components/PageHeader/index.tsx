import { cn } from '@/lib/utils';

interface Props {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  back?: React.ReactNode;
  className?: string;
}

export default function PageHeader({ title, subtitle, actions, back, className }: Props) {
  return (
    <header className={cn('pt-safe', className)}>
      {back && <div className="mb-2 mt-3 md:mt-0">{back}</div>}
      <div className={cn('flex items-start gap-3', !back && 'pt-6 md:pt-2')}>
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-3xl font-medium tracking-tight md:text-4xl">{title}</h1>
          {subtitle && <div className="mt-1.5 text-sm text-muted-foreground">{subtitle}</div>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
    </header>
  );
}
