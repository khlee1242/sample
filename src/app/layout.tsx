import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "정보통신공사 견적관리", description: "견적관리 개발 환경" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
