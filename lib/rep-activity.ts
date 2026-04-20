import type { Db, WithoutId } from 'mongodb'
import { ObjectId } from 'mongodb'

export const REP_ACTIVITY_COLLECTION = 'rep_activity'

export type RepActivityType = 'page_view'

export type RepActivityDoc = {
  _id: ObjectId
  repName: string
  type: RepActivityType
  pathname: string
  pageTitle: string
  visitedAt: Date
  createdAt: Date
}

export type CreateRepActivityInput = {
  repName: string
  pathname: string
  pageTitle: string
  visitedAt?: Date
}

function activityCollection(db: Db) {
  return db.collection<WithoutId<RepActivityDoc>>(REP_ACTIVITY_COLLECTION)
}

export async function logRepPageView(db: Db, input: CreateRepActivityInput) {
  const now = new Date()
  const doc: WithoutId<RepActivityDoc> = {
    repName: input.repName.trim().slice(0, 120) || 'Unknown',
    type: 'page_view',
    pathname: input.pathname.slice(0, 300),
    pageTitle: input.pageTitle.slice(0, 200),
    visitedAt: input.visitedAt ?? now,
    createdAt: now,
  }
  await activityCollection(db).insertOne(doc)
}

