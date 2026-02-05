# Family Sync - Family Coordination App

## Overview

Family Sync is a mobile-first family coordination application built with Expo React Native for the frontend and Express.js for the backend. The app helps families manage their daily activities including calendar events, shopping lists, chores, and family member coordination. The application supports iOS, Android, and web platforms through Expo's cross-platform capabilities.

The app is designed to be production-ready for App Store and Google Play deployment, featuring a clean Italian-language interface with haptic feedback, dark mode support, and offline-first data management.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: Expo SDK 54 with React Native 0.81
- **Routing**: expo-router v6 with file-based routing and typed routes
- **State Management**: 
  - React Context (FamilyContext) for global family data
  - TanStack React Query for server state management
  - AsyncStorage for local persistence
- **UI Components**: Custom component library (Avatar, Button, Card, Input, EmptyState)
- **Styling**: React Native StyleSheet with theming support (light/dark mode)
- **Navigation**: Tab-based navigation with 5 main screens (Home, Calendar, Shopping, Chores, Family)

### Backend Architecture
- **Framework**: Express.js v5
- **Language**: TypeScript with tsx for development
- **API Pattern**: RESTful endpoints prefixed with `/api`
- **Database ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Validation**: Zod with drizzle-zod integration

### Data Storage
- **Primary Database**: PostgreSQL (configured via DATABASE_URL environment variable)
- **Local Storage**: AsyncStorage for offline-first family data caching
- **Schema Location**: `shared/schema.ts` - contains user table definition
- **Migrations**: Drizzle Kit with migrations output to `./migrations`

### Key Design Patterns
- **Offline-First**: Family data is stored locally via AsyncStorage and synced when available
- **Cross-Platform**: Single codebase for iOS, Android, and web using Expo
- **Type Safety**: Full TypeScript coverage with strict mode enabled
- **Error Boundaries**: React error boundary implementation for graceful error handling
- **Haptic Feedback**: expo-haptics integration for tactile user feedback

### Project Structure
```
├── app/                    # Expo Router file-based routes
│   ├── (tabs)/            # Tab navigation screens
│   ├── _layout.tsx        # Root layout with providers
│   └── [modals].tsx       # Modal screens (add-member, add-event, etc.)
├── components/            # Reusable UI components
├── constants/             # Theme colors and constants
├── context/               # React Context providers
├── hooks/                 # Custom React hooks
├── lib/                   # Utility libraries (query client, API helpers)
├── server/                # Express.js backend
│   ├── index.ts          # Server entry point
│   ├── routes.ts         # API route registration
│   └── storage.ts        # Data storage interface
├── shared/                # Shared code between frontend/backend
│   └── schema.ts         # Drizzle database schema
└── types/                 # TypeScript type definitions
```

## External Dependencies

### Database
- **PostgreSQL**: Primary database, configured via `DATABASE_URL` environment variable
- **Drizzle ORM**: Database toolkit for type-safe SQL queries

### Core Libraries
- **Expo SDK**: Cross-platform mobile development framework
- **Express.js**: Backend HTTP server framework
- **TanStack React Query**: Server state management
- **React Native Reanimated**: Animation library
- **React Native Gesture Handler**: Touch gesture handling

### UI/UX
- **@expo-google-fonts/inter**: Inter font family for consistent typography
- **@expo/vector-icons**: Icon library (Ionicons primarily used)
- **expo-blur / expo-glass-effect**: Visual effects for modern UI
- **expo-haptics**: Haptic feedback for tactile interactions
- **expo-linear-gradient**: Gradient backgrounds

### Development Tools
- **Drizzle Kit**: Database migration and schema management
- **tsx**: TypeScript execution for development
- **esbuild**: Production server bundling

### Environment Variables Required
- `DATABASE_URL`: PostgreSQL connection string
- `EXPO_PUBLIC_DOMAIN`: Public domain for API requests
- `REPLIT_DEV_DOMAIN`: Development domain (Replit-specific)