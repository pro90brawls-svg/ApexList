# ApexList

**ApexList** is a Geometry Dash Extreme Demon tracker and leaderboard web app that unifies live data from the **Classic Pointercrate Demonlist (Top 150)** and **AREDL (All Rated Extreme Demons List)** with real-time notifications, Top 10 victor tracking, and an interactive monthly activity calendar.

## Features

- **Unified & Source-Filtered Demonlist**: Browse Classic Pointercrate (`#1–75` Main List, `#76–150` Extended List) and AREDL (`#151+` and full Extreme Demon rankings) with live search, tier filters, rank delta indicators, and detailed level modals.
- **Top 10 Victor Watch**: Monitor the current Top 10 hardest levels with expandable 100% victor rosters, verification proof links, and merged Pointercrate + AREDL completion records.
- **Monthly Activity Calendar**: Explore dated Top 10 completions, Pointercrate historical placements/re-ranks (via Time Machine snapshots), and AREDL changelog updates in an interactive monthly calendar.
- **Real-Time Alerts & Live Changelog**: Server-Sent Events (SSE) stream live updates whenever a demon is placed, moved on the leaderboard, or beaten by a Top 10 victor—with configurable browser desktop notifications, audio chimes, and toast alerts.
- **Player Rankings**: View the Top 100 ranked players across Classic Pointercrate and AREDL.
- **Responsive UI**: Animated transitions with Motion, mobile-friendly navigation and tables, and a clean dark workspace.

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Motion, Lucide Icons
- **Backend**: Node.js, Express, Server-Sent Events (SSE)
- **Data Sources**: Pointercrate API / Time Machine & AREDL v2 API
