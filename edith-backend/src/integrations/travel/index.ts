/**
 * Travel Integrations
 * Exports all travel-related integration components
 */

// Amadeus (Flights & Hotels)
export {
  amadeusClient,
  createAmadeusClient,
  RealAmadeusClient,
  MockAmadeusClient,
  type IAmadeusClient,
  type FlightSearchParams,
  type FlightOffer,
  type HotelSearchParams,
  type HotelOffer,
  type Passenger,
  type GuestInfo,
  type BookingConfirmation,
} from './AmadeusClient.js';

// Google Places (Restaurants & Locations)
export {
  googlePlacesClient,
  createGooglePlacesClient,
  RealGooglePlacesClient,
  MockGooglePlacesClient,
  type IGooglePlacesClient,
  type LatLng,
  type RestaurantSearchParams,
  type Restaurant,
  type PlaceDetails,
  type DirectionsResult,
} from './GooglePlacesClient.js';

// Uber/Lyft (Ride Estimates)
export {
  uberClient,
  createUberClient,
  RealUberClient,
  MockUberClient,
  type IUberClient,
  type RideEstimate,
  type RideDeepLink,
} from './UberClient.js';

// Travel Helpers
export {
  TravelHelpers,
} from './TravelHelpers.js';
