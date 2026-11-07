import type { ClaimedInboxEvent, InboxTransaction } from "./inbox.types.js";

export interface InboxEventHandler {
  handle(
    event: ClaimedInboxEvent,
    tx: InboxTransaction
): Promise<void>;
}

