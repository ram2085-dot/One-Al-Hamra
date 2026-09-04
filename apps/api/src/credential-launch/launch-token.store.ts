import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';

const TTL_MS = 60 * 1000;

interface Payload {
  username: string;
  password: string;
  failureRedirect: string;
}

/** In-memory, single-use, ~60s. Holds a decrypted credential only for the moment between the
 *  launch POST and the browser fetching the inject page. Not persisted (spec §11). */
@Injectable()
export class LaunchTokenStore {
  private entries = new Map<string, { payload: Payload; expiresAt: number }>();

  mint(payload: Payload): string {
    const token = randomBytes(32).toString('hex');
    this.entries.set(token, { payload, expiresAt: Date.now() + TTL_MS });
    // Proactively evict an abandoned launch so a decrypted username+password can't sit in the
    // process heap past its TTL. consume() still deletes early on a normal launch; deleting an
    // already-gone key is a no-op. .unref() keeps this timer from holding the process open.
    setTimeout(() => this.entries.delete(token), TTL_MS).unref();
    return token;
  }

  consume(token: string): Payload | null {
    const entry = this.entries.get(token);
    if (!entry) return null;
    this.entries.delete(token);
    if (entry.expiresAt < Date.now()) return null;
    return entry.payload;
  }
}
