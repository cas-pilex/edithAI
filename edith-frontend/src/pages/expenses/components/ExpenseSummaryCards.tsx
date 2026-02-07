import { DollarSign, Clock, CheckCircle, PieChart } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';

interface ExpenseSummaryCardsProps {
  summary?: {
    total: number;
    byCategory: Record<string, number>;
    pending: number;
    approved: number;
  };
}

export function ExpenseSummaryCards({ summary }: ExpenseSummaryCardsProps) {
  if (!summary) return null;

  const cards = [
    { label: 'Total', value: formatCurrency(summary.total), icon: DollarSign },
    { label: 'Pending', value: formatCurrency(summary.pending), icon: Clock },
    { label: 'Approved', value: formatCurrency(summary.approved), icon: CheckCircle },
    { label: 'Categories', value: Object.keys(summary.byCategory).length.toString(), icon: PieChart },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <card.icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className="text-xl font-bold">{card.value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
