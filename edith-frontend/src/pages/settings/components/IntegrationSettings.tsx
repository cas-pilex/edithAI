import { Mail, Calendar, MessageSquare, Send, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const integrations = [
  { name: 'Gmail', icon: Mail, connected: false, description: 'Connect your email for inbox management' },
  { name: 'Google Calendar', icon: Calendar, connected: false, description: 'Sync your calendar events' },
  { name: 'Slack', icon: MessageSquare, connected: false, description: 'Get notifications in Slack' },
  { name: 'Telegram', icon: Send, connected: false, description: 'Chat with Edith via Telegram' },
];

export function IntegrationSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Connected Services</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {integrations.map((integration) => (
          <div
            key={integration.name}
            className="flex items-center justify-between rounded-lg border border-border p-4"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
                <integration.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{integration.name}</span>
                  {integration.connected ? (
                    <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{integration.description}</p>
              </div>
            </div>
            <Button variant={integration.connected ? 'outline' : 'default'} size="sm">
              {integration.connected ? 'Disconnect' : 'Connect'}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
