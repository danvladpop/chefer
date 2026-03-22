// TODO Phase 2: Implement using Claude with web_search tools to fetch real store data.
// Set GROCERY_AI_MOCK_ENABLED=false to enable. Falls back to mock on failure.
import type { GrocerySearchInput, GrocerySearchResult, IGroceryAIService } from './types.js';

export class ClaudeGroceryAIService implements IGroceryAIService {
  async searchNearbyStores(_input: GrocerySearchInput): Promise<GrocerySearchResult> {
    throw new Error(
      'ClaudeGroceryAIService not yet implemented — set GROCERY_AI_MOCK_ENABLED=true',
    );
  }
}
