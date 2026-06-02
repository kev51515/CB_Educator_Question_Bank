/**
 * Auth barrel. Single import surface for the gate so `main.tsx` stays clean.
 */
export { AuthGate } from "./AuthGate";
export { AuthScreen } from "./AuthScreen";
export { QuickStartScreen } from "./QuickStartScreen";
export { useStudentSession } from "./session";
export { AccountUpgradeBanner } from "./AccountUpgradeBanner";
export { UpgradeAccountModal } from "./UpgradeAccountModal";
export { AccountSettings } from "./AccountSettings";
export { AccountRoutes } from "./AccountRoutes";
export { StaffShell } from "./StaffShell";
export { StudentShell } from "./StudentShell";
export type { StudentSession, StudentArea, AuthResult, SignUpRole } from "./session";
