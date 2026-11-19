import { Bell, BellOff, Check, Play, Volume2, VolumeX, X } from 'lucide-react';
import type { NotificationSettings } from '../types';

interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
  settings: NotificationSettings;
  onUpdateSettings: (next: NotificationSettings) => void;
  permission: NotificationPermission | 'unsupported';
  onRequestPermission: () => Promise<void>;
  onSendTest: (kind: 'demon_placed' | 'demon_updated' | 'top10_victor') => Promise<void>;
  streamConnected: boolean;
}

export function NotificationDrawer({
  open,
  onClose,
  settings,
  onUpdateSettings,
  permission,
  onRequestPermission,
  onSendTest,
  streamConnected,
}: NotificationDrawerProps) {
  if (!open) return null;

  const toggle = (key: 'browserEnabled' | 'soundEnabled' | 'notifyPlaced' | 'notifyUpdated' | 'notifyTop10Victor') => {
    onUpdateSettings({
      ...settings,
      [key]: !settings[key],
    });
  };

  const toggleSource = (src: 'pointercrate' | 'aredl') => {
    onUpdateSettings({
      ...settings,
      sources: {
        ...settings.sources,
        [src]: !settings.sources[src],
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-[2px]">
      <div
        className="relative flex h-full w-full max-w-md flex-col border-l border-white/[0.08] bg-[#0D1017] text-slate-100 shadow-2xl"
        role="dialog"
        aria-label="Alert Preferences"
      >
        <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-5">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight text-white">Alert Preferences</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {streamConnected ? 'Live stream active · checks every 60s' : 'Reconnecting live stream'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] text-slate-400 transition-colors hover:bg-white/[0.05] hover:text-white focus-visible:outline-2 focus-visible:outline-rose-500"
            aria-label="Close alert preferences"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          {/* Desktop Notification Permission */}
          <section className="rounded-xl border border-white/[0.08] bg-[#121621] p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-white">Desktop Notifications</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  {permission === 'granted'
                    ? 'Browser notifications are authorized. Alerts appear immediately when new changes arrive.'
                    : permission === 'denied'
                    ? 'Notifications are blocked in your browser site settings. In-app alerts remain active.'
                    : permission === 'unsupported'
                    ? 'This browser environment does not support desktop notifications. In-app alerts remain active.'
                    : 'Allow browser notifications so you receive alerts even while working in another tab.'}
                </p>
              </div>
              {permission === 'granted' ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-emerald-400">
                  <Check className="h-3.5 w-3.5" />
                  Enabled
                </span>
              ) : permission === 'default' ? (
                <button
                  type="button"
                  onClick={() => void onRequestPermission()}
                  className="shrink-0 rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-500 focus-visible:outline-2 focus-visible:outline-rose-400 whitespace-nowrap"
                >
                  Allow Alerts
                </button>
              ) : null}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3">
              <button
                type="button"
                onClick={() => toggle('browserEnabled')}
                className="flex items-center gap-2 text-xs font-medium text-slate-300 hover:text-white"
              >
                {settings.browserEnabled ? (
                  <Bell className="h-4 w-4 text-rose-400" />
                ) : (
                  <BellOff className="h-4 w-4 text-slate-500" />
                )}
                <span>Push desktop popups</span>
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={settings.browserEnabled}
                onClick={() => toggle('browserEnabled')}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors ${
                  settings.browserEnabled
                    ? 'border-rose-500/60 bg-rose-600'
                    : 'border-white/10 bg-[#1B2030]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    settings.browserEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-3">
              <button
                type="button"
                onClick={() => toggle('soundEnabled')}
                className="flex items-center gap-2 text-xs font-medium text-slate-300 hover:text-white"
              >
                {settings.soundEnabled ? (
                  <Volume2 className="h-4 w-4 text-rose-400" />
                ) : (
                  <VolumeX className="h-4 w-4 text-slate-500" />
                )}
                <span>Play chime on new alert</span>
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={settings.soundEnabled}
                onClick={() => toggle('soundEnabled')}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors ${
                  settings.soundEnabled
                    ? 'border-rose-500/60 bg-rose-600'
                    : 'border-white/10 bg-[#1B2030]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    settings.soundEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </section>

          {/* Event Triggers */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold tracking-wide text-slate-400">Event Triggers</h3>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-white/[0.08] bg-[#121621] px-4 py-3 hover:border-white/[0.14]">
              <div>
                <div className="text-sm font-medium text-white">Demon Placed</div>
                <div className="text-xs text-slate-400">New extreme demon enters AREDL or Pointercrate</div>
              </div>
              <input
                type="checkbox"
                checked={settings.notifyPlaced}
                onChange={() => toggle('notifyPlaced')}
                className="h-4 w-4 accent-rose-500"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-white/[0.08] bg-[#121621] px-4 py-3 hover:border-white/[0.14]">
              <div>
                <div className="text-sm font-medium text-white">Demon Updated</div>
                <div className="text-xs text-slate-400">Position raised, lowered, or list requirement changed</div>
              </div>
              <input
                type="checkbox"
                checked={settings.notifyUpdated}
                onChange={() => toggle('notifyUpdated')}
                className="h-4 w-4 accent-rose-500"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-white/[0.08] bg-[#121621] px-4 py-3 hover:border-white/[0.14]">
              <div>
                <div className="text-sm font-medium text-white">Top 10 Level Victor</div>
                <div className="text-xs text-slate-400">Player achieves 100% completion on any #1–#10 demon</div>
              </div>
              <input
                type="checkbox"
                checked={settings.notifyTop10Victor}
                onChange={() => toggle('notifyTop10Victor')}
                className="h-4 w-4 accent-rose-500"
              />
            </label>
          </section>

          {/* Data Sources */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold tracking-wide text-slate-400">Monitored Lists</h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => toggleSource('pointercrate')}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors ${
                  settings.sources.pointercrate
                    ? 'border-rose-500/50 bg-rose-500/10 text-white'
                    : 'border-white/[0.08] bg-[#121621] text-slate-400'
                }`}
              >
                <span>Pointercrate</span>
                <span className="text-xs">{settings.sources.pointercrate ? 'On' : 'Off'}</span>
              </button>
              <button
                type="button"
                onClick={() => toggleSource('aredl')}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors ${
                  settings.sources.aredl
                    ? 'border-rose-500/50 bg-rose-500/10 text-white'
                    : 'border-white/[0.08] bg-[#121621] text-slate-400'
                }`}
              >
                <span>AREDL</span>
                <span className="text-xs">{settings.sources.aredl ? 'On' : 'Off'}</span>
              </button>
            </div>
          </section>

          {/* Test Alert Controls */}
          <section className="space-y-3 border-t border-white/[0.08] pt-5">
            <h3 className="text-xs font-semibold tracking-wide text-slate-400">Test Delivery</h3>
            <p className="text-xs text-slate-400">
              Send a sample alert to verify toast popups, chime audio, and browser notifications.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void onSendTest('demon_placed')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#161B28] px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-[#1E2436] whitespace-nowrap"
              >
                <Play className="h-3 w-3 text-rose-400" />
                Test Placement
              </button>
              <button
                type="button"
                onClick={() => void onSendTest('demon_updated')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#161B28] px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-[#1E2436] whitespace-nowrap"
              >
                <Play className="h-3 w-3 text-amber-400" />
                Test Rank Update
              </button>
              <button
                type="button"
                onClick={() => void onSendTest('top10_victor')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#161B28] px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-[#1E2436] whitespace-nowrap"
              >
                <Play className="h-3 w-3 text-emerald-400" />
                Test Top 10 Victor
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
