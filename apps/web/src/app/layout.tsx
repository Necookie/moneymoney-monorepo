import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { Toaster } from '@/components/toaster';
import './globals.css';

// Inter (OFL) is downloaded at build time and self-hosted by next/font — no runtime requests to
// Google.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'money money.', template: '%s · money money.' },
  description: 'Know your money before you spend it.',
  applicationName: 'money money.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#F4F2F0',
  width: 'device-width',
  initialScale: 1,
};

const clerkAppearance = {
  variables: {
    colorPrimary: '#0C0A08',
    colorForeground: '#0C0A08',
    colorMutedForeground: '#6D6C6B',
    colorBackground: '#FFFFFF',
    colorInput: '#FFFFFF',
    colorInputForeground: '#0C0A08',
    colorDanger: '#B42318',
    colorSuccess: '#1F7A4D',
    colorWarning: '#A15C07',
    fontFamily: 'var(--font-inter), ui-sans-serif, system-ui, sans-serif',
    borderRadius: '10px',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <ClerkProvider appearance={clerkAppearance}>
          {children}
          <Toaster />
        </ClerkProvider>
      </body>
    </html>
  );
}
