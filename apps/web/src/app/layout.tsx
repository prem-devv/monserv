import type { Metadata } from 'next';
import './globals.css';

import AuthProvider from '@/components/AuthProvider';

export const metadata: Metadata = {
  title: 'Monserv',
  description: 'Self-hosted spatial uptime monitoring',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        {/* Ambient spatial light layer — fixed behind all content */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
        >
          <div className="absolute -top-40 -left-32 h-[36rem] w-[36rem] rounded-full bg-sky-400/14 blur-[130px]" />
          <div className="absolute top-1/3 right-[-10rem] h-[32rem] w-[32rem] rounded-full bg-cyan-400/10 blur-[140px]" />
          <div className="absolute bottom-[-12rem] left-1/3 h-[34rem] w-[34rem] rounded-full bg-violet-500/8 blur-[150px]" />
        </div>

        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
