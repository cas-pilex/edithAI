import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useNotificationPreferences, useUpdateNotificationPreferences } from '@/hooks/queries/use-notifications';
import type { NotificationPreference } from '@/lib/api/notifications';

const NOTIFICATION_TYPES = [
  { type: 'DAILY_BRIEFING', label: 'Morning Briefing', description: 'Daily overview of your schedule, tasks, and inbox' },
  { type: 'MEETING_PREP', label: 'Meeting Prep', description: 'Preparation materials before meetings' },
  { type: 'MEETING_REMINDER', label: 'Meeting Reminder', description: 'Reminder 15 minutes before meetings' },
  { type: 'EMAIL_ALERT', label: 'Urgent Email Alerts', description: 'Alerts for important incoming emails' },
  { type: 'EMAIL_DIGEST', label: 'Email Digest', description: 'Periodic summary of email activity' },
  { type: 'TASK_REMINDER', label: 'Task Reminders', description: 'Reminders for upcoming task deadlines' },
  { type: 'APPROVAL_REQUEST', label: 'Approval Requests', description: 'When Edith needs your approval for an action' },
];

const CHANNELS = [
  { value: 'TELEGRAM', label: 'Telegram' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'IN_APP', label: 'In-App' },
];

export function NotificationSettings() {
  const { data, isLoading } = useNotificationPreferences();
  const updateMutation = useUpdateNotificationPreferences();
  const [prefs, setPrefs] = useState<NotificationPreference[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (data?.data) {
      setPrefs(data.data);
    }
  }, [data]);

  const updatePref = (type: string, field: 'channel' | 'enabled', value: string | boolean) => {
    setPrefs(prev => prev.map(p =>
      p.type === type ? { ...p, [field]: value } : p
    ));
    setHasChanges(true);
  };

  const handleSave = () => {
    updateMutation.mutate(prefs, {
      onSuccess: () => setHasChanges(false),
    });
  };

  if (isLoading) {
    return <div className="text-muted-foreground">Loading notification settings...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification Preferences</CardTitle>
        <CardDescription>
          Choose how and where you receive each type of notification.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {NOTIFICATION_TYPES.map(({ type, label, description }) => {
            const pref = prefs.find(p => p.type === type) || { type, channel: 'IN_APP', enabled: true };

            return (
              <div key={type} className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{label}</div>
                  <div className="text-xs text-muted-foreground">{description}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Select
                    value={pref.channel}
                    onValueChange={(value) => updatePref(type, 'channel', value)}
                    disabled={!pref.enabled}
                  >
                    <SelectTrigger className="w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANNELS.map(ch => (
                        <SelectItem key={ch.value} value={ch.value}>
                          {ch.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Switch
                    checked={pref.enabled}
                    onCheckedChange={(checked) => updatePref(type, 'enabled', checked)}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {hasChanges && (
          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
