import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Xaverus — Safe Agent Passport", description: "User-controlled safety layer for autonomous onchain agents." };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}