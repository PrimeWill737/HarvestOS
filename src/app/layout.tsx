import type { Metadata } from 'next';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/manrope/700.css';
import '@/styles/globals.scss';
export const metadata: Metadata = {
  title: { default: 'HarvestOS — Every harvest deserves a market', template: '%s | HarvestOS' },
  description:
    'Coordinate perishable produce, discover compatible buyers, and verify real outcomes.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
