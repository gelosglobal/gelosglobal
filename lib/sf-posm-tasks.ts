import type { Db, WithoutId } from 'mongodb'
import { ObjectId } from 'mongodb'
import {
  SF_POSM_TASKS_COLLECTION,
  type SfPosmTaskDoc,
  type SfPosmTaskStatus,
} from '@/lib/sf-dashboard'

export type { SfPosmTaskStatus } from '@/lib/sf-dashboard'

export type SfPosmTaskJson = {
  id: string
  title: string
  outletName: string
  status: SfPosmTaskStatus
  dueAt: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

function tasksCollection(db: Db) {
  return db.collection<WithoutId<SfPosmTaskDoc>>(SF_POSM_TASKS_COLLECTION)
}

export function serializePosmTask(doc: SfPosmTaskDoc): SfPosmTaskJson {
  const updated = doc.updatedAt ?? doc.createdAt
  return {
    id: doc._id.toHexString(),
    title: doc.title,
    outletName: doc.outletName,
    status: doc.status,
    dueAt: doc.dueAt?.toISOString() ?? null,
    notes: doc.notes ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: updated.toISOString(),
  }
}

export async function listPosmTasks(
  db: Db,
  filter?: { status?: SfPosmTaskStatus },
): Promise<SfPosmTaskDoc[]> {
  const q: Record<string, unknown> = {}
  if (filter?.status) q.status = filter.status
  const rows = await tasksCollection(db)
    .find(q)
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(3000)
    .toArray()
  return rows.map((r) => r as SfPosmTaskDoc)
}

export type PosmTaskStats = {
  total: number
  open: number
  done: number
  overdueOpen: number
}

export function computePosmTaskStats(
  rows: SfPosmTaskDoc[],
  now: Date,
): PosmTaskStats {
  let open = 0
  let done = 0
  let overdueOpen = 0
  for (const r of rows) {
    if (r.status === 'done') {
      done += 1
    } else {
      open += 1
      if (r.dueAt && r.dueAt < now) overdueOpen += 1
    }
  }
  return { total: rows.length, open, done, overdueOpen }
}

export type CreatePosmTaskInput = {
  title: string
  outletName: string
  status: SfPosmTaskStatus
  dueAt?: Date
  notes?: string
}

export async function createPosmTask(
  db: Db,
  input: CreatePosmTaskInput,
): Promise<SfPosmTaskDoc> {
  const now = new Date()
  const doc: WithoutId<SfPosmTaskDoc> = {
    title: input.title.trim(),
    outletName: input.outletName.trim(),
    status: input.status,
    dueAt: input.dueAt,
    notes: input.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  }
  const res = await tasksCollection(db).insertOne(doc)
  return { _id: res.insertedId, ...doc }
}

export type UpdatePosmTaskInput = Partial<{
  title: string
  outletName: string
  status: SfPosmTaskStatus
  dueAt: Date | null
  notes: string | null
}>

export async function updatePosmTask(
  db: Db,
  id: ObjectId,
  patch: UpdatePosmTaskInput,
): Promise<SfPosmTaskDoc | null> {
  const $set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.title !== undefined) $set.title = patch.title.trim()
  if (patch.outletName !== undefined) $set.outletName = patch.outletName.trim()
  if (patch.status !== undefined) $set.status = patch.status
  if (patch.dueAt !== undefined) {
    $set.dueAt = patch.dueAt ?? null
  }
  if (patch.notes !== undefined) {
    $set.notes =
      patch.notes === null || patch.notes === '' ? null : patch.notes.trim()
  }

  const res = await tasksCollection(db).findOneAndUpdate(
    { _id: id },
    { $set },
    { returnDocument: 'after' },
  )
  return res as SfPosmTaskDoc | null
}

export async function deletePosmTask(db: Db, id: ObjectId): Promise<boolean> {
  const r = await tasksCollection(db).deleteOne({ _id: id })
  return r.deletedCount === 1
}
