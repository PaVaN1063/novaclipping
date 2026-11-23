import UploadClient from '@/components/UploadClient';
import { aiReady } from '@/lib/ai';
import { readDb } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function UploadPage() {
  const db = await readDb();
  return <UploadClient aiReady={aiReady(db)} />;
}
