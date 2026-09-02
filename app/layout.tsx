import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "PoseBound — naturalny ruch postaci 2D", description: "Interaktywny prototyp ograniczeń anatomicznych i ruchu postaci 2D.", icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pl"><body>{children}</body></html>; }
