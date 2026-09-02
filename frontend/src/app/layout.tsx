import type { ReactNode } from 'react';
import './globals.css';

/**
 * The root layout renders no <html>: every real page lives under /[locale], and
 * that layout emits the document so `lang` can carry the actual locale. Next
 * still requires a root layout to exist, so this one just passes children
 * through.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
