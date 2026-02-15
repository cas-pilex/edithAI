import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Mail, Calendar, MessageSquare, Send, CheckCircle, XCircle, Loader2, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';

const oauthIntegrations = [
  { key: 'gmail', name: 'Gmail', icon: Mail, description: 'Connect your email for inbox management', connectUrl: '/api/oauth/google' },
  { key: 'google_calendar', name: 'Google Calendar', icon: Calendar, description: 'Sync your calendar events', connectUrl: '/api/oauth/google' },
  { key: 'slack', name: 'Slack', icon: MessageSquare, description: 'Get notifications in Slack', connectUrl: '/api/oauth/slack' },
];

interface TelegramStatus {
  linked: boolean;
  botUsername?: string | null;
  username?: string | null;
  firstName?: string | null;
  linkedAt?: string | null;
}

export function IntegrationSettings() {
  const [statuses, setStatuses] = useState<Record<string, boolean>>({});
  const [connecting, setConnecting] = useState<string | null>(null);
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus>({ linked: false });
  const [searchParams, setSearchParams] = useSearchParams();

  const fetchStatuses = () => {
    api.get<Record<string, { connected: boolean }>>('/api/oauth/status')
      .then(({ data }) => {
        const map: Record<string, boolean> = {};
        for (const [provider, info] of Object.entries(data)) {
          map[provider] = info.connected;
        }
        setStatuses((prev) => ({ ...prev, ...map }));
      })
      .catch(() => {});

    api.get<TelegramStatus>('/api/integrations/telegram/status')
      .then(({ data }) => {
        setTelegramStatus(data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchStatuses();

    // Handle OAuth redirect success/error
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    if (success) {
      toast.success(`Successfully connected ${success}`);
      setSearchParams({}, { replace: true });
      setTimeout(fetchStatuses, 1000);
    } else if (error) {
      toast.error(`Connection failed: ${error}`);
      setSearchParams({}, { replace: true });
    }

    // Handle Telegram account linking token
    const telegramToken = searchParams.get('telegram_token');
    if (telegramToken) {
      setConnecting('telegram');
      api.post('/api/integrations/telegram/link', { token: telegramToken })
        .then(() => {
          toast.success('Telegram account linked successfully!');
          setTelegramStatus((prev) => ({ ...prev, linked: true }));
        })
        .catch((err) => {
          const msg = err?.response?.data?.error || 'Failed to link Telegram account';
          toast.error(msg);
        })
        .finally(() => {
          setConnecting(null);
          setSearchParams({}, { replace: true });
          fetchStatuses();
        });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = async (integration: typeof oauthIntegrations[number]) => {
    setConnecting(integration.key);
    try {
      const { data } = await api.get<{ authUrl: string }>(integration.connectUrl);
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch {
      toast.error('Failed to start connection');
      setConnecting(null);
    }
  };

  const handleDisconnect = async (provider: string) => {
    try {
      if (provider === 'telegram') {
        await api.delete('/api/integrations/telegram/unlink');
        setTelegramStatus((prev) => ({ ...prev, linked: false }));
      } else {
        await api.delete(`/api/oauth/${provider.toLowerCase()}`);
        setStatuses((prev) => ({ ...prev, [provider]: false }));
      }
      toast.success('Disconnected');
    } catch {
      toast.error('Failed to disconnect');
    }
  };

  const botUsername = telegramStatus.botUsername;
  const botUrl = botUsername ? `https://t.me/${botUsername}` : null;

  return (
    <div className="space-y-4">
      {/* OAuth Integrations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connected Services</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {oauthIntegrations.map((integration) => {
            const connected = statuses[integration.key] || false;
            const isConnecting = connecting === integration.key;
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
                  disabled={isConnecting}
                  onClick={() => connected ? handleDisconnect(integration.key) : handleConnect(integration)}
                >
                  {isConnecting ? (
                    <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Connecting...</>
                  ) : connected ? 'Disconnect' : 'Connect'}
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Telegram Integration — dedicated card with clear instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4" />
            Telegram
          </CardTitle>
        </CardHeader>
        <CardContent>
          {connecting === 'telegram' ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Linking your Telegram account...
            </div>
          ) : telegramStatus.linked ? (
            /* Connected state */
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">Connected</span>
                {telegramStatus.username && (
                  <span className="text-sm text-muted-foreground">@{telegramStatus.username}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                You can chat with Edith directly in Telegram. Send a message or use commands like /today, /inbox, or /tasks.
              </p>
              <div className="flex gap-2">
                {botUrl && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={botUrl} target="_blank" rel="noopener noreferrer">
                      Open in Telegram <ExternalLink className="ml-1 h-3 w-3" />
                    </a>
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => handleDisconnect('telegram')}>
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            /* Not connected — step-by-step instructions */
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Chat with Edith via Telegram to manage your inbox, calendar, and tasks on the go.
              </p>

              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</div>
                  <div>
                    <p className="text-sm font-medium">Open the Edith bot in Telegram</p>
                    {botUrl ? (
                      <Button variant="outline" size="sm" className="mt-1.5" asChild>
                        <a href={botUrl} target="_blank" rel="noopener noreferrer">
                          Open @{botUsername} <ExternalLink className="ml-1 h-3 w-3" />
                        </a>
                      </Button>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Bot is not yet configured. Contact your administrator.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</div>
                  <div>
                    <p className="text-sm font-medium">Send <code className="rounded bg-accent px-1.5 py-0.5 text-xs">/start</code> to the bot</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      The bot will send you a link to connect your account.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</div>
                  <div>
                    <p className="text-sm font-medium">Click "Connect Account" in the bot</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      You'll be redirected here and your account will be linked automatically.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
