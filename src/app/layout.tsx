import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agente de RH | Elemento",
  description:
    "Atendimento multi-tenant de dúvidas internas de RH para NorteVerde, Aurora e Vitalys.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="bg-background text-foreground antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
