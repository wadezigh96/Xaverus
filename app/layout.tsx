import type { Metadata } from "next";
import "./globals.css";
import Providers from "../components/providers";
export const metadata: Metadata = { title: "Xaverus — Safe Agent Passport", description: "User-controlled safety layer for autonomous onchain agents." };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><Providers>{children}</Providers></body></html>}