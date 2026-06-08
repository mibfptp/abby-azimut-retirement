import type { Metadata } from 'next';
import { Playfair_Display } from 'next/font/google';
import './globals.css';

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-playfair',
  display: 'swap',
});

export const metadata: Metadata = {
  title: '退休夠不夠 — 60 秒試算',
  description: '輸入年齡、存款、月存,看看你的退休準備率。',
  openGraph: {
    title: '退休夠不夠 — 60 秒試算',
    description: '輸入年齡、存款、月存,看看你的退休準備率。',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" className={playfair.variable}>
      <body>{children}</body>
    </html>
  );
}
