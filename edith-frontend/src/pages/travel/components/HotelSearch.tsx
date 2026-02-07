import { useState } from 'react';
import { Hotel, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { travelApi, type HotelSearchParams } from '@/lib/api/travel';
import { formatCurrency } from '@/lib/utils';
import type { Booking } from '@/types';

export function HotelSearch() {
  const [params, setParams] = useState<HotelSearchParams>({
    destination: '', checkIn: '', checkOut: '', guests: 1,
  });
  const [results, setResults] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!params.destination || !params.checkIn || !params.checkOut) return;
    setLoading(true);
    try {
      const data = await travelApi.searchHotels(params);
      setResults(data.data);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <div className="space-y-1">
              <Label className="text-xs">Destination</Label>
              <Input placeholder="New York" value={params.destination} onChange={(e) => setParams({ ...params, destination: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Check In</Label>
              <Input type="date" value={params.checkIn} onChange={(e) => setParams({ ...params, checkIn: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Check Out</Label>
              <Input type="date" value={params.checkOut} onChange={(e) => setParams({ ...params, checkOut: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Guests</Label>
              <Input type="number" min={1} value={params.guests} onChange={(e) => setParams({ ...params, guests: Number(e.target.value) })} />
            </div>
            <div className="flex items-end">
              <Button onClick={handleSearch} disabled={loading} className="w-full gap-2">
                <Search className="h-4 w-4" /> {loading ? 'Searching...' : 'Search'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((booking) => (
            <Card key={booking.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <Hotel className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{booking.provider}</p>
                    <p className="text-xs text-muted-foreground">{booking.confirmationNumber}</p>
                  </div>
                </div>
                {booking.price && (
                  <span className="text-lg font-bold">{formatCurrency(booking.price, booking.currency)}</span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {results.length === 0 && !loading && (
        <p className="py-8 text-center text-sm text-muted-foreground">Search for hotels to see results</p>
      )}
    </div>
  );
}
