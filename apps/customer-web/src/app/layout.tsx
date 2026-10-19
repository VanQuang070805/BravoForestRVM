import type { Metadata } from 'next';
import { Be_Vietnam_Pro, JetBrains_Mono, Newsreader } from 'next/font/google';
import '../styles/globals.css';

const beVietnamPro = Be_Vietnam_Pro({
  variable: '--font-be-vietnam-pro',
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap'
});

const jetBrains = JetBrains_Mono({
  variable: '--font-jetbrains',
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600'],
  display: 'swap'
});

const newsreader = Newsreader({
  variable: '--font-newsreader',
  subsets: ['latin', 'vietnamese'],
  style: ['italic'],
  weight: ['400', '500'],
  display: 'swap'
});

export const metadata: Metadata = {
  title: 'BravoForest | Hệ sinh thái thu gom bao bì RVM & Đổi thưởng xanh',
  description: 'Tìm điểm tiếp nhận bao bì RVM, theo dõi điểm thưởng xanh và đổi voucher ưu đãi từ các đối tác.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.png', type: 'image/png' }
    ],
    apple: '/apple-icon.png'
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className={`${beVietnamPro.variable} ${jetBrains.variable} ${newsreader.variable}`}>
      <body className={beVietnamPro.className}>{children}</body>
    </html>
  );
}
