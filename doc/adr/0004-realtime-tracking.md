# 4. Real-time Tracking Architecture

Date: 2026-02-10

## Status

Accepted

## Context

The "Last Mile" aspect of Mecerka requires customers to track the runner's location in real-time once an order is picked up.
- **Latency**: Updates must be near real-time (every few seconds).
- **connection**: Runners (mobile) and Clients (web/mobile) need persistent connections.

## Decision

We implemented **WebSocket (Socket.io) Gateways**.

1.  **Backend**:
    - **Gateway**: `RunnerGateway` listening on namespace `/tracking`.
    - **Rooms**: Clients join rooms dedicated to specific Orders (`order_{id}`).
    - **Events**: 
        - `joinOrder`: Client subscribes to updates.
        - `updateLocation`: Runner sends coordinates (lat, lng).
        - `locationUpdated`: Server broadcasts coordinates to the room.

2.  **Frontend**:
    - **Library**: `socket.io-client`.
    - **Visualization**: `react-leaflet` for map rendering. Polyline used to trace path history.

## Consequences

- **Pros**: Low latency updates. Event-driven architecture fits well with NestJS.
- **Cons**: Stateful connections require sticky sessions if scaling to multiple backend instances (requires Redis Adapter later).
