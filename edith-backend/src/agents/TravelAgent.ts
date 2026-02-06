/**
 * TravelAgent
 * Specialized agent for flight/hotel search, booking, and itinerary management
 */

import { BaseAgent } from './BaseAgent.js';
import { registerTravelTools } from './tools/travel.tools.js';
import type {
  AIAgentContext,
  EnhancedAgentResult,
  AgentDomain,
} from '../types/index.js';

// Register travel tools on import
registerTravelTools();

const TRAVEL_SYSTEM_PROMPT = `You are Edith's Travel Agent, an intelligent travel assistant that helps plan, book, and manage travel arrangements.

## Your Capabilities
- Search for flights with flexible dates and preferences
- Search for hotels with location and amenity filters
- Find restaurants at destinations
- Book flights (requires user approval)
- Book hotels (requires user approval)
- Create and manage trip records
- Build complete travel itineraries
- Cancel bookings (requires user approval)
- Estimate ground transportation costs

## Travel Planning Guidelines

### Flight Search
1. **Price vs convenience**: Balance cost with travel time and layovers
2. **Timing**: Consider meeting times at destination
3. **Airlines**: Note user's preferred airlines and loyalty programs
4. **Class**: Default to economy unless specified
5. **Flexibility**: Show options around the requested dates

### Hotel Search
1. **Location**: Prioritize proximity to meeting venues or attractions
2. **Quality**: Match user's preferences and company policy
3. **Amenities**: Consider WiFi, gym, breakfast, parking needs
4. **Cancellation**: Prefer flexible cancellation policies
5. **Loyalty**: Consider hotel loyalty programs

### Booking Guidelines
1. **Always require approval** for any booking that involves spending
2. Show total cost including taxes and fees
3. Highlight cancellation policies
4. Note any loyalty points earned
5. Confirm travel insurance options

## Best Practices
- Create a complete itinerary with all confirmations
- Add travel events to calendar automatically
- Consider timezone changes in scheduling
- Note visa/passport requirements for international travel
- Suggest airport/hotel transportation
- Build in buffer time for connections
- Track all confirmation numbers in one place

## Cost Awareness
- Always show prices in the user's preferred currency
- Highlight price changes or deals
- Note any additional fees (baggage, seat selection)
- Compare total trip cost across options
- Track spending against travel budget if set`;

export class TravelAgent extends BaseAgent {
  protected agentType = 'TravelAgent';
  protected domain: AgentDomain = 'travel';
  protected systemPrompt = TRAVEL_SYSTEM_PROMPT;

  /**
   * Process a travel-related request
   */
  async process(
    context: AIAgentContext,
    message: string,
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const enhancedContext = await this.createEnhancedContext(
      context,
      sessionId || crypto.randomUUID(),
      crypto.randomUUID()
    );

    return this.executeWithTools<string>(enhancedContext, message);
  }

  /**
   * Process with streaming
   */
  async processStream(
    context: AIAgentContext,
    message: string,
    onChunk: (chunk: import('../types/index.js').StreamChunk) => void,
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const enhancedContext = await this.createEnhancedContext(
      context,
      sessionId || crypto.randomUUID(),
      crypto.randomUUID()
    );

    return this.executeWithToolsStream(enhancedContext, message, onChunk);
  }

  /**
   * Search for flights
   */
  async searchFlights(
    context: AIAgentContext,
    params: {
      origin: string;
      destination: string;
      departureDate: Date;
      returnDate?: Date;
      passengers?: number;
      cabinClass?: 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST';
      maxStops?: number;
    },
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const { origin, destination, departureDate, returnDate, passengers = 1, cabinClass, maxStops } = params;

    let message = `Search for flights from ${origin} to ${destination} departing ${departureDate.toDateString()}`;
    if (returnDate) message += `, returning ${returnDate.toDateString()}`;
    message += ` for ${passengers} passenger(s)`;
    if (cabinClass) message += ` in ${cabinClass.toLowerCase().replace('_', ' ')} class`;
    if (maxStops !== undefined) message += `. Maximum ${maxStops} stops`;
    message += `. Show me the best options considering price and convenience.`;

    return this.process(context, message, sessionId);
  }

  /**
   * Search for hotels
   */
  async searchHotels(
    context: AIAgentContext,
    params: {
      location: string;
      checkIn: Date;
      checkOut: Date;
      guests?: number;
      rooms?: number;
      starRating?: number;
      maxPrice?: number;
    },
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const { location, checkIn, checkOut, guests = 1, rooms = 1, starRating, maxPrice } = params;

    let message = `Search for hotels in ${location} from ${checkIn.toDateString()} to ${checkOut.toDateString()}`;
    message += ` for ${guests} guest(s) in ${rooms} room(s)`;
    if (starRating) message += `. Minimum ${starRating} stars`;
    if (maxPrice) message += `. Maximum price: €${maxPrice}/night`;
    message += `. Show the best options with their amenities and cancellation policies.`;

    return this.process(context, message, sessionId);
  }

  /**
   * Plan a complete trip
   */
  async planTrip(
    context: AIAgentContext,
    params: {
      destination: string;
      startDate: Date;
      endDate: Date;
      purpose: 'BUSINESS' | 'LEISURE' | 'MIXED';
      requirements?: string;
    },
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const { destination, startDate, endDate, purpose, requirements } = params;

    let message = `Plan a ${purpose.toLowerCase()} trip to ${destination} from ${startDate.toDateString()} to ${endDate.toDateString()}.
Please:
1. Search for suitable flights
2. Find hotels near the main activity area
3. Create a trip record
4. Build a complete itinerary`;

    if (requirements) message += `\n\nAdditional requirements: ${requirements}`;

    return this.process(context, message, sessionId);
  }

  /**
   * Get trip itinerary
   */
  async getTripItinerary(
    context: AIAgentContext,
    tripId: string,
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const message = `Get the complete itinerary for trip ${tripId}. Include all bookings, confirmation numbers, times, and any notes.`;
    return this.process(context, message, sessionId);
  }

  /**
   * Find restaurants at destination
   */
  async findRestaurants(
    context: AIAgentContext,
    params: {
      location: string;
      cuisine?: string;
      priceRange?: 'BUDGET' | 'MODERATE' | 'UPSCALE' | 'FINE_DINING';
      date?: Date;
      partySize?: number;
    },
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const { location, cuisine, priceRange, date, partySize } = params;

    let message = `Find restaurants in ${location}`;
    if (cuisine) message += ` serving ${cuisine} cuisine`;
    if (priceRange) message += `. Price range: ${priceRange.toLowerCase().replace('_', ' ')}`;
    if (date) message += `. For ${date.toDateString()}`;
    if (partySize) message += `. Party size: ${partySize}`;
    message += `. Show ratings, location, and key details.`;

    return this.process(context, message, sessionId);
  }

  /**
   * Estimate ground transportation
   */
  async estimateTransport(
    context: AIAgentContext,
    params: {
      origin: string;
      destination: string;
      date: Date;
      passengers?: number;
    },
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const { origin, destination, date, passengers = 1 } = params;

    const message = `Estimate ground transportation costs from ${origin} to ${destination} on ${date.toDateString()} for ${passengers} passenger(s). Include options like taxi, rideshare, and public transport if available.`;
    return this.process(context, message, sessionId);
  }

  /**
   * Manage booking changes
   */
  async modifyBooking(
    context: AIAgentContext,
    bookingId: string,
    action: 'cancel' | 'change' | 'status',
    details?: string,
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    let message: string;

    switch (action) {
      case 'cancel':
        message = `Cancel booking ${bookingId}. Check the cancellation policy and confirm any refund amount.`;
        break;
      case 'change':
        message = `Modify booking ${bookingId}. ${details || 'Show available change options and any fees.'}`;
        break;
      case 'status':
        message = `Get the current status of booking ${bookingId} including confirmation details and any updates.`;
        break;
    }

    return this.process(context, message!, sessionId);
  }

  /**
   * Travel summary for a date range
   */
  async getTravelSummary(
    context: AIAgentContext,
    startDate: Date,
    endDate: Date,
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const message = `Provide a travel summary from ${startDate.toDateString()} to ${endDate.toDateString()}:
1. All upcoming trips with dates and destinations
2. Active bookings (flights, hotels)
3. Total estimated travel spend
4. Any trips needing attention (incomplete bookings, pending approvals)`;

    return this.process(context, message, sessionId);
  }
}

export const travelAgent = new TravelAgent();
export default travelAgent;
