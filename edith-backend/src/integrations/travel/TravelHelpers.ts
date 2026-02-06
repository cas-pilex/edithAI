/**
 * TravelHelpers
 * Utility functions for travel-related operations
 */

import { logger } from '../../utils/logger.js';
import type { LatLng } from './GooglePlacesClient.js';

// ============================================================================
// Airport Codes Database
// ============================================================================

const AIRPORT_DATABASE: Record<string, { code: string; city: string; name: string; country: string }> = {
  // Europe
  AMS: { code: 'AMS', city: 'Amsterdam', name: 'Amsterdam Schiphol', country: 'NL' },
  LHR: { code: 'LHR', city: 'London', name: 'London Heathrow', country: 'GB' },
  LGW: { code: 'LGW', city: 'London', name: 'London Gatwick', country: 'GB' },
  CDG: { code: 'CDG', city: 'Paris', name: 'Paris Charles de Gaulle', country: 'FR' },
  ORY: { code: 'ORY', city: 'Paris', name: 'Paris Orly', country: 'FR' },
  FRA: { code: 'FRA', city: 'Frankfurt', name: 'Frankfurt', country: 'DE' },
  MUC: { code: 'MUC', city: 'Munich', name: 'Munich', country: 'DE' },
  BER: { code: 'BER', city: 'Berlin', name: 'Berlin Brandenburg', country: 'DE' },
  MAD: { code: 'MAD', city: 'Madrid', name: 'Madrid Barajas', country: 'ES' },
  BCN: { code: 'BCN', city: 'Barcelona', name: 'Barcelona El Prat', country: 'ES' },
  FCO: { code: 'FCO', city: 'Rome', name: 'Rome Fiumicino', country: 'IT' },
  MXP: { code: 'MXP', city: 'Milan', name: 'Milan Malpensa', country: 'IT' },
  ZRH: { code: 'ZRH', city: 'Zurich', name: 'Zurich', country: 'CH' },
  VIE: { code: 'VIE', city: 'Vienna', name: 'Vienna', country: 'AT' },
  BRU: { code: 'BRU', city: 'Brussels', name: 'Brussels', country: 'BE' },
  CPH: { code: 'CPH', city: 'Copenhagen', name: 'Copenhagen', country: 'DK' },
  OSL: { code: 'OSL', city: 'Oslo', name: 'Oslo Gardermoen', country: 'NO' },
  ARN: { code: 'ARN', city: 'Stockholm', name: 'Stockholm Arlanda', country: 'SE' },
  HEL: { code: 'HEL', city: 'Helsinki', name: 'Helsinki Vantaa', country: 'FI' },
  DUB: { code: 'DUB', city: 'Dublin', name: 'Dublin', country: 'IE' },
  LIS: { code: 'LIS', city: 'Lisbon', name: 'Lisbon Humberto Delgado', country: 'PT' },
  ATH: { code: 'ATH', city: 'Athens', name: 'Athens', country: 'GR' },
  IST: { code: 'IST', city: 'Istanbul', name: 'Istanbul', country: 'TR' },

  // North America
  JFK: { code: 'JFK', city: 'New York', name: 'John F. Kennedy', country: 'US' },
  EWR: { code: 'EWR', city: 'Newark', name: 'Newark Liberty', country: 'US' },
  LGA: { code: 'LGA', city: 'New York', name: 'LaGuardia', country: 'US' },
  LAX: { code: 'LAX', city: 'Los Angeles', name: 'Los Angeles', country: 'US' },
  SFO: { code: 'SFO', city: 'San Francisco', name: 'San Francisco', country: 'US' },
  ORD: { code: 'ORD', city: 'Chicago', name: "Chicago O'Hare", country: 'US' },
  MIA: { code: 'MIA', city: 'Miami', name: 'Miami', country: 'US' },
  DFW: { code: 'DFW', city: 'Dallas', name: 'Dallas Fort Worth', country: 'US' },
  ATL: { code: 'ATL', city: 'Atlanta', name: 'Atlanta', country: 'US' },
  BOS: { code: 'BOS', city: 'Boston', name: 'Boston Logan', country: 'US' },
  SEA: { code: 'SEA', city: 'Seattle', name: 'Seattle-Tacoma', country: 'US' },
  DEN: { code: 'DEN', city: 'Denver', name: 'Denver', country: 'US' },
  YYZ: { code: 'YYZ', city: 'Toronto', name: 'Toronto Pearson', country: 'CA' },
  YVR: { code: 'YVR', city: 'Vancouver', name: 'Vancouver', country: 'CA' },
  YUL: { code: 'YUL', city: 'Montreal', name: 'Montreal Trudeau', country: 'CA' },
  MEX: { code: 'MEX', city: 'Mexico City', name: 'Mexico City', country: 'MX' },

  // Asia
  NRT: { code: 'NRT', city: 'Tokyo', name: 'Tokyo Narita', country: 'JP' },
  HND: { code: 'HND', city: 'Tokyo', name: 'Tokyo Haneda', country: 'JP' },
  PEK: { code: 'PEK', city: 'Beijing', name: 'Beijing Capital', country: 'CN' },
  PVG: { code: 'PVG', city: 'Shanghai', name: 'Shanghai Pudong', country: 'CN' },
  HKG: { code: 'HKG', city: 'Hong Kong', name: 'Hong Kong', country: 'HK' },
  SIN: { code: 'SIN', city: 'Singapore', name: 'Singapore Changi', country: 'SG' },
  BKK: { code: 'BKK', city: 'Bangkok', name: 'Bangkok Suvarnabhumi', country: 'TH' },
  ICN: { code: 'ICN', city: 'Seoul', name: 'Seoul Incheon', country: 'KR' },
  DEL: { code: 'DEL', city: 'Delhi', name: 'Delhi Indira Gandhi', country: 'IN' },
  BOM: { code: 'BOM', city: 'Mumbai', name: 'Mumbai Chhatrapati Shivaji', country: 'IN' },
  DXB: { code: 'DXB', city: 'Dubai', name: 'Dubai', country: 'AE' },
  DOH: { code: 'DOH', city: 'Doha', name: 'Hamad', country: 'QA' },

  // Oceania
  SYD: { code: 'SYD', city: 'Sydney', name: 'Sydney Kingsford Smith', country: 'AU' },
  MEL: { code: 'MEL', city: 'Melbourne', name: 'Melbourne', country: 'AU' },
  AKL: { code: 'AKL', city: 'Auckland', name: 'Auckland', country: 'NZ' },

  // South America
  GRU: { code: 'GRU', city: 'Sao Paulo', name: 'Sao Paulo Guarulhos', country: 'BR' },
  EZE: { code: 'EZE', city: 'Buenos Aires', name: 'Buenos Aires Ezeiza', country: 'AR' },
  SCL: { code: 'SCL', city: 'Santiago', name: 'Santiago', country: 'CL' },
  BOG: { code: 'BOG', city: 'Bogota', name: 'Bogota El Dorado', country: 'CO' },
  LIM: { code: 'LIM', city: 'Lima', name: 'Lima Jorge Chavez', country: 'PE' },

  // Africa
  JNB: { code: 'JNB', city: 'Johannesburg', name: 'Johannesburg O.R. Tambo', country: 'ZA' },
  CPT: { code: 'CPT', city: 'Cape Town', name: 'Cape Town', country: 'ZA' },
  CAI: { code: 'CAI', city: 'Cairo', name: 'Cairo', country: 'EG' },
  NBO: { code: 'NBO', city: 'Nairobi', name: 'Nairobi Jomo Kenyatta', country: 'KE' },
  ADD: { code: 'ADD', city: 'Addis Ababa', name: 'Addis Ababa Bole', country: 'ET' },
  CMN: { code: 'CMN', city: 'Casablanca', name: 'Casablanca Mohammed V', country: 'MA' },
};

// City to airport code mapping (for common searches)
const CITY_TO_AIRPORT: Record<string, string[]> = {
  'amsterdam': ['AMS'],
  'london': ['LHR', 'LGW', 'STN', 'LTN'],
  'paris': ['CDG', 'ORY'],
  'new york': ['JFK', 'EWR', 'LGA'],
  'nyc': ['JFK', 'EWR', 'LGA'],
  'los angeles': ['LAX'],
  'la': ['LAX'],
  'tokyo': ['NRT', 'HND'],
  'san francisco': ['SFO'],
  'chicago': ['ORD', 'MDW'],
  'berlin': ['BER'],
  'frankfurt': ['FRA'],
  'munich': ['MUC'],
  'milan': ['MXP', 'LIN'],
  'rome': ['FCO', 'CIA'],
  'madrid': ['MAD'],
  'barcelona': ['BCN'],
  'dubai': ['DXB'],
  'singapore': ['SIN'],
  'hong kong': ['HKG'],
  'sydney': ['SYD'],
  'toronto': ['YYZ'],
};

// ============================================================================
// TravelHelpers Class
// ============================================================================

export class TravelHelpers {
  /**
   * Get airport code from city name or airport name
   */
  static getAirportCode(cityOrAirport: string): string | null {
    const input = cityOrAirport.toLowerCase().trim();

    // Check if it's already a valid code
    if (input.length === 3 && AIRPORT_DATABASE[input.toUpperCase()]) {
      return input.toUpperCase();
    }

    // Check city mapping
    if (CITY_TO_AIRPORT[input]) {
      return CITY_TO_AIRPORT[input][0]; // Return primary airport
    }

    // Search in airport names and cities
    for (const [code, airport] of Object.entries(AIRPORT_DATABASE)) {
      if (
        airport.city.toLowerCase() === input ||
        airport.name.toLowerCase().includes(input)
      ) {
        return code;
      }
    }

    return null;
  }

  /**
   * Get city name from airport code
   */
  static getAirportCity(code: string): string | null {
    const airport = AIRPORT_DATABASE[code.toUpperCase()];
    return airport?.city || null;
  }

  /**
   * Get full airport info
   */
  static getAirportInfo(code: string): { code: string; city: string; name: string; country: string } | null {
    return AIRPORT_DATABASE[code.toUpperCase()] || null;
  }

  /**
   * Get all airports for a city
   */
  static getAirportsForCity(city: string): string[] {
    const input = city.toLowerCase().trim();
    return CITY_TO_AIRPORT[input] || [];
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   */
  static calculateDistance(from: LatLng, to: LatLng): number {
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

  /**
   * Format flight duration
   */
  static formatDuration(minutes: number): string {
    if (minutes < 60) {
      return `${minutes}m`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (remainingMinutes === 0) {
      return `${hours}h`;
    }

    return `${hours}h ${remainingMinutes}m`;
  }

  /**
   * Parse ISO duration string (PT2H30M)
   */
  static parseDuration(isoDuration: string): number {
    const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    if (!match) return 0;

    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);

    return hours * 60 + minutes;
  }

  /**
   * Format price with currency
   */
  static formatPrice(amount: number | string, currency: string): string {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;

    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });

    return formatter.format(num);
  }

  /**
   * Convert currency (placeholder - would use real API)
   */
  static async convertCurrency(
    amount: number,
    from: string,
    to: string
  ): Promise<number> {
    // In a real implementation, this would call an exchange rate API
    // For now, return a mock conversion based on approximate rates
    const rates: Record<string, number> = {
      'EUR_USD': 1.10,
      'USD_EUR': 0.91,
      'EUR_GBP': 0.85,
      'GBP_EUR': 1.18,
      'USD_GBP': 0.77,
      'GBP_USD': 1.30,
    };

    const key = `${from.toUpperCase()}_${to.toUpperCase()}`;

    if (from === to) return amount;
    if (rates[key]) return amount * rates[key];

    // Try reverse
    const reverseKey = `${to.toUpperCase()}_${from.toUpperCase()}`;
    if (rates[reverseKey]) return amount / rates[reverseKey];

    logger.warn('Currency conversion rate not found', { from, to });
    return amount;
  }

  /**
   * Get weather forecast (placeholder)
   */
  static async getWeather(
    location: string | LatLng,
    date: Date
  ): Promise<{
    temp: number;
    tempUnit: string;
    condition: string;
    icon: string;
  } | null> {
    // In a real implementation, would call a weather API
    logger.debug('Weather lookup', { location, date });

    // Return mock data
    return {
      temp: 18,
      tempUnit: 'C',
      condition: 'Partly Cloudy',
      icon: '⛅',
    };
  }

  /**
   * Get local time for a timezone
   */
  static getLocalTime(timezone: string): Date {
    return new Date(
      new Date().toLocaleString('en-US', { timeZone: timezone })
    );
  }

  /**
   * Format date for travel display
   */
  static formatTravelDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;

    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }

  /**
   * Format time for travel display
   */
  static formatTravelTime(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;

    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  /**
   * Check if a flight is overnight
   */
  static isOvernightFlight(departure: Date, arrival: Date): boolean {
    return departure.getDate() !== arrival.getDate();
  }

  /**
   * Get readable layover duration
   */
  static formatLayover(arrivalTime: Date | string, departureTime: Date | string): string {
    const arrival = typeof arrivalTime === 'string' ? new Date(arrivalTime) : arrivalTime;
    const departure = typeof departureTime === 'string' ? new Date(departureTime) : departureTime;

    const diffMinutes = Math.round((departure.getTime() - arrival.getTime()) / (1000 * 60));
    return this.formatDuration(diffMinutes);
  }

  /**
   * Determine if layover is long (>3 hours)
   */
  static isLongLayover(arrivalTime: Date | string, departureTime: Date | string): boolean {
    const arrival = typeof arrivalTime === 'string' ? new Date(arrivalTime) : arrivalTime;
    const departure = typeof departureTime === 'string' ? new Date(departureTime) : departureTime;

    const diffHours = (departure.getTime() - arrival.getTime()) / (1000 * 60 * 60);
    return diffHours > 3;
  }

  // Private helpers
  private static toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}

export default TravelHelpers;
