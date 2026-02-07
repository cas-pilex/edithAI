import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { userApi } from '@/lib/api/user';
import { preferencesSchema, type PreferencesFormData } from '@/lib/validation/settings.schemas';

export function PreferencesSettings() {
  const { register, handleSubmit, setValue, watch, formState: { isSubmitting } } = useForm<PreferencesFormData>({
    resolver: zodResolver(preferencesSchema),
    defaultValues: {
      communicationTone: 'MIXED',
      workingHoursStart: '09:00',
      workingHoursEnd: '17:00',
      allowAnalytics: true,
    },
  });

  const allowAnalytics = watch('allowAnalytics');

  const onSubmit = async (data: PreferencesFormData) => {
    try {
      await userApi.updatePreferences(data);
      toast.success('Preferences updated');
    } catch {
      toast.error('Failed to update preferences');
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Communication</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Communication Tone</Label>
              <Select defaultValue="MIXED" onValueChange={(v) => setValue('communicationTone', v as 'FORMAL' | 'CASUAL' | 'MIXED')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FORMAL">Formal</SelectItem>
                  <SelectItem value="CASUAL">Casual</SelectItem>
                  <SelectItem value="MIXED">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="workingHoursStart">Work Hours Start</Label>
                <Input id="workingHoursStart" type="time" {...register('workingHoursStart')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workingHoursEnd">Work Hours End</Label>
                <Input id="workingHoursEnd" type="time" {...register('workingHoursEnd')} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label>AI Analytics</Label>
                <p className="text-xs text-muted-foreground">Allow Edith to analyze your usage patterns</p>
              </div>
              <Switch checked={allowAnalytics} onCheckedChange={(v) => setValue('allowAnalytics', v)} />
            </div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Preferences'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
