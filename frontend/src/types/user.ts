export type UserRole = "admin" | "user";
export type UserStatus = "active" | "disabled";

export interface PublicUser {
  id: number;
  username: string;
  role: UserRole;
  status: UserStatus;
  expiresAt: string;
  remark: string;
  token: string;
  lastClient: string | null;
  lastAccessAt: string | null;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClientLink {
  client: string;
  name: string;
  link: string;
  enabled: boolean;
}

export interface SubscriptionData {
  user: PublicUser;
  genericLink: string;
  clientLinks: ClientLink[];
  instructions: string[];
}
