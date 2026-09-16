import type { Metadata } from "next";
import "./globals.css";
import "./neon-theme.css";
import "./participation.css";
import "./member-profile.css";

export const metadata: Metadata = {
  title: "Sonnet Tables · Find your people. Write your verse.",
  description: "An independent table lobby for the Technocore Sonnet Challenge. Discover teams, follow signed rosters and compose together.",
  icons: {
    icon: "/sonnet.svg",
    shortcut: "/sonnet.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
