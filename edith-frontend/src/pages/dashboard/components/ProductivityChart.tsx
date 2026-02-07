import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { ProductivityData } from '@/types';

interface ProductivityChartProps {
  data?: ProductivityData[];
}

export function ProductivityChart({ data }: ProductivityChartProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Productivity Trends</CardTitle>
      </CardHeader>
      <CardContent>
        {!data?.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No data available</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorTasks" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="date" stroke="#71717a" tick={{ fontSize: 12 }} />
              <YAxis stroke="#71717a" tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #3f3f46',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Area type="monotone" dataKey="tasks" stroke="#f97316" fillOpacity={1} fill="url(#colorTasks)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
