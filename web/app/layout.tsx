import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Especiação Química em Solução Aquosa",
  description:
    "Ferramenta científica para configurar e examinar equilíbrios ácido-base orientados a componentes.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
