import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'P&G Cohort Analysis',
  description: 'Creator cohort retention & GMV by cohort for Pattern P&G brands',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
