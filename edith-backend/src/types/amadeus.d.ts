/**
 * Type declarations for amadeus module
 */

declare module 'amadeus' {
  interface AmadeusConfig {
    clientId: string;
    clientSecret: string;
    hostname?: 'test' | 'production';
  }

  interface FlightOffersSearchParams {
    originLocationCode: string;
    destinationLocationCode: string;
    departureDate: string;
    returnDate?: string;
    adults: number;
    children?: number;
    infants?: number;
    travelClass?: 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST';
    currencyCode?: string;
    max?: number;
    nonStop?: boolean;
    maxPrice?: number;
  }

  interface HotelOffersSearchParams {
    hotelIds: string | string[];
    checkInDate: string;
    checkOutDate: string;
    adults?: number;
    roomQuantity?: number;
    currency?: string;
  }

  interface HotelsByCity {
    cityCode: string;
    radius?: number;
    radiusUnit?: 'KM' | 'MILE';
    ratings?: string[];
    hotelSource?: string;
  }

  interface AmadeusResponse<T = Record<string, unknown>[]> {
    data: T;
    result?: unknown;
    meta?: unknown;
    flightOffers?: Record<string, unknown>[];
  }

  interface FlightOffersSearch {
    get(params: FlightOffersSearchParams): Promise<AmadeusResponse<unknown[]>>;
    post(body: unknown): Promise<AmadeusResponse<unknown[]>>;
  }

  interface FlightOffersPricing {
    post(body: unknown): Promise<AmadeusResponse<unknown>>;
  }

  interface FlightOffers {
    pricing: FlightOffersPricing;
  }

  interface HotelOffersByHotel {
    get(params: { hotelId: string; adults?: number; checkInDate: string; checkOutDate: string }): Promise<AmadeusResponse<unknown>>;
  }

  interface HotelOffersSearch {
    get(params: HotelOffersSearchParams): Promise<AmadeusResponse<unknown[]>>;
  }

  interface HotelOfferSearch {
    get(params: { offerId: string }): Promise<AmadeusResponse<unknown>>;
  }

  interface FlightOrdersBooking {
    post(body: unknown): Promise<AmadeusResponse<unknown>>;
  }

  interface HotelBooking {
    post(body: unknown): Promise<AmadeusResponse<unknown>>;
  }

  interface HotelsByCity {
    get(params: { cityCode: string; radius?: number; radiusUnit?: string; ratings?: string[] }): Promise<AmadeusResponse<unknown[]>>;
  }

  interface HotelsLocation {
    byCity: HotelsByCity;
  }

  interface Locations {
    hotels: HotelsLocation;
  }

  interface ReferenceData {
    locations: Locations;
  }

  class Amadeus {
    constructor(config: AmadeusConfig);

    shopping: {
      flightOffersSearch: FlightOffersSearch;
      flightOffers: FlightOffers;
      hotelOffersByHotel: HotelOffersByHotel;
      hotelOffers: HotelOffersSearch;
      hotelOffersSearch: HotelOffersSearch;
      hotelOfferSearch: HotelOfferSearch;
    };

    booking: {
      flightOrders: FlightOrdersBooking;
      hotelBookings: HotelBooking;
    };

    referenceData: ReferenceData;
  }

  export = Amadeus;
}
