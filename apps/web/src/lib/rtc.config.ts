/**
 * RTC configuration.
 *
 * Set VITE_RTC_APP_ID in your .env.local file:
 *   VITE_RTC_APP_ID=your_rtc_app_id_here
 */

export const RTC_APP_ID = import.meta.env.VITE_RTC_APP_ID ?? ''

export const RTC_ENABLED = !!RTC_APP_ID
