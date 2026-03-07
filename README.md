# PlayForge Mini Program

AI Game Creation Platform - WeChat Mini Program & H5 Frontend

Built with Taro 4, React 18, TypeScript, and Zustand

## Project Structure

```
src/
├── app.tsx                 # Root component
├── app.config.ts          # App configuration
├── app.scss               # Global styles
├── config/
│   └── env.ts            # Environment configuration
├── styles/
│   ├── variables.scss    # CSS variables
│   ├── animations.scss   # Keyframe animations
│   └── global.scss       # Global styles
├── types/
│   └── index.ts          # TypeScript type definitions
├── utils/
│   ├── request.ts        # HTTP client
│   ├── storage.ts        # Local storage wrapper
│   ├── websocket.ts      # WebSocket manager
│   ├── date.ts           # Date formatting utilities
│   ├── format.ts         # Format utilities
│   └── index.ts          # Export utilities
├── services/
│   ├── game.ts           # Game API service
│   ├── user.ts           # User API service
│   ├── comment.ts        # Comment API service
│   └── index.ts          # Service exports
├── stores/
│   ├── auth.ts           # Auth Zustand store
│   └── index.ts          # Store exports
├── components/           # Reusable React components
└── pages/
    ├── index/            # Home page
    ├── login/            # Login page
    ├── create/           # Game creation page
    ├── profile/          # User profile page
    ├── game/             # Game detail/play pages
    ├── discover/         # Discover page
    └── messages/         # Messages page
```

## Setup

### Prerequisites
- Node.js 16+ 
- npm or yarn

### Installation

```bash
npm install
# or
yarn install
```

### Development

#### WeChat Mini Program
```bash
npm run dev:weapp
```

#### Web (H5)
```bash
npm run dev:h5
```

### Build

#### WeChat Mini Program
```bash
npm run build:weapp
```

#### Web (H5)
```bash
npm run build:h5
```

### Testing
```bash
npm test
npm run test:watch
```

### Linting
```bash
npm run lint
```

## Features

- **Dark Theme**: Custom dark theme with CSS variables
- **Type Safe**: Full TypeScript support
- **State Management**: Zustand for global state
- **HTTP Client**: Built-in request wrapper with auth
- **Storage**: Persistent local storage with TTL support
- **WebSocket**: Real-time communication support
- **Responsive**: Mobile-first responsive design
- **Animations**: Smooth animations and transitions
- **Error Handling**: Comprehensive error handling

## Configuration

### Environment Variables
See `src/config/env.ts` for configuration options.

### API Base URL
- Production: `https://api.playforge.com`
- Development: `https://dev-api.playforge.com`

### WebSocket URL
- Production: `wss://ws.playforge.com`
- Development: `wss://dev-ws.playforge.com`

## Usage Examples

### Authentication
```typescript
import { useAuthStore } from '@/stores/auth';

const { user, login, logout, status } = useAuthStore();

// Login
await login(phone, code);

// Logout
await logout();
```

### API Requests
```typescript
import { request } from '@/utils/request';

// GET
const games = await request.get('/games');

// POST
const newGame = await request.post('/games', gameData);

// PUT
const updated = await request.put('/games/1', updateData);

// DELETE
await request.delete('/games/1');
```

### Storage
```typescript
import { storage } from '@/utils/storage';

// Set item
await storage.setItem('key', value, { ttl: 3600000 });

// Get item
const value = await storage.getItem('key');

// Remove item
await storage.removeItem('key');

// Clear all
await storage.clear();
```

### WebSocket
```typescript
import { getWebSocketManager } from '@/utils/websocket';

const ws = getWebSocketManager(token);

await ws.connect();

ws.onMessage((message) => {
  console.log('Message received:', message);
});

ws.send({
  type: 'notification',
  payload: {...},
  timestamp: new Date().toISOString(),
});

ws.disconnect();
```

## Styling

### Color Variables
All colors are defined in `src/styles/variables.scss`:
- `$bg`: Main background
- `$surface`: Surface color
- `$card`: Card background
- `$primary`: Primary brand color
- `$text`: Text color
- `$sub`: Secondary text color
- And more...

### Utilities
Common utility classes are available in `src/app.scss`:
- Flexbox: `.flex-center`, `.flex-between`, `.flex-row`, `.flex-col`
- Grid: `.grid`, `.grid-3`, `.grid-4`
- Spacing: `.m-0` to `.m-4`, `.p-0` to `.p-4`
- Text: `.text-center`, `.text-primary`, `.font-bold`
- Responsive: `.w-full`, `.h-full`, etc.

## API Endpoints

### Games
- `GET /games` - Get all games
- `GET /games/:id` - Get single game
- `POST /games` - Create game
- `PUT /games/:id` - Update game
- `DELETE /games/:id` - Delete game
- `GET /users/:id/games` - Get user games
- `GET /games/trending` - Get trending games
- `GET /games/recommended` - Get recommended games
- `POST /games/:id/like` - Like game
- `DELETE /games/:id/like` - Unlike game

### Users
- `GET /users/:id` - Get user profile
- `GET /users/me` - Get current user
- `PUT /users/me` - Update profile
- `POST /users/:id/follow` - Follow user
- `DELETE /users/:id/follow` - Unfollow user
- `GET /users/:id/followers` - Get followers
- `GET /users/:id/following` - Get following
- `GET /users/search` - Search users

### Comments
- `GET /games/:id/comments` - Get comments
- `POST /games/:id/comments` - Create comment
- `PUT /comments/:id` - Update comment
- `DELETE /comments/:id` - Delete comment
- `POST /comments/:id/like` - Like comment
- `DELETE /comments/:id/like` - Unlike comment

### Notifications
- `GET /notifications` - Get notifications
- `PUT /notifications/:id/read` - Mark as read
- `PUT /notifications/read-all` - Mark all as read

## Browser Support

- WeChat Mini Program (iOS 10+, Android 4.1+)
- Web (Last 3 versions of modern browsers)

## License

Proprietary - PlayForge Inc.

## Contributing

Please follow the existing code style and conventions.
