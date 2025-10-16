import { cn } from '@/lib/utils';

function Badge({ className, variant = 'default', ...props }) {
  const variants = {
    default:
      'border border-transparent bg-accent/15 text-accent',
    outline:
      'border border-border/60 bg-transparent text-foreground/70',
    success:
      'border border-emerald-500/40 bg-emerald-500/12 text-emerald-300',
    warning:
      'border border-amber-500/40 bg-amber-500/12 text-amber-200',
    destructive:
      'border border-red-500/40 bg-red-500/15 text-red-200',
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
