import { EventEmitter } from 'events';

export interface RecipeImageEvent {
  imageUrl: string | null;
  status: 'DONE' | 'FAILED';
}

class RecipeImageEventEmitter extends EventEmitter {
  emit(recipeId: string, payload: RecipeImageEvent): boolean {
    return super.emit(recipeId, payload);
  }

  on(recipeId: string, listener: (payload: RecipeImageEvent) => void): this {
    return super.on(recipeId, listener);
  }

  off(recipeId: string, listener: (payload: RecipeImageEvent) => void): this {
    return super.off(recipeId, listener);
  }
}

export const recipeImageEventEmitter = new RecipeImageEventEmitter();
// Each active SSE connection adds one listener per pending recipe.
// 200 allows ~200 concurrent connections each watching 1 recipe.
// Raise this if load testing shows it is reached regularly.
// Cast to base EventEmitter to access setMaxListeners (EventEmitter base method)
(recipeImageEventEmitter as EventEmitter).setMaxListeners(200);
