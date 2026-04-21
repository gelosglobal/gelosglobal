import type { Db, WithoutId } from 'mongodb'
import { ObjectId } from 'mongodb'

export const REP_TASKS_COLLECTION = 'rep_tasks'

export type RepTaskPriority = 'low' | 'medium' | 'high'
// NOTE: Older records used ('open' | 'done'). We map them at serialization time.
export type RepTaskStatus = 'started' | 'in_progress' | 'done'
export type LegacyRepTaskStatus = 'open' | 'done'

export type RepTaskDoc = {
  _id: ObjectId
  repName: string
  title: string
  dueAt?: Date
  priority: RepTaskPriority
  status: RepTaskStatus | LegacyRepTaskStatus
  notes?: string
  createdAt: Date
  updatedAt: Date
}

export type RepTaskJson = {
  id: string
  repName: string
  title: string
  dueAt: string | null
  priority: RepTaskPriority
  status: RepTaskStatus
  notes: string | null
  createdAt: string
  updatedAt: string
}

export function serializeRepTask(doc: RepTaskDoc): RepTaskJson {
  const status: RepTaskStatus =
    doc.status === 'open' ? 'started' : doc.status === 'done' ? 'done' : doc.status
  return {
    id: doc._id.toHexString(),
    repName: doc.repName,
    title: doc.title,
    dueAt: doc.dueAt ? doc.dueAt.toISOString() : null,
    priority: doc.priority,
    status,
    notes: doc.notes ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }
}

function col(db: Db) {
  return db.collection<WithoutId<RepTaskDoc>>(REP_TASKS_COLLECTION)
}

export type CreateRepTaskInput = {
  repName: string
  title: string
  dueAt?: Date
  priority?: RepTaskPriority
  notes?: string
}

export async function createRepTask(db: Db, input: CreateRepTaskInput): Promise<RepTaskDoc> {
  const now = new Date()
  const doc: WithoutId<RepTaskDoc> = {
    repName: input.repName.trim(),
    title: input.title.trim(),
    dueAt: input.dueAt,
    priority: input.priority ?? 'medium',
    status: 'started',
    notes: input.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  }
  const res = await col(db).insertOne(doc)
  return { _id: res.insertedId, ...doc }
}

export type UpdateRepTaskInput = Partial<{
  repName: string
  title: string
  dueAt: Date | null
  priority: RepTaskPriority
  status: RepTaskStatus
  notes: string | null
}>

export async function updateRepTask(
  db: Db,
  id: ObjectId,
  patch: UpdateRepTaskInput,
): Promise<RepTaskDoc | null> {
  const $set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.repName !== undefined) $set.repName = patch.repName.trim()
  if (patch.title !== undefined) $set.title = patch.title.trim()
  if (patch.dueAt !== undefined) $set.dueAt = patch.dueAt ?? undefined
  if (patch.priority !== undefined) $set.priority = patch.priority
  if (patch.status !== undefined) $set.status = patch.status
  if (patch.notes !== undefined) $set.notes = patch.notes ? patch.notes.trim() : undefined

  const res = await col(db).findOneAndUpdate({ _id: id }, { $set }, { returnDocument: 'after' })
  return res as RepTaskDoc | null
}

export async function deleteRepTask(db: Db, id: ObjectId): Promise<boolean> {
  const r = await col(db).deleteOne({ _id: id })
  return r.deletedCount === 1
}

export async function listRepTasks(db: Db): Promise<RepTaskDoc[]> {
  const rows = await col(db)
    .find({})
    .sort({ updatedAt: -1 })
    .limit(500)
    .toArray()
  return rows.map((r) => r as RepTaskDoc)
}

