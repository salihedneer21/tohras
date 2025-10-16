import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';

const NAV_LINKS = [
  { path: '/', label: 'Users' },
  { path: '/training', label: 'Training' },
  { path: '/generate', label: 'Generate' },
];

function Navbar() {
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  const isActive = (path) => location.pathname === path;

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-background/95 backdrop-blur">
      <div className="container flex h-16 items-center justify-between gap-4 sm:h-20">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground/90 transition hover:text-foreground"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent text-base font-bold text-accent-foreground shadow-subtle sm:h-11 sm:w-11">
            AI
          </span>
          <span className="hidden text-lg font-semibold sm:inline-flex">
            AI Book Story
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <nav
            className={cn(
              'fixed inset-x-4 top-20 z-40 flex flex-col gap-2 rounded-2xl border border-border/70 bg-background p-4 shadow-subtle transition-all sm:static sm:inset-auto sm:flex-row sm:items-center sm:gap-1 sm:rounded-full sm:border-transparent sm:bg-transparent sm:p-0 sm:shadow-none',
              isMenuOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0 sm:pointer-events-auto sm:opacity-100'
            )}
          >
            {NAV_LINKS.map(({ path, label }) => (
              <Link
                key={path}
                to={path}
                className={cn(
                  'rounded-xl px-4 py-2 text-sm font-medium text-foreground/70 transition hover:text-foreground sm:rounded-full',
                  isActive(path)
                    ? 'bg-accent text-accent-foreground shadow-subtle'
                    : 'hover:bg-muted/60'
                )}
              >
                {label}
              </Link>
            ))}
          </nav>

          <Button
            variant="secondary"
            size="icon"
            className="rounded-xl border border-border/70 bg-card text-foreground/80 hover:border-border hover:bg-card sm:hidden"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            aria-expanded={isMenuOpen}
            aria-label="Toggle navigation"
          >
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
