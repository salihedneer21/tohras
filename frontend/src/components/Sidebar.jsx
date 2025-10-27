import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Zap,
  BookOpen,
  Users,
  Sparkles,
  GraduationCap,
  Wand2,
  BarChart3,
  Menu,
  X,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import { Sun, Moon } from 'lucide-react';

const NAVIGATION = [
  {
    section: 'Main',
    items: [
      {
        path: '/dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard
      },
      {
        path: '/automate',
        label: 'Automate',
        icon: Zap
      },
      {
        path: '/books',
        label: 'Book',
        icon: BookOpen
      },
    ]
  },
  {
    section: 'Management',
    items: [
      {
        label: 'Users',
        icon: Users,
        children: [
          { path: '/users', label: 'Users' },
          { path: '/generate', label: 'Generate' },
          { path: '/training', label: 'Training' },
        ]
      },
      {
        label: 'Studio',
        icon: Wand2,
        children: [
          { path: '/prompts', label: 'Prompt Studio' },
          { path: '/evaluate', label: 'Evaluate' },
        ]
      },
    ]
  },
];

function Sidebar() {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState(['Users', 'Studio']);

  const isActive = (path) => {
    if (path === '/dashboard') {
      return location.pathname === '/' || location.pathname === '/dashboard';
    }
    if (path === '/books') {
      return location.pathname.startsWith('/books');
    }
    return location.pathname.startsWith(path);
  };

  const toggleExpanded = (label) => {
    setExpandedItems(prev =>
      prev.includes(label)
        ? prev.filter(item => item !== label)
        : [...prev, label]
    );
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 left-4 z-50 flex h-10 w-10 items-center justify-center rounded-lg bg-card border border-border shadow-sm lg:hidden"
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Backdrop for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-40 h-screen w-72 border-r border-border bg-card transition-transform duration-200 lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center border-b border-border px-6">
            <Link
              to="/dashboard"
              className="flex items-center gap-3"
              onClick={() => setIsOpen(false)}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-base font-bold text-white">
                AI
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-base font-semibold text-foreground">AI Book Story</span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Admin Hub
                </span>
              </div>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-4 py-6">
            <div className="space-y-6">
              {NAVIGATION.map((section) => (
                <div key={section.section}>
                  <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {section.section}
                  </h3>
                  <div className="space-y-1">
                    {section.items.map((item) => {
                      if (item.children) {
                        const isExpanded = expandedItems.includes(item.label);
                        const hasActiveChild = item.children.some(child => isActive(child.path));

                        return (
                          <div key={item.label}>
                            <button
                              onClick={() => toggleExpanded(item.label)}
                              className={cn(
                                "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                                hasActiveChild
                                  ? "bg-brand-500/10 text-brand-500"
                                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <item.icon className="h-5 w-5" />
                                <span>{item.label}</span>
                              </div>
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                            {isExpanded && (
                              <div className="ml-8 mt-1 space-y-1">
                                {item.children.map((child) => (
                                  <Link
                                    key={child.path}
                                    to={child.path}
                                    onClick={() => setIsOpen(false)}
                                    className={cn(
                                      "block rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                                      isActive(child.path)
                                        ? "bg-brand-500/10 text-brand-500"
                                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                                    )}
                                  >
                                    {child.label}
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      }

                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={() => setIsOpen(false)}
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                            isActive(item.path)
                              ? "bg-brand-500 text-white shadow-md"
                              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                          )}
                        >
                          <item.icon className="h-5 w-5" />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </nav>

          {/* Theme Toggle */}
          <div className="border-t border-border p-4">
            <button
              onClick={toggleTheme}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="h-5 w-5" />
                  <span>Light Mode</span>
                </>
              ) : (
                <>
                  <Moon className="h-5 w-5" />
                  <span>Dark Mode</span>
                </>
              )}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
