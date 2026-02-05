import type { RetentionMode } from './enums.js'

  export type RetentionPolicy = {
    mode: RetentionMode
    ttlHours?: number
  }
    export type Session = {
    clientTokenHash: string
    retentionPolicy: RetentionPolicy
    language?: string
    domainTag?: string
    createdAt: Date | string
    updatedAt: Date | string
    }
