import { CustomerAuthLauncher } from '@/components/client-identity/CustomerAuthLauncher';

export const dynamic = 'force-dynamic';

export default function Page() {
  return <CustomerAuthLauncher variant="login" />;
}
