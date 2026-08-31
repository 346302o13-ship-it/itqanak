/**
 * Tracks which support conversation the user has open AND on screen right now,
 * so an incoming message for it stays silent — no sound, no OS push — the way
 * WhatsApp does not notify you about the chat you are already reading.
 *
 * The value is shared two ways: in-process for the notification bell (a sibling
 * component with no common React tree), and forwarded to the service worker so
 * its `push` handler can drop the notification before it is ever shown.
 */

let activeConversationId: string | null = null;

function postToServiceWorker(conversationId: string | null): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready
    .then((registration) => {
      registration.active?.postMessage({
        type: "itq-active-conversation",
        conversationId,
        at: Date.now(),
      });
    })
    .catch(() => undefined);
}

/** Set to the conversation id while it is open and visible; null otherwise. */
export function setActiveConversation(conversationId: string | null): void {
  activeConversationId = conversationId;
  postToServiceWorker(conversationId);
}

/** The conversation the user is looking at this instant, or null. */
export function getActiveConversationId(): string | null {
  return activeConversationId;
}

/** Pull the conversation id from a MESSAGE_RECEIVED notification's action href. */
export function conversationIdFromActionHref(actionHref: string | undefined): string | null {
  if (actionHref === undefined) return null;
  const marker = "conversation=";
  const start = actionHref.indexOf(marker);
  if (start === -1) return null;
  const rest = actionHref.slice(start + marker.length);
  const end = rest.search(/[&?]/u);
  return decodeURIComponent(end === -1 ? rest : rest.slice(0, end));
}
