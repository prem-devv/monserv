import type { Metadata } from 'next';
import './globals.css';

import AuthProvider from '@/components/AuthProvider';

export const metadata: Metadata = {
  title: 'Monserv',
  description: 'Self-hosted monitoring application',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}