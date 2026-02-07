import { useEffect, useState } from 'react';
import { Mail, Calendar, MessageSquare, Send, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';

const integrationDefs = [
  { key: 'gmail', name: 'Gmail', icon: Mail, description: 'Connect your email for inbox management', connectUrl: '/api/oauth/google?service=gmail' },
  { key: 'google_calendar', name: 'Google Calendar', icon: Calendar, description: 'Sync your calendar events', connectUrl: '/api/oauth/google?service=calendar' },
  { key: 'slack', name: 'Slack', icon: MessageSquare, description: 'Get notifications in Slack', connectUrl: '/api/oauth/slack' },
  { key: 'telegram', name: 'Telegram', icon: Send, description: 'Chat with Edith via Telegram', connectUrl: null },
];

export function IntegrationSettings() {
  const [statuses, setStatuses] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.get<Record<string, { connected: boolean }>>('/api/oauth/status')
      .then(({ data }) => {
        const map: Record<string, boolean> = {};
        for (const [provider, info] of Object.entries(data)) {
          map[provider] = info.connected;
        }
        setStatuses(map);
      })
      .catch(() => {});
  }, []);

  const handleConnect = (integration: typeof integrationDefs[number]) => {
    if (integration.connectUrl) {
      window.location.href = `${api.defaults.baseURL || ''}${integration.connectUrl}`;
    }
  };

  const handleDisconnect = async (provider: string) => {
    try {
      await api.delete(`/api/oauth/${provider.toLowerCase()}`);
      setStatuses((prev) => ({ ...prev, [provider]: false }));
    } catch { /* ignore */ }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Connected Services</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {integrationDefs.map((integration) => {
          const connected = statuses[integration.key] || false;
          return (
            <div
              key={integration.key}
              className="flex items-center justify-between rounded-lg border border-border p-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
                  <integration.icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{integration.name}</span>
                    {connected ? (
                      <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{integration.description}</p>
                </div>
              </div>
              <Button
                variant={connected ? 'outline' : 'default'}
                size="sm"
                onClick={() => connected ? handleDisconnect(integration.key) : handleConnect(integration)}
              >
                {connected ? 'Disconnect' : 'Connect'}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
