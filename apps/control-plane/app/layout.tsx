import type { Metadata } from 'next';
import { AmplitudeClient } from './amplitude-client';
import './styles.css';
import './review.css';

export const metadata: Metadata = {
  title: 'OpportunityOS',
  description: 'Governed opportunity execution control plane',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AmplitudeClient />
        {children}
      </body>
    </html>
  );
}
