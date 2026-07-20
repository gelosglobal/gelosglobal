import { auth, ensureAuthMongo } from '@/lib/auth'
import { canDeleteDtcInventory } from '@/lib/access'
import { DtcInventoryView } from '@/components/dtc/inventory-view'
import { headers } from 'next/headers'

export default async function DtcInventoryPage() {
  await ensureAuthMongo()
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  const canDelete = canDeleteDtcInventory(session as any)

  return <DtcInventoryView canDelete={canDelete} />
}
