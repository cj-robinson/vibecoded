import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DBE Bets",
  description: "Prediction markets for friends",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
