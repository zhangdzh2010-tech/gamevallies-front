# Creation store module map

`src/store/gameStore.js` remains the public Zustand store and owns subscriptions,
timers, task actions and state updates. Pages continue importing the same store
and public helpers. The extracted modules do not create another store or register
global listeners.

| Module under `src/store/game/` | Responsibility |
| --- | --- |
| `constants.js` | Stage definitions, status sets and existing timing/storage limits |
| `taskProgress.js` | Status normalization, progress derivation, event merging and task errors |
| `creationSessionModel.js` | Session revision checks, pending replies and UI projections |
| `taskPersistence.js` | Active-task snapshots and tracked-task storage |
| `gameResultModel.js` | Completed-game fallback and unlocked-game projection |

Dependencies flow from the store into these modules. Constants have no imports;
session and persistence helpers may use progress helpers. Helpers must not import
the store, which would introduce a circular dependency and duplicate runtime state.

The extraction preserves the existing API exports, storage keys, timeouts,
status aliases, stage labels, quota behavior and request payloads. Product copy
and creation-session behavior are outside this change.

## Verification

Before submission, the original and extracted code were loaded in isolated Node
VM modules with the same mocked service/storage boundaries. All 41 checks passed,
covering public exports, initial store state, stage/status normalization, session
revisions, task storage and unlocked-game projection. This comparison is not a
substitute for the repository's Jest tests or a Taro build.

The `Store refactor regression` pull-request workflow runs the existing store and
creation-page test suites. Run the same suites locally with:

```sh
npm ci
npm test -- --runInBand src/store/__tests__/gameStore.creationSession.test.js src/pages/create/__tests__/create.creation-session.test.jsx
```
