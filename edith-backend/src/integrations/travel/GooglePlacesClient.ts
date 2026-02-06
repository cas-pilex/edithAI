/**
 * GooglePlacesClient
 * Google Places API client for restaurant and location search
 */

import { config } from '../../config/index.js';
import { rateLimiter } from '../common/RateLimiter.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RestaurantSearchParams {
  location: LatLng | string;
  radius?: number; // meters, default 5000
  type?: string; // e.g., 'restaurant', 'cafe', 'bar'
  keyword?: string;
  minPrice?: number; // 0-4
  maxPrice?: number; // 0-4
  openNow?: boolean;
  rankBy?: 'prominence' | 'distance';
}

export interface Restaurant {
  placeId: string;
  name: string;
  address: string;
  location: LatLng;
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: number;
  types: string[];
  isOpen?: boolean;
  openingHours?: string[];
  photos?: string[];
  phoneNumber?: string;
  website?: string;
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  address: string;
  formattedAddress: string;
  location: LatLng;
  phoneNumber?: string;
  internationalPhoneNumber?: string;
  website?: string;
  url?: string; // Google Maps URL
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: number;
  types: string[];
  openingHours?: {
    isOpen: boolean;
    periods: Array<{
      open: { day: number; time: string };
      close?: { day: number; time: string };
    }>;
    weekdayText: string[];
  };
  reviews?: Array<{
    authorName: string;
    rating: number;
    text: string;
    time: number;
  }>;
  photos?: Array<{
    reference: string;
    width: number;
    height: number;
  }>;
}

export interface DirectionsResult {
  distance: {
    text: string;
    value: number; // meters
  };
  duration: {
    text: string;
    value: number; // seconds
  };
  durationInTraffic?: {
    text: string;
    value: number;
  };
  startAddress: string;
  endAddress: string;
  steps: Array<{
    instruction: string;
    distance: string;
    duration: string;
    maneuver?: string;
  }>;
  polyline: string;
}

// ============================================================================
// IGooglePlacesClient Interface
// ============================================================================

export interface IGooglePlacesClient {
  searchRestaurants(params: RestaurantSearchParams): Promise<Restaurant[]>;
  getPlaceDetails(placeId: string): Promise<PlaceDetails>;
  getDirections(origin: LatLng | string, destination: LatLng | string, mode?: string): Promise<DirectionsResult>;
  getPhotoUrl(photoReference: string, maxWidth?: number): string;
  geocode(address: string): Promise<LatLng | null>;
  reverseGeocode(location: LatLng): Promise<string | null>;
}

// ============================================================================
// RealGooglePlacesClient Implementation
// ============================================================================

export class RealGooglePlacesClient implements IGooglePlacesClient {
  private apiKey: string;
  private baseUrl = 'https://maps.googleapis.com/maps/api';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || config.google?.placesApiKey || process.env.GOOGLE_PLACES_API_KEY || '';

    if (!this.apiKey) {
      throw new Error('Google Places API key not configured');
    }
  }

  async searchRestaurants(params: RestaurantSearchParams): Promise<Restaurant[]> {
    return rateLimiter.executeForProvider('GOOGLE_PLACES', 'system', 'searchRestaurants', async () => {
      try {
        const location = typeof params.location === 'string'
          ? await this.geocode(params.location)
          : params.location;

        if (!location) {
          throw new Error('Could not resolve location');
        }

        const queryParams = new URLSearchParams({
          key: this.apiKey,
          location: `${location.lat},${location.lng}`,
          type: params.type || 'restaurant',
        });

        if (params.radius && params.rankBy !== 'distance') {
          queryParams.append('radius', params.radius.toString());
        }

        if (params.keyword) {
          queryParams.append('keyword', params.keyword);
        }

        if (params.minPrice !== undefined) {
          queryParams.append('minprice', params.minPrice.toString());
        }

        if (params.maxPrice !== undefined) {
          queryParams.append('maxprice', params.maxPrice.toString());
        }

        if (params.openNow) {
          queryParams.append('opennow', 'true');
        }

        if (params.rankBy) {
          queryParams.append('rankby', params.rankBy);
        }

        const response = await fetch(
          `${this.baseUrl}/place/nearbysearch/json?${queryParams.toString()}`
        );

        const data = await response.json() as { status: string; results?: Array<Record<string, unknown>> };

        if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
          throw new Error(`Google Places API error: ${data.status}`);
        }

        return (data.results || []).map((place) => this.mapPlaceToRestaurant(place));
      } catch (error) {
        logger.error('Google Places restaurant search failed', { error, params });
        throw error;
      }
    });
  }

  async getPlaceDetails(placeId: string): Promise<PlaceDetails> {
    return rateLimiter.executeForProvider('GOOGLE_PLACES', 'system', 'getPlaceDetails', async () => {
      try {
        const fields = [
          'place_id', 'name', 'formatted_address', 'geometry',
          'formatted_phone_number', 'international_phone_number',
          'website', 'url', 'rating', 'user_ratings_total',
          'price_level', 'types', 'opening_hours', 'reviews', 'photos',
        ].join(',');

        const response = await fetch(
          `${this.baseUrl}/place/details/json?place_id=${placeId}&fields=${fields}&key=${this.apiKey}`
        );

        const data = await response.json() as { status: string; result?: Record<string, unknown> };

        if (data.status !== 'OK') {
          throw new Error(`Google Places API error: ${data.status}`);
        }

        return this.mapPlaceDetails(data.result || {});
      } catch (error) {
        logger.error('Google Places get details failed', { error, placeId });
        throw error;
      }
    });
  }

  async getDirections(
    origin: LatLng | string,
    destination: LatLng | string,
    mode: string = 'driving'
  ): Promise<DirectionsResult> {
    return rateLimiter.executeForProvider('GOOGLE_PLACES', 'system', 'getDirections', async () => {
      try {
        const originStr = typeof origin === 'string' ? origin : `${origin.lat},${origin.lng}`;
        const destStr = typeof destination === 'string' ? destination : `${destination.lat},${destination.lng}`;

        const queryParams = new URLSearchParams({
          key: this.apiKey,
          origin: originStr,
          destination: destStr,
          mode,
          departure_time: 'now',
        });

        const response = await fetch(
          `${this.baseUrl}/directions/json?${queryParams.toString()}`
        );

        const data = await response.json() as {
          status: string;
          routes?: Array<{
            legs: Array<Record<string, unknown>>;
            overview_polyline?: { points: string };
          }>;
        };

        if (data.status !== 'OK') {
          throw new Error(`Google Directions API error: ${data.status}`);
        }

        const route = data.routes?.[0];
        if (!route) {
          throw new Error('No route found');
        }
        const leg = route.legs?.[0] as Record<string, unknown> || {};

        return {
          distance: (leg.distance as { text: string; value: number }) || { text: '', value: 0 },
          duration: (leg.duration as { text: string; value: number }) || { text: '', value: 0 },
          durationInTraffic: leg.duration_in_traffic as { text: string; value: number } | undefined,
          startAddress: (leg.start_address as string) || '',
          endAddress: (leg.end_address as string) || '',
          steps: ((leg.steps as Array<Record<string, unknown>>) || []).map((step) => ({
            instruction: ((step.html_instructions as string) || '').replace(/<[^>]*>/g, ''),
            distance: (step.distance as { text: string })?.text,
            duration: (step.duration as { text: string })?.text,
            maneuver: step.maneuver as string | undefined,
          })),
          polyline: route.overview_polyline?.points || '',
        };
      } catch (error) {
        logger.error('Google Directions failed', { error });
        throw error;
      }
    });
  }

  getPhotoUrl(photoReference: string, maxWidth: number = 400): string {
    return `${this.baseUrl}/place/photo?photoreference=${photoReference}&maxwidth=${maxWidth}&key=${this.apiKey}`;
  }

  async geocode(address: string): Promise<LatLng | null> {
    return rateLimiter.executeForProvider('GOOGLE_PLACES', 'system', 'geocode', async () => {
      try {
        const response = await fetch(
          `${this.baseUrl}/geocode/json?address=${encodeURIComponent(address)}&key=${this.apiKey}`
        );

        const data = await response.json() as {
          status: string;
          results?: Array<{ geometry?: { location?: { lat: number; lng: number } } }>;
        };

        if (data.status !== 'OK' || !data.results?.[0]) {
          return null;
        }

        const location = data.results[0].geometry?.location;
        if (!location) return null;
        return { lat: location.lat, lng: location.lng };
      } catch (error) {
        logger.error('Geocoding failed', { error, address });
        return null;
      }
    });
  }

  async reverseGeocode(location: LatLng): Promise<string | null> {
    return rateLimiter.executeForProvider('GOOGLE_PLACES', 'system', 'reverseGeocode', async () => {
      try {
        const response = await fetch(
          `${this.baseUrl}/geocode/json?latlng=${location.lat},${location.lng}&key=${this.apiKey}`
        );

        const data = await response.json() as {
          status: string;
          results?: Array<{ formatted_address?: string }>;
        };

        if (data.status !== 'OK' || !data.results?.[0]) {
          return null;
        }

        return data.results[0].formatted_address || null;
      } catch (error) {
        logger.error('Reverse geocoding failed', { error, location });
        return null;
      }
    });
  }

  // Helper methods
  private mapPlaceToRestaurant(place: Record<string, unknown>): Restaurant {
    const geometry = place.geometry as { location: { lat: number; lng: number } };
    const openingHours = place.opening_hours as { open_now?: boolean } | undefined;
    const photos = place.photos as Array<{ photo_reference: string }> | undefined;

    return {
      placeId: place.place_id as string,
      name: place.name as string,
      address: place.vicinity as string || '',
      location: {
        lat: geometry?.location?.lat || 0,
        lng: geometry?.location?.lng || 0,
      },
      rating: place.rating as number | undefined,
      userRatingsTotal: place.user_ratings_total as number | undefined,
      priceLevel: place.price_level as number | undefined,
      types: (place.types as string[]) || [],
      isOpen: openingHours?.open_now,
      photos: photos?.map(p => p.photo_reference),
    };
  }

  private mapPlaceDetails(result: Record<string, unknown>): PlaceDetails {
    const geometry = result.geometry as { location: { lat: number; lng: number } };
    const openingHours = result.opening_hours as {
      open_now?: boolean;
      periods?: Array<{
        open: { day: number; time: string };
        close?: { day: number; time: string };
      }>;
      weekday_text?: string[];
    } | undefined;
    const reviews = result.reviews as Array<{
      author_name: string;
      rating: number;
      text: string;
      time: number;
    }> | undefined;
    const photos = result.photos as Array<{
      photo_reference: string;
      width: number;
      height: number;
    }> | undefined;

    return {
      placeId: result.place_id as string,
      name: result.name as string,
      address: (result.vicinity as string) || '',
      formattedAddress: result.formatted_address as string || '',
      location: {
        lat: geometry?.location?.lat || 0,
        lng: geometry?.location?.lng || 0,
      },
      phoneNumber: result.formatted_phone_number as string | undefined,
      internationalPhoneNumber: result.international_phone_number as string | undefined,
      website: result.website as string | undefined,
      url: result.url as string | undefined,
      rating: result.rating as number | undefined,
      userRatingsTotal: result.user_ratings_total as number | undefined,
      priceLevel: result.price_level as number | undefined,
      types: (result.types as string[]) || [],
      openingHours: openingHours ? {
        isOpen: openingHours.open_now || false,
        periods: openingHours.periods || [],
        weekdayText: openingHours.weekday_text || [],
      } : undefined,
      reviews: reviews?.map(r => ({
        authorName: r.author_name,
        rating: r.rating,
        text: r.text,
        time: r.time,
      })),
      photos: photos?.map(p => ({
        reference: p.photo_reference,
        width: p.width,
        height: p.height,
      })),
    };
  }
}

// ============================================================================
// MockGooglePlacesClient Implementation
// ============================================================================

export class MockGooglePlacesClient implements IGooglePlacesClient {
  async searchRestaurants(params: RestaurantSearchParams): Promise<Restaurant[]> {
    logger.debug('Mock Google Places: searchRestaurants', { params });

    return [
      {
        placeId: 'mock_place_1',
        name: 'The Best Restaurant',
        address: '123 Main Street',
        location: { lat: 52.3676, lng: 4.9041 },
        rating: 4.5,
        userRatingsTotal: 234,
        priceLevel: 2,
        types: ['restaurant', 'food'],
        isOpen: true,
      },
      {
        placeId: 'mock_place_2',
        name: 'Cozy Cafe',
        address: '456 Oak Avenue',
        location: { lat: 52.3686, lng: 4.9051 },
        rating: 4.2,
        userRatingsTotal: 156,
        priceLevel: 1,
        types: ['cafe', 'food'],
        isOpen: true,
      },
    ];
  }

  async getPlaceDetails(placeId: string): Promise<PlaceDetails> {
    logger.debug('Mock Google Places: getPlaceDetails', { placeId });

    return {
      placeId,
      name: 'Mock Restaurant',
      address: '123 Main Street',
      formattedAddress: '123 Main Street, Amsterdam, Netherlands',
      location: { lat: 52.3676, lng: 4.9041 },
      phoneNumber: '+31 20 123 4567',
      website: 'https://example.com',
      rating: 4.5,
      userRatingsTotal: 234,
      priceLevel: 2,
      types: ['restaurant', 'food'],
      openingHours: {
        isOpen: true,
        periods: [],
        weekdayText: [
          'Monday: 11:00 AM – 10:00 PM',
          'Tuesday: 11:00 AM – 10:00 PM',
          'Wednesday: 11:00 AM – 10:00 PM',
          'Thursday: 11:00 AM – 10:00 PM',
          'Friday: 11:00 AM – 11:00 PM',
          'Saturday: 10:00 AM – 11:00 PM',
          'Sunday: 10:00 AM – 9:00 PM',
        ],
      },
    };
  }

  async getDirections(
    origin: LatLng | string,
    destination: LatLng | string
  ): Promise<DirectionsResult> {
    logger.debug('Mock Google Places: getDirections', { origin, destination });

    return {
      distance: { text: '5.2 km', value: 5200 },
      duration: { text: '15 mins', value: 900 },
      startAddress: typeof origin === 'string' ? origin : 'Start Location',
      endAddress: typeof destination === 'string' ? destination : 'End Location',
      steps: [
        { instruction: 'Head north on Main Street', distance: '500 m', duration: '2 mins' },
        { instruction: 'Turn right onto Oak Avenue', distance: '2.1 km', duration: '5 mins' },
        { instruction: 'Continue onto Highway 1', distance: '2.6 km', duration: '8 mins' },
      ],
      polyline: '',
    };
  }

  getPhotoUrl(_photoReference: string, maxWidth: number = 400): string {
    return `https://via.placeholder.com/${maxWidth}`;
  }

  async geocode(address: string): Promise<LatLng | null> {
    logger.debug('Mock Google Places: geocode', { address });
    return { lat: 52.3676, lng: 4.9041 };
  }

  async reverseGeocode(location: LatLng): Promise<string | null> {
    logger.debug('Mock Google Places: reverseGeocode', { location });
    return 'Amsterdam, Netherlands';
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createGooglePlacesClient(apiKey?: string): IGooglePlacesClient {
  const key = apiKey || config.google?.placesApiKey || process.env.GOOGLE_PLACES_API_KEY;

  if (key) {
    try {
      return new RealGooglePlacesClient(key);
    } catch (error) {
      logger.warn('Failed to create real Google Places client, falling back to mock', { error });
    }
  }

  logger.debug('Using mock Google Places client');
  return new MockGooglePlacesClient();
}

export const googlePlacesClient = createGooglePlacesClient();
export default googlePlacesClient;
