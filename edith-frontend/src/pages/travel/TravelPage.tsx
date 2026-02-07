import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { staggerContainer, staggerItem } from '@/lib/animations';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useTrips, useUpcomingTrips } from '@/hooks/queries/use-travel';
import { TripCard } from './components/TripCard';
import { TripCreateDialog } from './components/TripCreateDialog';
import { FlightSearch } from './components/FlightSearch';
import { HotelSearch } from './components/HotelSearch';

export function TravelPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const { data: tripsData, isLoading } = useTrips();
  const { data: upcomingData } = useUpcomingTrips();
  const trips = tripsData?.data || [];
  const upcomingTrips = upcomingData?.data || [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
      </div>
    );
  }

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={staggerItem} className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Travel</h2>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New Trip
        </Button>
      </motion.div>

      <motion.div variants={staggerItem}>
        <Tabs defaultValue="upcoming">
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="all">All Trips</TabsTrigger>
            <TabsTrigger value="flights">Search Flights</TabsTrigger>
            <TabsTrigger value="hotels">Search Hotels</TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="mt-4">
            {!upcomingTrips.length ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No upcoming trips</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {upcomingTrips.map((trip) => <TripCard key={trip.id} trip={trip} />)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="all" className="mt-4">
            {!trips.length ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No trips yet</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {trips.map((trip) => <TripCard key={trip.id} trip={trip} />)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="flights" className="mt-4">
            <FlightSearch />
          </TabsContent>

          <TabsContent value="hotels" className="mt-4">
            <HotelSearch />
          </TabsContent>
        </Tabs>
      </motion.div>

      <TripCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </motion.div>
  );
}
