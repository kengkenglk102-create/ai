import type { AnnouncementState } from '../types/announcement';

const EMPTY_STATE: AnnouncementState = {
  announcements: [],
  unreadIds: [],
  popupAnnouncement: null,
};

export async function getAnnouncementState(): Promise<AnnouncementState> {
  // Chặn tải thông báo từ xa để không nạp lại quảng cáo
  return EMPTY_STATE;
}

export async function markAnnouncementAsRead(_id: string): Promise<void> {}

export async function markAllAnnouncementsAsRead(): Promise<void> {}

export async function forceRefreshAnnouncements(): Promise<AnnouncementState> {
  // Chặn tải thông báo từ xa để không nạp lại quảng cáo
  return EMPTY_STATE;
}
