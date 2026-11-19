import type { NotificationSettings, TrackerEvent } from '../types';

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  browserEnabled: true,
  soundEnabled: true,
  notifyPlaced: true,
  notifyUpdated: true,
  notifyTop10Victor: true,
  sources: {
    pointercrate: true,
    aredl: true,
  },
};

const STORAGE_KEY = 'apexlist_notification_settings_v1';

export function loadNotificationSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_NOTIFICATION_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<NotificationSettings>;
    return {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...parsed,
      sources: {
        ...DEFAULT_NOTIFICATION_SETTINGS.sources,
        ...(parsed.sources ?? {}),
      },
    };
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

export function saveNotificationSettings(settings: NotificationSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}

export function shouldTriggerForEvent(event: TrackerEvent, settings: NotificationSettings): boolean {
  if (event.source === 'Pointercrate' && !settings.sources.pointercrate) return false;
  if (event.source === 'AREDL' && !settings.sources.aredl) return false;
  if (event.type === 'demon_placed' && !settings.notifyPlaced) return false;
  if (event.type === 'demon_updated' && !settings.notifyUpdated) return false;
  if (event.type === 'top10_victor' && !settings.notifyTop10Victor) return false;
  return true;
}

export function playNotificationChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.09); // A5
    osc2.frequency.setValueAtTime(880, now + 0.08);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now + 0.08);
    osc1.stop(now + 0.45);
    osc2.stop(now + 0.45);
  } catch {
    // ignore audio autoplay restrictions
  }
}

export function sendBrowserNotification(event: TrackerEvent): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return;
  }
  try {
    const notif = new Notification(event.title, {
      body: `${event.source} · ${event.summary}`,
      tag: event.id,
      silent: false,
    });
    notif.onclick = () => {
      window.focus();
      if (event.videoUrl) {
        window.open(event.videoUrl, '_blank', 'noopener,noreferrer');
      }
      notif.close();
    };
  } catch {
    // ignore browser notification failures in restricted iframes
  }
}

export function formatRelativeTime(isoDate: string | null | undefined): string {
  if (!isoDate) return 'Recently';
  const ts = new Date(isoDate).getTime();
  if (Number.isNaN(ts)) return 'Recently';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
