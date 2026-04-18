import { firestore } from './firestore.repo.js'

export { checkAndIncrementFreeQuota, getFreeQuotaStatus }
export type { QuotaCheckResult, QuotaStatus, QuotaPlan }

type QuotaPlan = 'FREE' | 'PRO' | 'TEAM' | 'ENTERPRISE'

type QuotaDoc = {
  clientTokenHash: string
  plan: QuotaPlan
  windowStartIso: string
  count: number
  updatedAtIso: string
}

type QuotaCheckResult =
  | { allowed: true; used: number; limit: number; windowEndsAtIso: string; plan: QuotaPlan }
  | {
      allowed: false
      reason: 'FREE_MONTHLY_LIMIT'
      used: number
      limit: number
      windowEndsAtIso: string
      plan: QuotaPlan
    }

type QuotaStatus = {
  used: number
  limit: number
  remaining: number
  windowEndsAtIso: string
  plan: QuotaPlan
}

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000

const parseNonNegInt = (raw: string | undefined, fallback: number): number => {
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 0) return fallback
  return n
}

const DEFAULT_FREE_LIMIT = parseNonNegInt(process.env.FREE_MONTHLY_ANALYSIS_LIMIT, 10)
const QUOTA_ENABLED = (process.env.QUOTA_ENFORCEMENT_ENABLED ?? 'true') !== 'false'

const nowIso = () => new Date().toISOString()

const computeWindowEnd = (windowStartIso: string): string => {
  const start = Date.parse(windowStartIso)
  if (!Number.isFinite(start)) return new Date(Date.now() + WINDOW_MS).toISOString()
  return new Date(start + WINDOW_MS).toISOString()
}

const isWindowExpired = (windowStartIso: string): boolean => {
  const start = Date.parse(windowStartIso)
  if (!Number.isFinite(start)) return true
  return Date.now() - start > WINDOW_MS
}

const docRef = (clientTokenHash: string) =>
  firestore.collection('quotas').doc(clientTokenHash)

const checkAndIncrementFreeQuota = async (
  clientTokenHash: string
): Promise<QuotaCheckResult> => {
  if (!QUOTA_ENABLED || DEFAULT_FREE_LIMIT === 0) {
    return {
      allowed: true,
      used: 0,
      limit: 0,
      windowEndsAtIso: new Date(Date.now() + WINDOW_MS).toISOString(),
      plan: 'FREE'
    }
  }

  const ref = docRef(clientTokenHash)

  try {
    return await firestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      const now = nowIso()
      const current = snap.exists ? (snap.data() as QuotaDoc) : null
      const plan = (current?.plan ?? 'FREE') as QuotaPlan

      // Non-FREE plans are not enforced here; allow through.
      if (plan !== 'FREE') {
        tx.set(ref, { updatedAtIso: now } satisfies Partial<QuotaDoc>, { merge: true })
        return {
          allowed: true as const,
          used: current?.count ?? 0,
          limit: 0,
          windowEndsAtIso: computeWindowEnd(current?.windowStartIso ?? now),
          plan
        }
      }

      const windowStartIso =
        current && !isWindowExpired(current.windowStartIso) ? current.windowStartIso : now
      const previousCount =
        current && current.windowStartIso === windowStartIso ? current.count : 0

      if (previousCount >= DEFAULT_FREE_LIMIT) {
        return {
          allowed: false as const,
          reason: 'FREE_MONTHLY_LIMIT',
          used: previousCount,
          limit: DEFAULT_FREE_LIMIT,
          windowEndsAtIso: computeWindowEnd(windowStartIso),
          plan
        }
      }

      const nextCount = previousCount + 1
      const next: QuotaDoc = {
        clientTokenHash,
        plan,
        windowStartIso,
        count: nextCount,
        updatedAtIso: now
      }
      tx.set(ref, next)

      return {
        allowed: true as const,
        used: nextCount,
        limit: DEFAULT_FREE_LIMIT,
        windowEndsAtIso: computeWindowEnd(windowStartIso),
        plan
      }
    })
  } catch (error) {
    // Fail-open: don't block a user because Firestore is unavailable.
    console.warn(
      JSON.stringify({
        event: 'quota_check_failed_fail_open',
        message: error instanceof Error ? error.message : 'unknown'
      })
    )
    return {
      allowed: true,
      used: 0,
      limit: DEFAULT_FREE_LIMIT,
      windowEndsAtIso: new Date(Date.now() + WINDOW_MS).toISOString(),
      plan: 'FREE'
    }
  }
}

const getFreeQuotaStatus = async (clientTokenHash: string): Promise<QuotaStatus> => {
  if (!QUOTA_ENABLED || DEFAULT_FREE_LIMIT === 0) {
    return {
      used: 0,
      limit: 0,
      remaining: 0,
      windowEndsAtIso: new Date(Date.now() + WINDOW_MS).toISOString(),
      plan: 'FREE'
    }
  }

  try {
    const snap = await docRef(clientTokenHash).get()
    if (!snap.exists) {
      return {
        used: 0,
        limit: DEFAULT_FREE_LIMIT,
        remaining: DEFAULT_FREE_LIMIT,
        windowEndsAtIso: new Date(Date.now() + WINDOW_MS).toISOString(),
        plan: 'FREE'
      }
    }
    const data = snap.data() as QuotaDoc
    const plan = (data.plan ?? 'FREE') as QuotaPlan
    if (plan !== 'FREE') {
      return {
        used: 0,
        limit: 0,
        remaining: 0,
        windowEndsAtIso: computeWindowEnd(data.windowStartIso),
        plan
      }
    }
    const windowExpired = isWindowExpired(data.windowStartIso)
    const used = windowExpired ? 0 : data.count
    const remaining = Math.max(0, DEFAULT_FREE_LIMIT - used)
    return {
      used,
      limit: DEFAULT_FREE_LIMIT,
      remaining,
      windowEndsAtIso: windowExpired
        ? new Date(Date.now() + WINDOW_MS).toISOString()
        : computeWindowEnd(data.windowStartIso),
      plan
    }
  } catch {
    return {
      used: 0,
      limit: DEFAULT_FREE_LIMIT,
      remaining: DEFAULT_FREE_LIMIT,
      windowEndsAtIso: new Date(Date.now() + WINDOW_MS).toISOString(),
      plan: 'FREE'
    }
  }
}
