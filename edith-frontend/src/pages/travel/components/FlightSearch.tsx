import { useState } from 'react';
import { Plane, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { travelApi, type FlightSearchParams } from '@/lib/api/travel';
import { formatCurrency } from '@/lib/utils';
import type { Booking } from '@/types';

export function FlightSearch() {
  const [params, setParams] = useState<FlightSearchParams>({
    origin: '', destination: '', departDate: '', cabinClass: 'economy',
  });
  const [results, setResults] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!params.origin || !params.destination || !params.departDate) return;
    setLoading(true);
    try {
      const data = await travelApi.searchFlights(params);
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
              <Label className="text-xs">Origin</Label>
              <Input placeholder="JFK" value={params.origin} onChange={(e) => setParams({ ...params, origin: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Destination</Label>
              <Input placeholder="LAX" value={params.destination} onChange={(e) => setParams({ ...params, destination: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Depart</Label>
              <Input type="date" value={params.departDate} onChange={(e) => setParams({ ...params, departDate: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cabin</Label>
              <Select value={params.cabinClass} onValueChange={(v) => setParams({ ...params, cabinClass: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="economy">Economy</SelectItem>
                  <SelectItem value="business">Business</SelectItem>
                  <SelectItem value="first">First</SelectItem>
                </SelectContent>
              </Select>
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
                  <Plane className="h-5 w-5 text-primary" />
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
        <p className="py-8 text-center text-sm text-muted-foreground">Search for flights to see results</p>
      )}
    </div>
  );
}
