import { randomUUID } from 'node:crypto'

// implement ID helpers
export { makeId }
// 必要なものをinport
// type makeId = (prefix: string) => string:
type IdPrefix = 'sess' | 'sub' | 'ana' | 'upl' | 'rep' | 'turn' | 'todo'

const makeId = (prefix: IdPrefix): string => {
  // prefixとUUIDの結合
  return `${prefix}_${randomUUID()}`
}
