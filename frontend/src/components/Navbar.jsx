import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';

const NAV_LINKS = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/books', label: 'Books' },
  { path: '/prompts', label: 'Prompt Studio' },
  { path: '/users', label: 'Users' },
  { path: '/training', label: 'Training' },
  { path: '/generate', label: 'Generate' },
  { path: '/storybooks', label: 'Storybooks' },
  { path: '/automate', label: 'Automate' },
  { path: '/evaluate', label: 'Evaluate' },
];

function Navbar() {
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  const isActive = (path) => {
    if (path === '/dashboard') {
      return location.pathname === '/' || location.pathname === '/dashboard';
    }
    if (path === '/books') {
      return location.pathname.startsWith('/books');
    }
    return location.pathname.startsWith(path);
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-background/75 backdrop-blur">
      <div className="container py-3">
        <div className="nav-shell">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground/90 transition hover:text-foreground"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-accent text-base font-bold text-accent-foreground shadow-subtle sm:h-10 sm:w-10">
              AI
            </span>
            <span className="hidden flex-col leading-tight sm:flex">
              <span className="text-base font-semibold sm:text-lg">AI Book Story</span>
              <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-foreground/55">
                Admin Hub
              </span>
            </span>
          </Link>

          <nav className="nav-links">
            {NAV_LINKS.map(({ path, label }) => (
              <Link
                key={path}
                to={path}
                className={cn('nav-link', isActive(path) && 'nav-link--active')}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-foreground/60 md:inline-flex">
              Control Center
            </span>
            <Button
              asChild
              variant="secondary"
              className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/10 text-foreground/80 hover:bg-white/20 lg:inline-flex"
            >
              <Link to="/generate">
                Quick generate
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="rounded-xl border border-white/10 bg-background text-foreground/80 hover:bg-white/10 md:hidden"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              aria-expanded={isMenuOpen}
              aria-label="Toggle navigation"
            >
              {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      </div>

      <nav
        className={cn(
          'md:hidden transition duration-200',
          isMenuOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        )}
      >
        <div className="container pb-3">
          <div className="rounded-3xl border border-white/10 bg-background/95 p-4 shadow-subtle backdrop-blur">
            <div className="flex flex-col gap-2">
              {NAV_LINKS.map(({ path, label }) => (
                <Link
                  key={path}
                  to={path}
                  className={cn(
                    'rounded-2xl px-4 py-3 text-sm font-medium text-foreground/80 transition hover:bg-white/5',
                    isActive(path) && 'bg-accent text-accent-foreground'
                  )}
                >
                  {label}
                </Link>
              ))}
            </div>
            <div className="mt-3 flex gap-3">
              <Button asChild className="flex-1 rounded-2xl">
                <Link to="/generate">Quick generate</Link>
              </Button>
              <Button asChild variant="outline" className="flex-1 rounded-2xl">
                <Link to="/books">Create book</Link>
              </Button>
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
}

export default Navbar;
