'use client';

import PortalDashboard from '@/components/PortalDashboard';
import { samplePortal } from '@/lib/sample-portal';

export default function Page() {
  return <PortalDashboard portal={samplePortal} />;
}
