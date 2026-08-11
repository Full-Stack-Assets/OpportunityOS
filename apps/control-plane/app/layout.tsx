import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: 'OpportunityOS',
  description: 'Governed opportunity execution control plane',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
