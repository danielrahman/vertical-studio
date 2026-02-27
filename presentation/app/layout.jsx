import './globals.css';
import Link from 'next/link';
import { Playfair_Display, Manrope } from 'next/font/google';

const headingFont = Playfair_Display({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-heading'
});

const bodyFont = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body'
});

export const metadata = {
  title: 'Vertical Studio Ops',
  description: 'Operations dashboard for generation, extraction and deploy workflows.'
};

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/generate', label: 'Generate' },
  { href: '/extractor', label: 'Extractor' },
  { href: '/companies', label: 'Companies' }
];

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${headingFont.variable} ${bodyFont.variable}`}>
      <body style={{ fontFamily: 'var(--font-body)' }}>
        <div className="min-h-screen">
          <header className="sticky top-0 z-30 border-b border-white/40 bg-white/80 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-moss/70">Vertical Studio v2</p>
                <h1 className="text-2xl text-ink" style={{ fontFamily: 'var(--font-heading)' }}>
                  Automation Console
                </h1>
              </div>

              <nav className="flex items-center gap-2 rounded-full bg-white p-1 shadow-card">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-full px-4 py-2 text-sm font-semibold text-ink transition hover:bg-mist"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>

          <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
