import { cn } from '@/lib/utils';

function Badge({ className, variant = 'default', ...props }) {
  const variants = {
    default:
      'border border-transparent bg-secondary text-foreground/80',
    outline:
      'border border-border bg-secondary/50 text-foreground/70',
    success:
      'border border-foreground/20 bg-foreground/10 text-foreground/80',
    warning:
      'border border-foreground/20 bg-foreground/10 text-foreground/80',
    destructive:
      'border border-foreground/20 bg-foreground/10 text-foreground/80',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide',
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };
