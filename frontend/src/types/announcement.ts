export interface Announcement {
  id: number;
  title: string;
  content: string;
  createdAt: string;
}

export interface UserAnnouncement extends Announcement {
  isRead: boolean;
  readAt: string | null;
}
