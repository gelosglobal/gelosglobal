import { auth, ensureAuthMongo } from '@/lib/auth'
import { canMutateSfInventory } from '@/lib/access'
import { SfInventoryView } from '@/components/sf/sf-inventory-view'
import { headers } from 'next/headers'

export default async function SfInventoryPage() {
  await ensureAuthMongo()
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  const readOnly = !canMutateSfInventory(session as any)
  return <SfInventoryView readOnly={readOnly} />
}
