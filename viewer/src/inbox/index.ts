/**
 * inbox — barrel.
 *
 * Public surface for the 1:1 direct-messaging feature. Routes are wired up
 * in `auth/AuthGate.tsx`; nav entry points live in `auth/StaffShell.tsx`
 * (staff) and `auth/StudentBadge.tsx` (students).
 */
export { InboxPage } from "./InboxPage";
export { ThreadView } from "./ThreadView";
export { NewThreadModal } from "./NewThreadModal";
export { useThreads } from "./useThreads";
export type { InboxThreadSummary, InboxOtherParticipant } from "./useThreads";
export { useThreadMessages } from "./useThreadMessages";
export type { InboxMessage } from "./useThreadMessages";
export { sendDirectMessage } from "./sendDirectMessage";
