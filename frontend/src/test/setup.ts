import '@testing-library/jest-dom'
import { afterEach, vi } from 'vitest'
import { __resetSettingsForTests } from '../settings/settingsStore'
import { __resetDragEndedForTests } from '../components/tiles/tileDragBus'
import { __resetPlanStoreForTests } from '../assets/Interfaces/writer/schedule/planStore'
import { __resetTrainingForTests } from '../assets/Interfaces/training/trainingStore'
import { __resetCastForTests } from '../assets/Interfaces/writer/characters/castStore'
import { __resetItemsForTests } from '../assets/Interfaces/writer/items/itemStore'
import { __resetPlacesForTests } from '../assets/Interfaces/writer/maps/placesStore'
import { __resetBiomesForTests } from '../assets/Interfaces/writer/maps/mapBiomes'
import { __resetWorldLinksForTests } from '../assets/Interfaces/writer/links/linkStore'
import { __resetWorldNavForTests } from '../assets/Interfaces/writer/links/worldNav'

// What one test leaves behind must not reach the next: stubbed globals (fetch, ResizeObserver, ...), the browser storage the stores read,
// and the settings store itself. (React Testing Library unmounts what a test rendered on its own.)
afterEach(() => {
  vi.unstubAllGlobals()
  // (A test that runs in Node has no window or storage.)
  try { window.localStorage.clear(); window.sessionStorage.clear() } catch { /* storage unavailable, or no window */ }
  __resetSettingsForTests()
  __resetDragEndedForTests()
  __resetPlanStoreForTests()
  __resetTrainingForTests()
  __resetPlacesForTests()
  __resetBiomesForTests()
  __resetCastForTests()
  __resetItemsForTests()
  __resetWorldLinksForTests()
  __resetWorldNavForTests()
})
