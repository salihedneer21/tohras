import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60 ring-offset-background',
  {
    variants: {
      variant: {
        default: 'bg-indigo-500 text-white shadow-subtle hover:bg-indigo-400',
        secondary:
          'bg-foreground/10 text-foreground/80 hover:bg-foreground/20',
        ghost: 'bg-transparent hover:bg-foreground/10',
        outline:
          'border border-border/70 bg-background text-foreground hover:bg-background/70',
        destructive:
          'bg-red-500 text-white hover:bg-red-400 focus-visible:ring-red-500/60',
        success:
          'bg-emerald-500 text-white shadow-subtle hover:bg-emerald-400 focus-visible:ring-emerald-500/60',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-5 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

const Button = React.forwardRef(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
