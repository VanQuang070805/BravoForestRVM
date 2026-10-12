import type { Metadata } from "next";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "BravoForest RVM Smart Terminal",
  description:
    "Hệ thống màn hình cảm ứng trạm thu gom và phân loại bao bì tự động BravoForest",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </head>
      <body>{children}</body>
    </html>
  );
}
