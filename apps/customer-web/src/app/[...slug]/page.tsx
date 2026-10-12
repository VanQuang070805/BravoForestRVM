import { CustomerShell, CustomerPage } from '../../components/customer-app';

export default async function RoutePage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return <CustomerShell><CustomerPage route={slug.join('/')} /></CustomerShell>;
}
