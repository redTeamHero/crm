import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PortalDashboard from '@/components/PortalDashboard';
import { getPortalData } from '@/lib/api';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

type PageProps = {
  params: {
    id: string;
  };
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const consumerId = params.id;
  return {
    title: `Client Portal • ${consumerId}`,
  };
}

export default async function PortalPage({ params }: PageProps) {
  const data = await getPortalData(params.id);
  if (!data) {
    notFound();
  }
  return <PortalDashboard portal={data} />;
}
