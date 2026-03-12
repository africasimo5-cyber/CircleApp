# Circle - Private Chat Application

Circle is a modern, minimalist, and secure private chat application built with React and Supabase. It's designed for close circles, focusing on privacy and ease of use.

## 🚀 Features

-   **Private Messaging**: Real-time, one-on-one private chat sessions.
-   **Safe Signup & Login**: Secure authentication system with password protection.
-   **Friendship System**: Add friends by username to build your private circle (limited to 5 friends for exclusivity).
-   **PWA Ready**: Install the app on your home screen with custom branding and a native-like experience.
-   **Real-time Updates**: Instant message delivery and connection status indicators.
-   **Premium Design**: Sleek dark-mode interface with smooth animations and modern typography.

## 🛠️ Tech Stack

-   **Frontend**: [React](https://reactjs.org/) (Functional Components, Hooks)
-   **Build Tool**: [Vite](https://vite.dev/) (Fast Development & Optimized Builds)
-   **Backend/DB**: [Supabase](https://supabase.com/) (PostgreSQL + Real-time engine)
-   **Styling**: [Tailwind CSS](https://tailwindcss.com/)
-   **Icons**: [Lucide React](https://lucide.dev/)
-   **State Management**: React State & Supabase Real-time Subscriptions

## 📦 Getting Started

### Prerequisites

-   Node.js (v18+)
-   npm or yarn

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/your-repo/CircleApp.git
    cd CircleApp
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Configure Environment Variables:
    Create a `.env.local` file in the root directory and add your Supabase credentials:
    ```env
    VITE_SUPABASE_URL=your_supabase_url
    VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
    ```

4.  Start the development server:
    ```bash
    npm run dev
    ```

## 🏗️ Building for Production

To create an optimized production build, run:
```bash
npm run build
```
The output will be in the `dist/` directory, ready to be deployed.

## 📱 PWA Support

The application includes a `manifest.json` and a Service Worker (`sw.js`) to support Progressive Web App features. It uses high-resolution icons located in `/public/icons/`.

---
*Built for privacy, designed for connection.*
