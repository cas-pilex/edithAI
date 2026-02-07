import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { fadeIn } from '@/lib/animations';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCalendarEvents } from '@/hooks/queries/use-calendar';
import { WeekView } from './components/WeekView';
import { DayView } from './components/DayView';
import { MonthView } from './components/MonthView';
import { EventCreateDialog } from './components/EventCreateDialog';
import { CalendarSidebar } from './components/CalendarSidebar';

type ViewType = 'week' | 'day' | 'month';

export function CalendarPage() {
  const [view, setView] = useState<ViewType>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [createOpen, setCreateOpen] = useState(false);

  const dateRange = useMemo(() => {
    if (view === 'week') {
      return { startDate: startOfWeek(currentDate, { weekStartsOn: 1 }).toISOString(), endDate: endOfWeek(currentDate, { weekStartsOn: 1 }).toISOString() };
    } else if (view === 'month') {
      return { startDate: startOfMonth(currentDate).toISOString(), endDate: endOfMonth(currentDate).toISOString() };
    }
    return { startDate: currentDate.toISOString(), endDate: addDays(currentDate, 1).toISOString() };
  }, [view, currentDate]);

  const { data, isLoading } = useCalendarEvents(dateRange);
  const events = data?.data || [];

  const navigate = (direction: 'prev' | 'next') => {
    if (view === 'week') setCurrentDate(direction === 'next' ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    else if (view === 'month') setCurrentDate(direction === 'next' ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    else setCurrentDate(direction === 'next' ? addDays(currentDate, 1) : addDays(currentDate, -1));
  };

  if (isLoading) {
    return <Skeleton className="h-[calc(100vh-8rem)] rounded-lg" />;
  }

  return (
    <motion.div variants={fadeIn} initial="hidden" animate="visible" className="flex h-[calc(100vh-8rem)] gap-4">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between pb-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate('prev')}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-semibold">{format(currentDate, view === 'month' ? 'MMMM yyyy' : 'MMM d, yyyy')}</h2>
            <Button variant="ghost" size="icon" onClick={() => navigate('next')}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>Today</Button>
          </div>
          <div className="flex items-center gap-2">
            <Tabs value={view} onValueChange={(v) => setView(v as ViewType)}>
              <TabsList>
                <TabsTrigger value="day">Day</TabsTrigger>
                <TabsTrigger value="week">Week</TabsTrigger>
                <TabsTrigger value="month">Month</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> New Event
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden rounded-lg border border-border">
          {view === 'week' && <WeekView events={events} currentDate={currentDate} />}
          {view === 'day' && <DayView events={events} currentDate={currentDate} />}
          {view === 'month' && <MonthView events={events} currentDate={currentDate} />}
        </div>
      </div>
      <CalendarSidebar currentDate={currentDate} onDateChange={setCurrentDate} />
      <EventCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </motion.div>
  );
}
