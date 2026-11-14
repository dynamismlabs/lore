import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface Props {
  name: string | null | undefined;
  image?: string | null;
  className?: string;
}

export function initials(name: string | null | undefined) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export default function UserAvatar({ name, image, className }: Props) {
  return (
    <Avatar className={cn('size-8', className)}>
      {image && <AvatarImage src={image} alt="" />}
      <AvatarFallback className="bg-muted text-[0.7em] font-medium text-muted-foreground">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
