/**
 * Shared types for the (now code-split) authenticated route trees.
 *
 * AccountContext bundles the mutations + identity that account-aware routes
 * (AccountRoutes) need. It's threaded from AuthGate into StudentRoutesTree /
 * StaffRoutesTree so route definitions stay declarative. Lives in its own
 * module so AuthGate and both lazy tree chunks can import it without pulling
 * either tree into the other's chunk.
 */
import type { Profile } from "@/lib/profile";
import type { AuthResult } from "./session";

export interface AccountContext {
  profile: Profile;
  email: string;
  updateDisplayName: (name: string) => Promise<AuthResult>;
  updatePassword: (newPassword: string) => Promise<AuthResult>;
  onSignOut: () => Promise<void> | void;
}
