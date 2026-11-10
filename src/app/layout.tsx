import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "kedg견적관리", description: "정보통신공사 견적관리" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
