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
      communicationStyle: 'professional',
      workHoursStart: '09:00',
      workHoursEnd: '17:00',
      aiSuggestions: true,
    },
  });

  const aiSuggestions = watch('aiSuggestions');

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
              <Label>Communication Style</Label>
              <Select defaultValue="professional" onValueChange={(v) => setValue('communicationStyle', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="concise">Concise</SelectItem>
                  <SelectItem value="formal">Formal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="workHoursStart">Work Hours Start</Label>
                <Input id="workHoursStart" type="time" {...register('workHoursStart')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workHoursEnd">Work Hours End</Label>
                <Input id="workHoursEnd" type="time" {...register('workHoursEnd')} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label>AI Suggestions</Label>
                <p className="text-xs text-muted-foreground">Let Edith proactively suggest actions</p>
              </div>
              <Switch checked={aiSuggestions} onCheckedChange={(v) => setValue('aiSuggestions', v)} />
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
