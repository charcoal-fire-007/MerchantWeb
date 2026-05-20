import type { MerchantNotification } from './api'

export const DASHBOARD_NOTIFICATION_WINDOW_MS = 2 * 60 * 60 * 1000

interface RecentUnreadNotificationOptions {
  now?: Date
  localReadIds?: Set<string>
  windowMs?: number
}

export function getRecentUnreadNotifications(
  notifications: MerchantNotification[],
  options: RecentUnreadNotificationOptions = {},
) {
  const nowTime = (options.now || new Date()).getTime()
  const localReadIds = options.localReadIds || new Set<string>()
  const windowMs = options.windowMs ?? DASHBOARD_NOTIFICATION_WINDOW_MS

  return notifications
    .filter((notification) => {
      if (notification.read_at || localReadIds.has(notification.id)) {
        return false
      }
      const assignedTime = new Date(notification.assigned_at).getTime()
      if (Number.isNaN(assignedTime)) {
        return false
      }
      const ageMs = nowTime - assignedTime
      return ageMs >= 0 && ageMs <= windowMs
    })
    .sort((left, right) => new Date(right.assigned_at).getTime() - new Date(left.assigned_at).getTime())
}
