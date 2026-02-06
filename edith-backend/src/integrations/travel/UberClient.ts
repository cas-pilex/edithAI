/**
 * UberClient
 * Uber/Lyft ride estimate and deep link generation
 */

import { config } from '../../config/index.js';
import { rateLimiter } from '../common/RateLimiter.js';
import { logger } from '../../utils/logger.js';
import type { LatLng } from './GooglePlacesClient.js';

// ============================================================================
// Types
// ============================================================================

export interface RideEstimate {
  provider: 'uber' | 'lyft';
  productId: string;
  productName: string;
  estimatedPrice: {
    low: number;
    high: number;
    currency: string;
    display: string;
  };
  estimatedDuration: {
    minutes: number;
    display: string;
  };
  estimatedPickupTime?: {
    minutes: number;
    display: string;
  };
  surge?: {
    multiplier: number;
    surging: boolean;
  };
  capacity: number;
}

export interface RideDeepLink {
  provider: 'uber' | 'lyft';
  universalLink: string;
  androidLink?: string;
  iosLink?: string;
  webLink?: string;
}

// ============================================================================
// IUberClient Interface
// ============================================================================

export interface IUberClient {
  getEstimates(pickup: LatLng, dropoff: LatLng): Promise<RideEstimate[]>;
  getDeepLink(pickup: LatLng, dropoff: LatLng, provider?: 'uber' | 'lyft'): RideDeepLink;
  getPickupTime(location: LatLng): Promise<number | null>; // minutes
}

// ============================================================================
// RealUberClient Implementation (using Uber API)
// ============================================================================

export class RealUberClient implements IUberClient {
  private serverToken: string;
  private clientId: string;
  private baseUrl = 'https://api.uber.com/v1.2';

  constructor(serverToken?: string, clientId?: string) {
    this.serverToken = serverToken || config.uber?.serverToken || process.env.UBER_SERVER_TOKEN || '';
    this.clientId = clientId || config.uber?.clientId || process.env.UBER_CLIENT_ID || '';

    if (!this.serverToken) {
      throw new Error('Uber API credentials not configured');
    }
  }

  async getEstimates(pickup: LatLng, dropoff: LatLng): Promise<RideEstimate[]> {
    return rateLimiter.executeForProvider('UBER', 'system', 'getEstimates', async () => {
      try {
        // Get price estimates
        const priceResponse = await fetch(
          `${this.baseUrl}/estimates/price?` +
          `start_latitude=${pickup.lat}&start_longitude=${pickup.lng}&` +
          `end_latitude=${dropoff.lat}&end_longitude=${dropoff.lng}`,
          {
            headers: {
              Authorization: `Token ${this.serverToken}`,
              'Accept-Language': 'en_US',
              'Content-Type': 'application/json',
            },
          }
        );

        if (!priceResponse.ok) {
          throw new Error(`Uber API error: ${priceResponse.status}`);
        }

        const priceData = await priceResponse.json() as { prices?: Array<Record<string, unknown>> };

        // Get time estimates
        const timeResponse = await fetch(
          `${this.baseUrl}/estimates/time?` +
          `start_latitude=${pickup.lat}&start_longitude=${pickup.lng}`,
          {
            headers: {
              Authorization: `Token ${this.serverToken}`,
              'Accept-Language': 'en_US',
              'Content-Type': 'application/json',
            },
          }
        );

        const timeData = timeResponse.ok
          ? await timeResponse.json() as { times?: Array<{ product_id: string; estimate: number }> }
          : { times: [] };

        // Combine price and time estimates
        const estimates: RideEstimate[] = (priceData.prices || []).map((price) => {
          const timeEstimate = (timeData.times || []).find(
            (t) => t.product_id === price.product_id
          );

          return {
            provider: 'uber' as const,
            productId: price.product_id as string,
            productName: price.display_name as string,
            estimatedPrice: {
              low: price.low_estimate as number || 0,
              high: price.high_estimate as number || 0,
              currency: price.currency_code as string || 'USD',
              display: price.estimate as string || '',
            },
            estimatedDuration: {
              minutes: Math.round((price.duration as number || 0) / 60),
              display: this.formatDuration(price.duration as number || 0),
            },
            estimatedPickupTime: timeEstimate ? {
              minutes: Math.round(timeEstimate.estimate / 60),
              display: `${Math.round(timeEstimate.estimate / 60)} min`,
            } : undefined,
            surge: price.surge_multiplier ? {
              multiplier: price.surge_multiplier as number,
              surging: (price.surge_multiplier as number) > 1,
            } : undefined,
            capacity: this.getProductCapacity(price.display_name as string),
          };
        });

        return estimates;
      } catch (error) {
        logger.error('Uber get estimates failed', { error });
        throw error;
      }
    });
  }

  getDeepLink(pickup: LatLng, dropoff: LatLng, provider: 'uber' | 'lyft' = 'uber'): RideDeepLink {
    if (provider === 'uber') {
      const params = new URLSearchParams({
        action: 'setPickup',
        'pickup[latitude]': pickup.lat.toString(),
        'pickup[longitude]': pickup.lng.toString(),
        'dropoff[latitude]': dropoff.lat.toString(),
        'dropoff[longitude]': dropoff.lng.toString(),
      });

      if (this.clientId) {
        params.append('client_id', this.clientId);
      }

      const baseLink = `https://m.uber.com/ul?${params.toString()}`;

      return {
        provider: 'uber',
        universalLink: baseLink,
        iosLink: `uber://?${params.toString()}`,
        androidLink: baseLink,
        webLink: `https://m.uber.com/looking?${params.toString()}`,
      };
    } else {
      // Lyft deep link
      const params = new URLSearchParams({
        'pickup[latitude]': pickup.lat.toString(),
        'pickup[longitude]': pickup.lng.toString(),
        'destination[latitude]': dropoff.lat.toString(),
        'destination[longitude]': dropoff.lng.toString(),
      });

      const lyftClientId = config.lyft?.clientId || process.env.LYFT_CLIENT_ID;
      if (lyftClientId) {
        params.append('partner', lyftClientId);
      }

      return {
        provider: 'lyft',
        universalLink: `https://lyft.com/ride?${params.toString()}`,
        iosLink: `lyft://ridetype?${params.toString()}`,
        androidLink: `https://lyft.com/ride?${params.toString()}`,
        webLink: `https://www.lyft.com/ride?${params.toString()}`,
      };
    }
  }

  async getPickupTime(location: LatLng): Promise<number | null> {
    return rateLimiter.executeForProvider('UBER', 'system', 'getPickupTime', async () => {
      try {
        const response = await fetch(
          `${this.baseUrl}/estimates/time?` +
          `start_latitude=${location.lat}&start_longitude=${location.lng}`,
          {
            headers: {
              Authorization: `Token ${this.serverToken}`,
              'Accept-Language': 'en_US',
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) {
          return null;
        }

        const data = await response.json() as { times?: Array<{ estimate: number }> };
        const times = data.times || [];

        // Return the shortest pickup time (usually UberX)
        if (times.length === 0) return null;

        const minTime = Math.min(...times.map((t) => t.estimate));
        return Math.round(minTime / 60);
      } catch (error) {
        logger.error('Uber get pickup time failed', { error });
        return null;
      }
    });
  }

  private formatDuration(seconds: number): string {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  private getProductCapacity(productName: string): number {
    const name = productName.toLowerCase();
    if (name.includes('xl') || name.includes('suv')) return 6;
    if (name.includes('pool') || name.includes('share')) return 2;
    return 4;
  }
}

// ============================================================================
// MockUberClient Implementation
// ============================================================================

export class MockUberClient implements IUberClient {
  async getEstimates(pickup: LatLng, dropoff: LatLng): Promise<RideEstimate[]> {
    logger.debug('Mock Uber: getEstimates', { pickup, dropoff });

    // Calculate mock distance-based pricing
    const distance = this.calculateDistance(pickup, dropoff);
    const baseFare = 3;
    const perKm = 1.5;
    const basePrice = Math.round(baseFare + distance * perKm);

    return [
      {
        provider: 'uber',
        productId: 'uberx',
        productName: 'UberX',
        estimatedPrice: {
          low: basePrice,
          high: Math.round(basePrice * 1.2),
          currency: 'EUR',
          display: `€${basePrice}-${Math.round(basePrice * 1.2)}`,
        },
        estimatedDuration: {
          minutes: Math.round(distance * 2),
          display: `${Math.round(distance * 2)} min`,
        },
        estimatedPickupTime: {
          minutes: 5,
          display: '5 min',
        },
        capacity: 4,
      },
      {
        provider: 'uber',
        productId: 'uberxl',
        productName: 'UberXL',
        estimatedPrice: {
          low: Math.round(basePrice * 1.5),
          high: Math.round(basePrice * 1.8),
          currency: 'EUR',
          display: `€${Math.round(basePrice * 1.5)}-${Math.round(basePrice * 1.8)}`,
        },
        estimatedDuration: {
          minutes: Math.round(distance * 2),
          display: `${Math.round(distance * 2)} min`,
        },
        estimatedPickupTime: {
          minutes: 8,
          display: '8 min',
        },
        capacity: 6,
      },
      {
        provider: 'uber',
        productId: 'comfort',
        productName: 'Comfort',
        estimatedPrice: {
          low: Math.round(basePrice * 1.3),
          high: Math.round(basePrice * 1.5),
          currency: 'EUR',
          display: `€${Math.round(basePrice * 1.3)}-${Math.round(basePrice * 1.5)}`,
        },
        estimatedDuration: {
          minutes: Math.round(distance * 2),
          display: `${Math.round(distance * 2)} min`,
        },
        estimatedPickupTime: {
          minutes: 6,
          display: '6 min',
        },
        capacity: 4,
      },
    ];
  }

  getDeepLink(pickup: LatLng, dropoff: LatLng, provider: 'uber' | 'lyft' = 'uber'): RideDeepLink {
    if (provider === 'uber') {
      return {
        provider: 'uber',
        universalLink: `https://m.uber.com/ul?action=setPickup&pickup[latitude]=${pickup.lat}&pickup[longitude]=${pickup.lng}&dropoff[latitude]=${dropoff.lat}&dropoff[longitude]=${dropoff.lng}`,
        iosLink: `uber://`,
        androidLink: `uber://`,
        webLink: `https://m.uber.com/looking`,
      };
    }

    return {
      provider: 'lyft',
      universalLink: `https://lyft.com/ride?pickup[latitude]=${pickup.lat}&pickup[longitude]=${pickup.lng}&destination[latitude]=${dropoff.lat}&destination[longitude]=${dropoff.lng}`,
      iosLink: `lyft://`,
      androidLink: `lyft://`,
      webLink: `https://www.lyft.com/ride`,
    };
  }

  async getPickupTime(location: LatLng): Promise<number | null> {
    logger.debug('Mock Uber: getPickupTime', { location });
    return 5; // 5 minutes
  }

  private calculateDistance(from: LatLng, to: LatLng): number {
    // Haversine formula for distance
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(to.lat - from.lat);
    const dLon = this.toRad(to.lng - from.lng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(from.lat)) * Math.cos(this.toRad(to.lat)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createUberClient(serverToken?: string, clientId?: string): IUberClient {
  const token = serverToken || config.uber?.serverToken || process.env.UBER_SERVER_TOKEN;

  if (token) {
    try {
      return new RealUberClient(token, clientId);
    } catch (error) {
      logger.warn('Failed to create real Uber client, falling back to mock', { error });
    }
  }

  logger.debug('Using mock Uber client');
  return new MockUberClient();
}

export const uberClient = createUberClient();
export default uberClient;
