import { AdminShell, AdminPage } from '../../components/admin-app';

export default async function RoutePage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return <AdminShell><AdminPage route={slug.join('/')} /></AdminShell>;
}
