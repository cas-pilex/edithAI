import { toolRegistry, createTool } from './index.js';
import type { EnhancedAgentContext, ToolHandlerResult } from '../../types/agent.types.js';
import { prisma } from '../../database/client.js';
import { logger } from '../../utils/logger.js';

// ==================== MOCK DATA GENERATORS ====================

function generateMockFlights(params: {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  cabinClass?: string;
}): Array<{
  id: string;
  airline: string;
  departure: { time: string; airport: string };
  arrival: { time: string; airport: string };
  duration: string;
  stops: number;
  price: { amount: number; currency: string };
  cabinClass: string;
}> {
  const airlines = ['United', 'Delta', 'American', 'KLM', 'Lufthansa', 'British Airways'];
  const results = [];

  for (let i = 0; i < 5; i++) {
    const airline = airlines[Math.floor(Math.random() * airlines.length)];
    const basePrice = 200 + Math.floor(Math.random() * 800);
    const stops = Math.floor(Math.random() * 3);

    results.push({
      id: `flight-${Date.now()}-${i}`,
      airline,
      departure: {
        time: `${params.departureDate}T${8 + i * 2}:00:00`,
        airport: params.origin,
      },
      arrival: {
        time: `${params.departureDate}T${14 + i * 2}:00:00`,
        airport: params.destination,
      },
      duration: `${5 + stops}h ${Math.floor(Math.random() * 59)}m`,
      stops,
      price: {
        amount: basePrice * (params.cabinClass === 'BUSINESS' ? 3 : 1),
        currency: 'EUR',
      },
      cabinClass: params.cabinClass || 'ECONOMY',
    });
  }

  return results;
}

function generateMockHotels(params: {
  location: string;
  checkIn: string;
  checkOut: string;
  minStars?: number;
}): Array<{
  id: string;
  name: string;
  stars: number;
  address: string;
  price: { amount: number; currency: string; perNight: boolean };
  amenities: string[];
  rating: number;
  reviewCount: number;
}> {
  const hotelNames = ['Grand Hotel', 'Marriott', 'Hilton', 'Hyatt', 'Four Seasons', 'Park Inn'];
  const results = [];

  for (let i = 0; i < 5; i++) {
    const stars = Math.max(params.minStars || 3, 3 + Math.floor(Math.random() * 3));
    const basePrice = 80 * stars + Math.floor(Math.random() * 100);

    results.push({
      id: `hotel-${Date.now()}-${i}`,
      name: `${hotelNames[i % hotelNames.length]} ${params.location}`,
      stars,
      address: `${100 + i * 10} Main Street, ${params.location}`,
      price: { amount: basePrice, currency: 'EUR', perNight: true },
      amenities: ['WiFi', 'Breakfast', 'Gym', 'Pool'].slice(0, 2 + i % 3),
      rating: 4 + Math.random(),
      reviewCount: 100 + Math.floor(Math.random() * 500),
    });
  }

  return results;
}

function generateMockRestaurants(params: {
  location: string;
  cuisine?: string[];
  priceRange?: string;
}): Array<{
  id: string;
  name: string;
  cuisine: string;
  priceRange: string;
  rating: number;
  address: string;
  openingHours: string;
}> {
  const cuisines = params.cuisine || ['Italian', 'French', 'Japanese', 'Mexican', 'Indian'];
  const results = [];

  for (let i = 0; i < 5; i++) {
    results.push({
      id: `restaurant-${Date.now()}-${i}`,
      name: `Restaurant ${String.fromCharCode(65 + i)} ${params.location}`,
      cuisine: cuisines[i % cuisines.length],
      priceRange: params.priceRange || ['$$', '$$$'][i % 2],
      rating: 3.5 + Math.random() * 1.5,
      address: `${50 + i * 5} Food Street, ${params.location}`,
      openingHours: '12:00 - 23:00',
    });
  }

  return results;
}

// ==================== TOOL HANDLERS ====================

async function handleSearchFlights(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const {
    origin,
    destination,
    departureDate,
    returnDate,
    passengers = 1,
    cabinClass = 'ECONOMY',
    maxStops,
    preferredAirlines,
  } = input as {
    origin: string;
    destination: string;
    departureDate: string;
    returnDate?: string;
    passengers?: number;
    cabinClass?: string;
    maxStops?: number;
    preferredAirlines?: string[];
  };

  try {
    // Store search for tracking
    await prisma.travelSearch.create({
      data: {
        userId: context.userId,
        searchType: 'FLIGHT',
        searchParams: { origin, destination, departureDate, returnDate, passengers, cabinClass },
        results: {},
      },
    });

    // Generate mock results (would be replaced with Amadeus API)
    let flights = generateMockFlights({ origin, destination, departureDate, returnDate, cabinClass });

    if (maxStops !== undefined) {
      flights = flights.filter((f) => f.stops <= maxStops);
    }
    if (preferredAirlines?.length) {
      flights = flights.filter((f) => preferredAirlines.includes(f.airline));
    }

    return {
      success: true,
      data: {
        flights,
        searchParams: { origin, destination, departureDate, returnDate, passengers, cabinClass },
        totalResults: flights.length,
      },
    };
  } catch (error) {
    logger.error('Failed to search flights', { error });
    return {
      success: false,
      error: `Failed to search flights: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function handleSearchHotels(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { location, checkIn, checkOut, guests = 1, minStars, maxPrice, amenities } = input as {
    location: string;
    checkIn: string;
    checkOut: string;
    guests?: number;
    minStars?: number;
    maxPrice?: number;
    amenities?: string[];
  };

  try {
    await prisma.travelSearch.create({
      data: {
        userId: context.userId,
        searchType: 'HOTEL',
        searchParams: { location, checkIn, checkOut, guests, minStars },
        results: {},
      },
    });

    let hotels = generateMockHotels({ location, checkIn, checkOut, minStars });

    if (maxPrice) {
      hotels = hotels.filter((h) => h.price.amount <= maxPrice);
    }
    if (amenities?.length) {
      hotels = hotels.filter((h) => amenities.some((a) => h.amenities.includes(a)));
    }

    return {
      success: true,
      data: {
        hotels,
        searchParams: { location, checkIn, checkOut, guests },
        totalResults: hotels.length,
      },
    };
  } catch (error) {
    logger.error('Failed to search hotels', { error });
    return {
      success: false,
      error: `Failed to search hotels: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function handleSearchRestaurants(
  input: Record<string, unknown>,
  _context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { location, date, time, partySize = 2, cuisine, priceRange, dietaryRestrictions } = input as {
    location: string;
    date: string;
    time: string;
    partySize?: number;
    cuisine?: string[];
    priceRange?: string;
    dietaryRestrictions?: string[];
  };

  try {
    const restaurants = generateMockRestaurants({ location, cuisine, priceRange });

    return {
      success: true,
      data: {
        restaurants,
        searchParams: { location, date, time, partySize, cuisine },
        totalResults: restaurants.length,
        note: dietaryRestrictions?.length
          ? `Dietary restrictions noted: ${dietaryRestrictions.join(', ')}`
          : undefined,
      },
    };
  } catch (error) {
    logger.error('Failed to search restaurants', { error });
    return {
      success: false,
      error: `Failed to search: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function handleBookFlight(
  input: Record<string, unknown>,
  _context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { tripId, flightOfferId, passengers } = input as {
    tripId: string;
    flightOfferId: string;
    passengers: Array<{
      firstName: string;
      lastName: string;
      dateOfBirth?: string;
    }>;
  };

  // This always requires approval (spending money)
  return {
    success: true,
    requiresApproval: true,
    approvalDetails: {
      proposedAction: { tripId, flightOfferId, passengers },
      reasoning: 'Flight booking requires approval (spending money)',
      impact: {
        type: 'HIGH',
        affectedAreas: ['travel', 'finance'],
        estimatedCost: { amount: 500, currency: 'EUR' }, // Would get actual price
      },
      isReversible: false,
      relatedEntities: [{ type: 'trip', id: tripId, displayName: 'Trip' }],
    },
    data: { message: 'Flight booking requires approval' },
  };
}

async function handleBookHotel(
  input: Record<string, unknown>,
  _context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { tripId, hotelOfferId, guestName, specialRequests } = input as {
    tripId: string;
    hotelOfferId: string;
    guestName: string;
    specialRequests?: string;
  };

  return {
    success: true,
    requiresApproval: true,
    approvalDetails: {
      proposedAction: { tripId, hotelOfferId, guestName, specialRequests },
      reasoning: 'Hotel booking requires approval (spending money)',
      impact: {
        type: 'HIGH',
        affectedAreas: ['travel', 'finance'],
        estimatedCost: { amount: 200, currency: 'EUR' },
      },
      isReversible: true,
      relatedEntities: [{ type: 'trip', id: tripId, displayName: 'Trip' }],
    },
    data: { message: 'Hotel booking requires approval' },
  };
}

async function handleCreateTrip(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { name, destination, startDate, endDate, purpose, budget, currency = 'EUR' } = input as {
    name: string;
    destination: string;
    startDate: string;
    endDate: string;
    purpose?: string;
    budget?: number;
    currency?: string;
  };

  try {
    const trip = await prisma.trip.create({
      data: {
        userId: context.userId,
        name,
        destination,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        purpose,
        status: 'PLANNING',
        totalBudget: budget,
        totalSpent: 0,
        currency,
        itinerary: [],
      },
    });

    return {
      success: true,
      data: {
        tripId: trip.id,
        name: trip.name,
        destination: trip.destination,
        dates: { start: trip.startDate, end: trip.endDate },
        status: trip.status,
      },
    };
  } catch (error) {
    logger.error('Failed to create trip', { error });
    return {
      success: false,
      error: `Failed to create trip: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function handleGetTripItinerary(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { tripId } = input as { tripId: string };

  try {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId, userId: context.userId },
      include: {
        bookings: { orderBy: { startDateTime: 'asc' } },
        expenses: true,
      },
    });

    if (!trip) {
      return { success: false, error: 'Trip not found' };
    }

    return {
      success: true,
      data: {
        trip: {
          id: trip.id,
          name: trip.name,
          destination: trip.destination,
          dates: { start: trip.startDate, end: trip.endDate },
          purpose: trip.purpose,
          status: trip.status,
        },
        bookings: trip.bookings.map((b) => ({
          id: b.id,
          type: b.type,
          provider: b.provider,
          confirmationNumber: b.confirmationNumber,
          status: b.status,
          dates: { start: b.startDateTime, end: b.endDateTime },
          price: { amount: b.price, currency: b.currency },
        })),
        budget: {
          total: trip.totalBudget,
          spent: trip.totalSpent,
          remaining: (trip.totalBudget || 0) - trip.totalSpent,
          currency: trip.currency,
        },
        expenses: trip.expenses.length,
      },
    };
  } catch (error) {
    logger.error('Failed to get itinerary', { error, tripId });
    return {
      success: false,
      error: `Failed to get itinerary: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function handleCancelBooking(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { bookingId, reason } = input as { bookingId: string; reason?: string };

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId },
    include: { trip: { select: { userId: true, name: true } } },
  });

  if (!booking || booking.trip.userId !== context.userId) {
    return { success: false, error: 'Booking not found' };
  }

  return {
    success: true,
    requiresApproval: true,
    approvalDetails: {
      proposedAction: { bookingId, reason },
      reasoning: 'Canceling a booking always requires approval',
      impact: {
        type: 'HIGH',
        affectedAreas: ['travel', 'finance'],
      },
      isReversible: false,
      relatedEntities: [
        { type: 'booking', id: bookingId, displayName: `${booking.type} booking` },
        { type: 'trip', id: booking.tripId, displayName: booking.trip.name },
      ],
    },
    data: { message: 'Booking cancellation requires approval' },
  };
}

async function handleEstimateGroundTransport(
  input: Record<string, unknown>,
  _context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { origin, destination, date, time } = input as {
    origin: string;
    destination: string;
    date?: string;
    time?: string;
  };

  // Mock estimates (would use actual APIs)
  const estimates = [
    { type: 'Uber/Lyft', estimatedPrice: { min: 15, max: 25, currency: 'EUR' }, estimatedTime: '20-30 min' },
    { type: 'Taxi', estimatedPrice: { min: 20, max: 35, currency: 'EUR' }, estimatedTime: '20-30 min' },
    { type: 'Public Transit', estimatedPrice: { min: 2, max: 5, currency: 'EUR' }, estimatedTime: '35-45 min' },
  ];

  return {
    success: true,
    data: {
      origin,
      destination,
      dateTime: date && time ? `${date}T${time}` : 'Now',
      estimates,
    },
  };
}

// ==================== TOOL REGISTRATION ====================

export function registerTravelTools(): void {
  toolRegistry.register(
    createTool(
      'search_flights',
      'Search for available flights based on criteria',
      {
        origin: { type: 'string', description: 'Origin airport code (IATA)' },
        destination: { type: 'string', description: 'Destination airport code (IATA)' },
        departureDate: { type: 'string', description: 'Departure date (YYYY-MM-DD)' },
        returnDate: { type: 'string', description: 'Return date for round trip' },
        passengers: { type: 'number', description: 'Number of passengers' },
        cabinClass: { type: 'string', enum: ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'] },
        maxStops: { type: 'number', description: 'Maximum number of stops' },
        preferredAirlines: { type: 'array', items: { type: 'string' }, description: 'Preferred airlines' },
      },
      ['origin', 'destination', 'departureDate'],
      'travel',
      handleSearchFlights,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  toolRegistry.register(
    createTool(
      'search_hotels',
      'Search for available hotels',
      {
        location: { type: 'string', description: 'City or location' },
        checkIn: { type: 'string', description: 'Check-in date (YYYY-MM-DD)' },
        checkOut: { type: 'string', description: 'Check-out date (YYYY-MM-DD)' },
        guests: { type: 'number', description: 'Number of guests' },
        minStars: { type: 'number', description: 'Minimum star rating (1-5)' },
        maxPrice: { type: 'number', description: 'Maximum price per night' },
        amenities: { type: 'array', items: { type: 'string' }, description: 'Required amenities' },
      },
      ['location', 'checkIn', 'checkOut'],
      'travel',
      handleSearchHotels,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  toolRegistry.register(
    createTool(
      'search_restaurants',
      'Search for restaurants and check availability',
      {
        location: { type: 'string', description: 'City or area' },
        date: { type: 'string', description: 'Date (YYYY-MM-DD)' },
        time: { type: 'string', description: 'Time (HH:mm)' },
        partySize: { type: 'number', description: 'Number of guests' },
        cuisine: { type: 'array', items: { type: 'string' }, description: 'Cuisine types' },
        priceRange: { type: 'string', enum: ['$', '$$', '$$$', '$$$$'] },
        dietaryRestrictions: { type: 'array', items: { type: 'string' } },
      },
      ['location', 'date', 'time'],
      'travel',
      handleSearchRestaurants,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  toolRegistry.register(
    createTool(
      'book_flight',
      'Book a flight (requires approval - spending money)',
      {
        tripId: { type: 'string', description: 'Trip ID to add booking to' },
        flightOfferId: { type: 'string', description: 'Flight offer ID from search' },
        passengers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              dateOfBirth: { type: 'string' },
            },
          },
          description: 'Passenger details',
        },
      },
      ['tripId', 'flightOfferId', 'passengers'],
      'travel',
      handleBookFlight,
      { requiresApproval: true, approvalCategory: 'ALWAYS_ASK' }
    )
  );

  toolRegistry.register(
    createTool(
      'book_hotel',
      'Book a hotel (requires approval - spending money)',
      {
        tripId: { type: 'string', description: 'Trip ID' },
        hotelOfferId: { type: 'string', description: 'Hotel offer ID from search' },
        guestName: { type: 'string', description: 'Guest name for reservation' },
        specialRequests: { type: 'string', description: 'Special requests' },
      },
      ['tripId', 'hotelOfferId', 'guestName'],
      'travel',
      handleBookHotel,
      { requiresApproval: true, approvalCategory: 'ALWAYS_ASK' }
    )
  );

  toolRegistry.register(
    createTool(
      'create_trip',
      'Create a new trip record',
      {
        name: { type: 'string', description: 'Trip name' },
        destination: { type: 'string', description: 'Destination city/country' },
        startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        purpose: { type: 'string', description: 'Trip purpose' },
        budget: { type: 'number', description: 'Total budget' },
        currency: { type: 'string', description: 'Currency code (default EUR)' },
      },
      ['name', 'destination', 'startDate', 'endDate'],
      'travel',
      handleCreateTrip,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  toolRegistry.register(
    createTool(
      'get_trip_itinerary',
      'Get complete itinerary for a trip',
      {
        tripId: { type: 'string', description: 'Trip ID' },
      },
      ['tripId'],
      'travel',
      handleGetTripItinerary,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  toolRegistry.register(
    createTool(
      'cancel_booking',
      'Cancel a booking (requires approval)',
      {
        bookingId: { type: 'string', description: 'Booking ID to cancel' },
        reason: { type: 'string', description: 'Cancellation reason' },
      },
      ['bookingId'],
      'travel',
      handleCancelBooking,
      { requiresApproval: true, approvalCategory: 'ALWAYS_ASK' }
    )
  );

  toolRegistry.register(
    createTool(
      'estimate_ground_transport',
      'Estimate costs for ground transportation',
      {
        origin: { type: 'string', description: 'Starting location' },
        destination: { type: 'string', description: 'Destination' },
        date: { type: 'string', description: 'Date (optional)' },
        time: { type: 'string', description: 'Time (optional)' },
      },
      ['origin', 'destination'],
      'travel',
      handleEstimateGroundTransport,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  logger.info('Travel tools registered', { count: 9 });
}
