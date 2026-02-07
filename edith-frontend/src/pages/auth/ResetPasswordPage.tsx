import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { resetPasswordSchema, type ResetPasswordFormData } from '@/lib/validation/auth.schemas';
import { useResetPassword } from '@/hooks/mutations/use-auth-mutations';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const { register, handleSubmit, formState: { errors } } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  });
  const resetMutation = useResetPassword();

  const onSubmit = (data: ResetPasswordFormData) => {
    resetMutation.mutate({ token, password: data.password });
  };

  return (
    <Card className="border-border">
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4 pt-6">
          <p className="text-sm text-muted-foreground">Enter your new password below.</p>
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input id="password" type="password" placeholder="••••••••" {...register('password')} />
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input id="confirmPassword" type="password" placeholder="••••••••" {...register('confirmPassword')} />
            {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={resetMutation.isPending}>
            {resetMutation.isPending ? 'Resetting...' : 'Reset password'}
          </Button>
          <Link to="/login" className="text-center text-sm text-muted-foreground hover:text-foreground">
            Back to sign in
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
