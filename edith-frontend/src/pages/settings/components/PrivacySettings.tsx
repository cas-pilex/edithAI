import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

export function PrivacySettings() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Privacy & Data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Usage Analytics</Label>
              <p className="text-xs text-muted-foreground">Help improve Edith with anonymous usage data</p>
            </div>
            <Switch defaultChecked />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label>Data Retention</Label>
              <p className="text-xs text-muted-foreground">Automatically delete data older than 1 year</p>
            </div>
            <Switch />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" className="w-full justify-start">Export My Data</Button>
          <Button variant="destructive" className="w-full justify-start">Delete Account</Button>
        </CardContent>
      </Card>
    </div>
  );
}
