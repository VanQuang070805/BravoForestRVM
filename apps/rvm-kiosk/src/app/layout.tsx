import type { Metadata } from 'next';
import '../styles/globals.css';
export const metadata:Metadata={title:'BravoForest RVM',description:'Màn hình gửi chai nhựa BravoForest'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="vi"><body>{children}</body></html>}
