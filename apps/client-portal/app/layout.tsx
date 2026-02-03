import './globals.css';

export const metadata = {
  title: 'Client Portal',
  description: 'Premium client portal experience for Metro 2 CRM.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
