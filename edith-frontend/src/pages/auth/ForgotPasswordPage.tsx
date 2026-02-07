import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Mail } from 'lucide-react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { forgotPasswordSchema, type ForgotPasswordFormData } from '@/lib/validation/auth.schemas';
import { useForgotPassword } from '@/hooks/mutations/use-auth-mutations';

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  });
  const forgotMutation = useForgotPassword();

  const onSubmit = (data: ForgotPasswordFormData) => {
    forgotMutation.mutate(data.email, { onSuccess: () => setSent(true) });
  };

  if (sent) {
    return (
      <Card className="border-border">
        <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-lg font-semibold">Check your email</h2>
          <p className="text-sm text-muted-foreground">
            We've sent a password reset link to your email address.
          </p>
        </CardContent>
        <CardFooter>
          <Link to="/login" className="w-full">
            <Button variant="outline" className="w-full">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to sign in
            </Button>
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="border-border">
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4 pt-6">
          <p className="text-sm text-muted-foreground">
            Enter your email address and we'll send you a link to reset your password.
          </p>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="you@example.com" {...register('email')} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={forgotMutation.isPending}>
            {forgotMutation.isPending ? 'Sending...' : 'Send reset link'}
          </Button>
          <Link to="/login" className="text-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-1 inline h-3 w-3" /> Back to sign in
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
