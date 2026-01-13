import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FriendBets",
  description: "Bet on life events with friends",
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
