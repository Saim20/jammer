import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import Navbar from '@/components/Navbar';
import { Providers } from './providers';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Vocab Jam – IELTS Vocabulary Challenge',
  description:
    'Race against the clock to master high-level IELTS vocabulary. One word. Four options. Ten seconds.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${
          geistSans.variable
        } ${geistMono.variable} antialiased bg-gray-950 text-white`}
      >
        <Providers>
          <AuthProvider>
            <Navbar />
            <main>{children}</main>
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
