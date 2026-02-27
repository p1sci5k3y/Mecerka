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

## Security
The WebSocket gateway is protected by the `WsJwtAuthGuard` which decodes the JWT provided during the handshake query or `Authorization` header.
- **Authorization**: The service enforces strict assignment validations. Only the assigned Runner, the Client, Admin, or the Provider of a product in the order can join the room.
- **Validation**: Payload integrity ensures no unauthorized coordinate broadcasting occurs by type-checking and enforcing runner-only updates.

## Error Handling
Socket.IO exceptions are carefully caught and propagated as `WsException`. Clients connected over WebSocket receive structured Error responses, preventing unhandled promise rejections or server crashes during anomalous real-time events.

