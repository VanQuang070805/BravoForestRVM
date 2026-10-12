import type { Metadata } from 'next';
import '../styles/globals.css';
export const metadata: Metadata = { title: 'BravoForest Admin', description: 'Vận hành mạng lưới tái chế BravoForest.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="vi"><body>{children}</body></html>; }
