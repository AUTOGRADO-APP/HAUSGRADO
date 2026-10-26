import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono, Press_Start_2P } from "next/font/google";
import "./globals.css";
import "./glass.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-jakarta", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-mono", display: "swap" });
const press = Press_Start_2P({ subsets: ["latin"], weight: "400", variable: "--font-press", display: "swap" });

export const metadata: Metadata = {
  title: "Hausgrado · Autogrado",
  description: "Gestão de pátio da oficina Autogrado",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// Aplica o tema salvo antes de pintar a tela (evita "piscar" claro→escuro). Mesma chave do protótipo.
const themeScript = `try{var t=localStorage.getItem('autogrado-tema');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-theme="light" className={`${jakarta.variable} ${mono.variable} ${press.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
