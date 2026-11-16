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
import { __resetShapeLibraryForTests } from '../assets/Interfaces/writer/maps/mapShapeStore'
import { __resetWorldLinksForTests } from '../assets/Interfaces/writer/links/linkStore'
import { __resetWorldNavForTests } from '../assets/Interfaces/writer/links/worldNav'
import { __resetChannelsForTests } from '../channels/channelStore'
import { __resetResourcesForTests } from '../channels/resourcesStore'
import { __resetStaffForTests } from '../feedback/staffStore'
import { __resetMineForTests } from '../feedback/mineStore'
import { __resetPlanForTests } from '../plan/projectPlanStore'
import { __resetRosterForTests } from '../staff/rosterStore'
import { __resetSupportForTests } from '../support/supportStores'

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
  __resetResourcesForTests()
  __resetPlacesForTests()
  __resetBiomesForTests()
  __resetShapeLibraryForTests()
  __resetCastForTests()
  __resetItemsForTests()
  __resetWorldLinksForTests()
  __resetWorldNavForTests()
  __resetChannelsForTests()
  __resetStaffForTests()
  __resetMineForTests()
  __resetPlanForTests()
  __resetRosterForTests()
  __resetSupportForTests()
})
