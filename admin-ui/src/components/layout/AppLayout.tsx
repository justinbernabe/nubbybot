import { Outlet, Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/logs', label: 'Logs' },
  { href: '/prompts', label: 'Prompts' },
  { href: '/settings', label: 'Settings' },
  { href: '/chat', label: 'Chat' },
];

export function AppLayout() {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-50 flex h-14 items-center gap-1 bg-white px-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <span className="mr-6 text-sm font-extrabold tracking-tight">NubbyBot</span>
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            to={link.href}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              pathname === link.href
                ? 'text-foreground font-semibold'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <main className="mx-auto max-w-[960px] px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
