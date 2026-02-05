import PortalDashboard from '@/components/PortalDashboard';
import { getPortalData } from '@/lib/api';

type PageProps = {
  params: { consumerId: string };
};

export default async function Page({ params }: PageProps) {
  const portal = await getPortalData(params.consumerId);

  if (!portal) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12 text-center">
        <div className="max-w-md space-y-3">
          <h1 className="text-2xl font-semibold text-slate-900">Portal unavailable</h1>
          <p className="text-sm text-slate-600">
            We could not find portal data for this client. Double-check the consumer ID or try again later.
          </p>
        </div>
      </main>
    );
  }

  return <PortalDashboard portal={portal} />;
}
