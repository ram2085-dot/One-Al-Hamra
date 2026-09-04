import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';

const TTL_MS = 2 * 60 * 1000;

interface Entry {
  userId: string;
  serviceId: string;
  expiresAt: number;
}

/**
 * In-memory, single-use step-up tokens. Not persisted — an API restart invalidates all
 * outstanding tokens, which is acceptable for this prototype (spec §11) and matches Phase 2's
 * in-process handling of short-lived OIDC state/PKCE values.
 */
@Injectable()
export class ReauthTokenStore {
  private entries = new Map<string, Entry>();

  issue(scope: { userId: string; serviceId: string }): string {
    const token = randomBytes(32).toString('hex');
    this.entries.set(token, { ...scope, expiresAt: Date.now() + TTL_MS });
    return token;
  }

  consume(token: string, userId: string, serviceId: string): boolean {
    const entry = this.entries.get(token);
    if (!entry) return false;
    this.entries.delete(token); // single-use: gone whether or not it matched
    if (entry.expiresAt < Date.now()) return false;
    return entry.userId === userId && entry.serviceId === serviceId;
  }
}
