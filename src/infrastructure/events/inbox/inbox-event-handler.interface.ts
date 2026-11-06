import { ClaimedInboxEvent } from "./inbox.types.js";

export interface InboxEventHandler {
  handle(event: ClaimedInboxEvent): Promise<void>;
}

