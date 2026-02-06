/**
 * Amadeus Travel API Client Interface, Real Implementation, and Mock
 * Provides flight and hotel search/booking capabilities
 */

import Amadeus from 'amadeus';
import { config } from '../../config/index.js';
import { rateLimiter } from '../common/RateLimiter.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface FlightSearchParams {
  originLocationCode: string;
  destinationLocationCode: string;
  departureDate: string; // YYYY-MM-DD
  returnDate?: string;
  adults: number;
  children?: number;
  travelClass?: 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST';
  nonStop?: boolean;
  maxPrice?: number;
  max?: number;
}

export interface FlightOffer {
  id: string;
  source: string;
  instantTicketingRequired: boolean;
  nonHomogeneous: boolean;
  oneWay: boolean;
  lastTicketingDate: string;
  numberOfBookableSeats: number;
  itineraries: Array<{
    duration: string;
    segments: Array<{
      departure: {
        iataCode: string;
        terminal?: string;
        at: string;
      };
      arrival: {
        iataCode: string;
        terminal?: string;
        at: string;
      };
      carrierCode: string;
      number: string;
      aircraft: { code: string };
      operating?: { carrierCode: string };
      duration: string;
      numberOfStops: number;
    }>;
  }>;
  price: {
    currency: string;
    total: string;
    base: string;
    fees?: Array<{
      amount: string;
      type: string;
    }>;
    grandTotal: string;
  };
  pricingOptions: {
    fareType: string[];
    includedCheckedBagsOnly: boolean;
  };
  validatingAirlineCodes: string[];
  travelerPricings: Array<{
    travelerId: string;
    fareOption: string;
    travelerType: string;
    price: {
      currency: string;
      total: string;
    };
    fareDetailsBySegment: Array<{
      segmentId: string;
      cabin: string;
      fareBasis: string;
      brandedFare?: string;
      class: string;
    }>;
  }>;
}

export interface HotelSearchParams {
  cityCode: string;
  checkInDate: string; // YYYY-MM-DD
  checkOutDate: string;
  adults?: number;
  roomQuantity?: number;
  radius?: number;
  radiusUnit?: 'KM' | 'MILE';
  hotelName?: string;
  ratings?: number[];
  priceRange?: string;
  currency?: string;
}

export interface HotelOffer {
  id: string;
  hotel: {
    hotelId: string;
    name: string;
    chainCode?: string;
    cityCode: string;
    address?: {
      lines?: string[];
      cityName?: string;
      countryCode?: string;
    };
    rating?: string;
    amenities?: string[];
    media?: Array<{
      uri: string;
      category: string;
    }>;
  };
  offers: Array<{
    id: string;
    checkInDate: string;
    checkOutDate: string;
    roomQuantity?: number;
    rateCode?: string;
    room?: {
      type?: string;
      typeEstimated?: {
        category?: string;
        beds?: number;
        bedType?: string;
      };
      description?: { text?: string };
    };
    guests?: {
      adults?: number;
      childAges?: number[];
    };
    price: {
      currency: string;
      base?: string;
      total: string;
      variations?: {
        average?: { base?: string };
        changes?: Array<{
          startDate: string;
          endDate: string;
          base?: string;
        }>;
      };
    };
    policies?: {
      cancellation?: {
        deadline?: string;
        amount?: string;
      };
      paymentType?: string;
    };
  }>;
}

export interface Passenger {
  id: string;
  dateOfBirth: string;
  name: {
    firstName: string;
    lastName: string;
  };
  gender: 'MALE' | 'FEMALE';
  contact?: {
    emailAddress?: string;
    phones?: Array<{
      deviceType: string;
      countryCallingCode: string;
      number: string;
    }>;
  };
  documents?: Array<{
    documentType: string;
    number: string;
    expiryDate: string;
    issuanceCountry: string;
    nationality: string;
    holder: boolean;
  }>;
}

export interface GuestInfo {
  name: {
    firstName: string;
    lastName: string;
  };
  contact: {
    email: string;
    phone?: string;
  };
}

export interface BookingConfirmation {
  id: string;
  type: 'FLIGHT' | 'HOTEL';
  confirmationNumber: string;
  status: 'CONFIRMED' | 'PENDING' | 'CANCELLED';
  createdAt: string;
  totalPrice: {
    currency: string;
    amount: string;
  };
  details: Record<string, unknown>;
}

// ============================================================================
// Interface
// ============================================================================

export interface IAmadeusClient {
  searchFlights(params: FlightSearchParams): Promise<FlightOffer[]>;
  searchHotels(params: HotelSearchParams): Promise<HotelOffer[]>;
  bookFlight(offerId: string, passengers: Passenger[]): Promise<BookingConfirmation>;
  bookHotel(offerId: string, guest: GuestInfo): Promise<BookingConfirmation>;
  getFlightPrice(offerId: string): Promise<FlightOffer>;
  getHotelOffer(offerId: string): Promise<HotelOffer>;
}

// ============================================================================
// Real Amadeus Implementation
// ============================================================================

export class RealAmadeusClient implements IAmadeusClient {
  private amadeus: Amadeus;

  constructor(clientId?: string, clientSecret?: string) {
    const id = clientId || config.amadeus?.clientId || process.env.AMADEUS_CLIENT_ID;
    const secret = clientSecret || config.amadeus?.clientSecret || process.env.AMADEUS_CLIENT_SECRET;
    const hostname = config.amadeus?.env === 'production' ? 'production' : 'test';

    if (!id || !secret) {
      throw new Error('Amadeus credentials not configured');
    }

    this.amadeus = new Amadeus({
      clientId: id,
      clientSecret: secret,
      hostname,
    });
  }

  async searchFlights(params: FlightSearchParams): Promise<FlightOffer[]> {
    return rateLimiter.executeForProvider('AMADEUS', 'system', 'searchFlights', async () => {
      try {
        const response = await this.amadeus.shopping.flightOffersSearch.get({
          originLocationCode: params.originLocationCode,
          destinationLocationCode: params.destinationLocationCode,
          departureDate: params.departureDate,
          returnDate: params.returnDate,
          adults: params.adults,
          children: params.children,
          travelClass: params.travelClass,
          nonStop: params.nonStop,
          maxPrice: params.maxPrice,
          max: params.max || 10,
        });

        return this.mapFlightOffers(response.data || []);
      } catch (error) {
        logger.error('Amadeus flight search failed', { error, params });
        throw this.mapAmadeusError(error);
      }
    });
  }

  async searchHotels(params: HotelSearchParams): Promise<HotelOffer[]> {
    return rateLimiter.executeForProvider('AMADEUS', 'system', 'searchHotels', async () => {
      try {
        // First, search for hotels in the city
        const hotelListResponse = await this.amadeus.referenceData.locations.hotels.byCity.get({
          cityCode: params.cityCode,
        });

        const hotelIds = ((hotelListResponse.data || []) as Array<Record<string, unknown>>)
          .slice(0, 20)
          .map((h) => (h.hotelId as string) || '')
          .filter(Boolean);

        if (hotelIds.length === 0) {
          return [];
        }

        // Then, get offers for those hotels
        const offersResponse = await this.amadeus.shopping.hotelOffersSearch.get({
          hotelIds,
          checkInDate: params.checkInDate,
          checkOutDate: params.checkOutDate,
          adults: params.adults || 1,
          roomQuantity: params.roomQuantity || 1,
          currency: params.currency || 'EUR',
        });

        return this.mapHotelOffers(offersResponse.data || []);
      } catch (error) {
        logger.error('Amadeus hotel search failed', { error, params });
        throw this.mapAmadeusError(error);
      }
    });
  }

  async bookFlight(offerId: string, passengers: Passenger[]): Promise<BookingConfirmation> {
    return rateLimiter.executeForProvider('AMADEUS', 'system', 'bookFlight', async () => {
      try {
        // First, confirm the price
        const priceResponse = await this.amadeus.shopping.flightOffers.pricing.post(
          JSON.stringify({
            data: {
              type: 'flight-offers-pricing',
              flightOffers: [{ id: offerId }],
            },
          })
        );

        const priceData = priceResponse.data as Record<string, unknown>;
        const pricedOffer = (priceData.flightOffers as Array<Record<string, unknown>>)?.[0];
        if (!pricedOffer) {
          throw new Error('Flight offer not available for booking');
        }

        // Then, create the booking
        const bookingResponse = await this.amadeus.booking.flightOrders.post(
          JSON.stringify({
            data: {
              type: 'flight-order',
              flightOffers: [pricedOffer],
              travelers: passengers.map((p, i) => ({
                id: (i + 1).toString(),
                dateOfBirth: p.dateOfBirth,
                name: {
                  firstName: p.name.firstName.toUpperCase(),
                  lastName: p.name.lastName.toUpperCase(),
                },
                gender: p.gender,
                contact: p.contact,
                documents: p.documents,
              })),
            },
          })
        );

        const order = bookingResponse.data as Record<string, unknown>;

        return {
          id: order.id as string,
          type: 'FLIGHT',
          confirmationNumber: ((order.associatedRecords as Array<{ reference: string }>)?.[0]?.reference || order.id) as string,
          status: 'CONFIRMED',
          createdAt: new Date().toISOString(),
          totalPrice: {
            currency: ((order.flightOffers as Array<{ price: { currency: string } }>)?.[0]?.price?.currency) || 'EUR',
            amount: ((order.flightOffers as Array<{ price: { grandTotal: string } }>)?.[0]?.price?.grandTotal) || '0',
          },
          details: order as Record<string, unknown>,
        };
      } catch (error) {
        logger.error('Amadeus flight booking failed', { error, offerId });
        throw this.mapAmadeusError(error);
      }
    });
  }

  async bookHotel(offerId: string, guest: GuestInfo): Promise<BookingConfirmation> {
    return rateLimiter.executeForProvider('AMADEUS', 'system', 'bookHotel', async () => {
      try {
        const bookingResponse = await this.amadeus.booking.hotelBookings.post(
          JSON.stringify({
            data: {
              offerId,
              guests: [
                {
                  name: {
                    firstName: guest.name.firstName.toUpperCase(),
                    lastName: guest.name.lastName.toUpperCase(),
                  },
                  contact: {
                    email: guest.contact.email,
                    phone: guest.contact.phone,
                  },
                },
              ],
              payments: [
                {
                  method: 'creditCard',
                  card: {
                    vendorCode: 'VI', // Placeholder - would be provided by user
                    cardNumber: '0000000000000000',
                    expiryDate: '2025-01',
                  },
                },
              ],
            },
          })
        );

        const bookings = bookingResponse.data as Array<Record<string, unknown>>;
        const booking = bookings[0] || {};

        return {
          id: (booking.id as string) || '',
          type: 'HOTEL',
          confirmationNumber: ((booking.providerConfirmationId || booking.id) as string) || '',
          status: 'CONFIRMED',
          createdAt: new Date().toISOString(),
          totalPrice: {
            currency: 'EUR',
            amount: '0', // Would come from the booking response
          },
          details: booking as Record<string, unknown>,
        };
      } catch (error) {
        logger.error('Amadeus hotel booking failed', { error, offerId });
        throw this.mapAmadeusError(error);
      }
    });
  }

  async getFlightPrice(offerId: string): Promise<FlightOffer> {
    return rateLimiter.executeForProvider('AMADEUS', 'system', 'getFlightPrice', async () => {
      try {
        const response = await this.amadeus.shopping.flightOffers.pricing.post(
          JSON.stringify({
            data: {
              type: 'flight-offers-pricing',
              flightOffers: [{ id: offerId }],
            },
          })
        );

        const responseData = response.data as Record<string, unknown>;
        const offers = this.mapFlightOffers((responseData.flightOffers as Array<Record<string, unknown>>) || []);
        if (offers.length === 0) {
          throw new Error('Flight offer not found');
        }

        return offers[0];
      } catch (error) {
        logger.error('Amadeus get flight price failed', { error, offerId });
        throw this.mapAmadeusError(error);
      }
    });
  }

  async getHotelOffer(offerId: string): Promise<HotelOffer> {
    return rateLimiter.executeForProvider('AMADEUS', 'system', 'getHotelOffer', async () => {
      try {
        const response = await this.amadeus.shopping.hotelOfferSearch.get({
          offerId,
        });

        const offers = this.mapHotelOffers([response.data]);
        if (offers.length === 0) {
          throw new Error('Hotel offer not found');
        }

        return offers[0];
      } catch (error) {
        logger.error('Amadeus get hotel offer failed', { error, offerId });
        throw this.mapAmadeusError(error);
      }
    });
  }

  // Helper methods
  private mapFlightOffers(data: unknown[] | Record<string, unknown>[]): FlightOffer[] {
    return (data as Array<Record<string, unknown>>).map((offer) => offer as unknown as FlightOffer);
  }

  private mapHotelOffers(data: unknown[] | Record<string, unknown>[]): HotelOffer[] {
    return (data as Array<Record<string, unknown>>).map((offer) => offer as unknown as HotelOffer);
  }

  private mapAmadeusError(error: unknown): Error {
    if (error instanceof Error) {
      // Extract Amadeus-specific error info if available
      const amadeusError = error as { response?: { result?: { errors?: Array<{ detail?: string }> } } };
      const detail = amadeusError.response?.result?.errors?.[0]?.detail;
      if (detail) {
        return new Error(`Amadeus API Error: ${detail}`);
      }
      return error;
    }
    return new Error('Unknown Amadeus API error');
  }
}

// ============================================================================
// Mock Implementation
// ============================================================================

const AIRLINES = [
  { code: 'KL', name: 'KLM Royal Dutch Airlines' },
  { code: 'LH', name: 'Lufthansa' },
  { code: 'AF', name: 'Air France' },
  { code: 'BA', name: 'British Airways' },
  { code: 'IB', name: 'Iberia' },
  { code: 'AZ', name: 'ITA Airways' },
];

const HOTEL_CHAINS = [
  { code: 'HI', name: 'Holiday Inn' },
  { code: 'MR', name: 'Marriott' },
  { code: 'HY', name: 'Hyatt' },
  { code: 'IH', name: 'InterContinental' },
  { code: 'AC', name: 'Accor' },
  { code: 'NH', name: 'NH Hotels' },
];

class MockAmadeusClient implements IAmadeusClient {
  private nextId = 1;
  private flightOffers: Map<string, FlightOffer> = new Map();
  private hotelOffers: Map<string, HotelOffer> = new Map();

  async searchFlights(params: FlightSearchParams): Promise<FlightOffer[]> {
    logger.debug('Mock Amadeus: searchFlights', { params });

    await this.simulateDelay(300);

    const offers: FlightOffer[] = [];
    const numResults = params.max || 10;

    for (let i = 0; i < numResults; i++) {
      const airline = AIRLINES[Math.floor(Math.random() * AIRLINES.length)];
      const basePrice = 100 + Math.floor(Math.random() * 400);
      const duration = 60 + Math.floor(Math.random() * 180); // 1-4 hours

      const departureTime = new Date(params.departureDate);
      departureTime.setHours(6 + Math.floor(Math.random() * 14), Math.floor(Math.random() * 60));

      const arrivalTime = new Date(departureTime);
      arrivalTime.setMinutes(arrivalTime.getMinutes() + duration);

      const offer: FlightOffer = {
        id: `flight_${this.nextId++}`,
        source: 'GDS',
        instantTicketingRequired: false,
        nonHomogeneous: false,
        oneWay: !params.returnDate,
        lastTicketingDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        numberOfBookableSeats: 9,
        itineraries: [
          {
            duration: `PT${Math.floor(duration / 60)}H${duration % 60}M`,
            segments: [
              {
                departure: {
                  iataCode: params.originLocationCode,
                  at: departureTime.toISOString(),
                },
                arrival: {
                  iataCode: params.destinationLocationCode,
                  at: arrivalTime.toISOString(),
                },
                carrierCode: airline.code,
                number: `${100 + Math.floor(Math.random() * 900)}`,
                aircraft: { code: '320' },
                duration: `PT${Math.floor(duration / 60)}H${duration % 60}M`,
                numberOfStops: 0,
              },
            ],
          },
        ],
        price: {
          currency: 'EUR',
          total: basePrice.toString(),
          base: (basePrice * 0.9).toFixed(2),
          grandTotal: basePrice.toString(),
        },
        pricingOptions: {
          fareType: ['PUBLISHED'],
          includedCheckedBagsOnly: false,
        },
        validatingAirlineCodes: [airline.code],
        travelerPricings: [
          {
            travelerId: '1',
            fareOption: 'STANDARD',
            travelerType: 'ADULT',
            price: {
              currency: 'EUR',
              total: basePrice.toString(),
            },
            fareDetailsBySegment: [
              {
                segmentId: '1',
                cabin: params.travelClass || 'ECONOMY',
                fareBasis: 'YOWEU',
                class: 'Y',
              },
            ],
          },
        ],
      };

      // Add return flight if roundtrip
      if (params.returnDate) {
        const returnDepartureTime = new Date(params.returnDate);
        returnDepartureTime.setHours(6 + Math.floor(Math.random() * 14), Math.floor(Math.random() * 60));

        const returnArrivalTime = new Date(returnDepartureTime);
        returnArrivalTime.setMinutes(returnArrivalTime.getMinutes() + duration);

        offer.itineraries.push({
          duration: `PT${Math.floor(duration / 60)}H${duration % 60}M`,
          segments: [
            {
              departure: {
                iataCode: params.destinationLocationCode,
                at: returnDepartureTime.toISOString(),
              },
              arrival: {
                iataCode: params.originLocationCode,
                at: returnArrivalTime.toISOString(),
              },
              carrierCode: airline.code,
              number: `${100 + Math.floor(Math.random() * 900)}`,
              aircraft: { code: '320' },
              duration: `PT${Math.floor(duration / 60)}H${duration % 60}M`,
              numberOfStops: 0,
            },
          ],
        });

        // Double the price for roundtrip
        const roundtripPrice = basePrice * 2;
        offer.price.total = roundtripPrice.toString();
        offer.price.grandTotal = roundtripPrice.toString();
        offer.price.base = (roundtripPrice * 0.9).toFixed(2);
      }

      this.flightOffers.set(offer.id, offer);
      offers.push(offer);
    }

    // Sort by price
    offers.sort((a, b) => parseFloat(a.price.grandTotal) - parseFloat(b.price.grandTotal));

    return offers;
  }

  async searchHotels(params: HotelSearchParams): Promise<HotelOffer[]> {
    logger.debug('Mock Amadeus: searchHotels', { params });

    await this.simulateDelay(300);

    const offers: HotelOffer[] = [];
    const numResults = 10;

    const nights = Math.ceil(
      (new Date(params.checkOutDate).getTime() - new Date(params.checkInDate).getTime()) /
        (24 * 60 * 60 * 1000)
    );

    for (let i = 0; i < numResults; i++) {
      const chain = HOTEL_CHAINS[Math.floor(Math.random() * HOTEL_CHAINS.length)];
      const rating = (3 + Math.floor(Math.random() * 2)).toString(); // 3-4 stars
      const pricePerNight = 80 + Math.floor(Math.random() * 150);
      const totalPrice = pricePerNight * nights;

      const offer: HotelOffer = {
        id: `hotel_${this.nextId++}`,
        hotel: {
          hotelId: `${chain.code}${params.cityCode}${i + 1}`,
          name: `${chain.name} ${params.cityCode} ${['City Center', 'Airport', 'Business District', 'Old Town'][Math.floor(Math.random() * 4)]}`,
          chainCode: chain.code,
          cityCode: params.cityCode,
          address: {
            lines: [`${Math.floor(Math.random() * 200) + 1} Main Street`],
            cityName: params.cityCode,
            countryCode: 'NL',
          },
          rating,
          amenities: ['WIFI', 'RESTAURANT', 'GYM', 'PARKING', 'AIR_CONDITIONING'].filter(
            () => Math.random() > 0.3
          ),
        },
        offers: [
          {
            id: `offer_${this.nextId++}`,
            checkInDate: params.checkInDate,
            checkOutDate: params.checkOutDate,
            roomQuantity: params.roomQuantity || 1,
            room: {
              type: 'STANDARD',
              typeEstimated: {
                category: 'STANDARD_ROOM',
                beds: 1,
                bedType: 'QUEEN',
              },
              description: { text: 'Standard room with queen bed' },
            },
            guests: {
              adults: params.adults || 1,
            },
            price: {
              currency: 'EUR',
              base: (totalPrice * 0.9).toFixed(2),
              total: totalPrice.toFixed(2),
              variations: {
                average: { base: pricePerNight.toFixed(2) },
              },
            },
            policies: {
              cancellation: {
                deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
              },
              paymentType: 'GUARANTEE',
            },
          },
        ],
      };

      this.hotelOffers.set(offer.id, offer);
      offers.push(offer);
    }

    // Sort by price
    offers.sort(
      (a, b) => parseFloat(a.offers[0].price.total) - parseFloat(b.offers[0].price.total)
    );

    return offers;
  }

  async bookFlight(offerId: string, passengers: Passenger[]): Promise<BookingConfirmation> {
    logger.debug('Mock Amadeus: bookFlight', { offerId, passengers: passengers.length });

    await this.simulateDelay(500);

    const offer = this.flightOffers.get(offerId);
    if (!offer) {
      throw new Error(`Flight offer not found: ${offerId}`);
    }

    const confirmation: BookingConfirmation = {
      id: `booking_${this.nextId++}`,
      type: 'FLIGHT',
      confirmationNumber: `${offer.validatingAirlineCodes[0]}${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      status: 'CONFIRMED',
      createdAt: new Date().toISOString(),
      totalPrice: {
        currency: offer.price.currency,
        amount: offer.price.grandTotal,
      },
      details: {
        offerId,
        passengers: passengers.map(p => ({
          name: `${p.name.firstName} ${p.name.lastName}`,
        })),
        itineraries: offer.itineraries,
      },
    };

    return confirmation;
  }

  async bookHotel(offerId: string, guest: GuestInfo): Promise<BookingConfirmation> {
    logger.debug('Mock Amadeus: bookHotel', { offerId, guest: guest.name });

    await this.simulateDelay(500);

    const hotelOffer = this.hotelOffers.get(offerId);
    if (!hotelOffer) {
      throw new Error(`Hotel offer not found: ${offerId}`);
    }

    const confirmation: BookingConfirmation = {
      id: `booking_${this.nextId++}`,
      type: 'HOTEL',
      confirmationNumber: `${hotelOffer.hotel.chainCode || 'HT'}${Math.random().toString(36).substr(2, 8).toUpperCase()}`,
      status: 'CONFIRMED',
      createdAt: new Date().toISOString(),
      totalPrice: {
        currency: hotelOffer.offers[0].price.currency,
        amount: hotelOffer.offers[0].price.total,
      },
      details: {
        offerId,
        hotel: hotelOffer.hotel.name,
        guest: `${guest.name.firstName} ${guest.name.lastName}`,
        checkIn: hotelOffer.offers[0].checkInDate,
        checkOut: hotelOffer.offers[0].checkOutDate,
      },
    };

    return confirmation;
  }

  async getFlightPrice(offerId: string): Promise<FlightOffer> {
    logger.debug('Mock Amadeus: getFlightPrice', { offerId });

    await this.simulateDelay(200);

    const offer = this.flightOffers.get(offerId);
    if (!offer) {
      throw new Error(`Flight offer not found: ${offerId}`);
    }

    return offer;
  }

  async getHotelOffer(offerId: string): Promise<HotelOffer> {
    logger.debug('Mock Amadeus: getHotelOffer', { offerId });

    await this.simulateDelay(200);

    const offer = this.hotelOffers.get(offerId);
    if (!offer) {
      throw new Error(`Hotel offer not found: ${offerId}`);
    }

    return offer;
  }

  private simulateDelay(ms: number = 100): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createAmadeusClient(clientId?: string, clientSecret?: string): IAmadeusClient {
  const id = clientId || config.amadeus?.clientId || process.env.AMADEUS_CLIENT_ID;
  const secret = clientSecret || config.amadeus?.clientSecret || process.env.AMADEUS_CLIENT_SECRET;

  // Use real client if credentials are available
  if (id && secret) {
    try {
      return new RealAmadeusClient(id, secret);
    } catch (error) {
      logger.warn('Failed to create real Amadeus client, falling back to mock', { error });
    }
  }

  // Fall back to mock for development or if credentials are missing
  logger.debug('Using mock Amadeus client');
  return new MockAmadeusClient();
}

export { MockAmadeusClient };
export const amadeusClient = createAmadeusClient();
export default amadeusClient;
