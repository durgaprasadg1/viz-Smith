# Redis Caching Rollout Plan

## Objective

Reduce repeated Supabase reads by enforcing server-side Redis caching on user read paths, with strong invalidation on writes.

## Decisions

- Redis client: existing node-redis with REDIS_URL.
- Consistency: strong freshness via mutation-driven invalidation.
- Baseline TTL: 300 seconds.
- Mandatory scope: dashboard user data and history user data.

## Implementation Checklist

- [x] Add shared Redis cache utility with key builders, TTL configuration, read-through helper, and invalidation helper.
- [x] Add cached dashboard API route.
- [x] Add cached history API route.
- [x] Migrate dashboard page reads to cached API route.
- [x] Migrate history page reads to cached API route.
- [x] Invalidate dashboard and history caches after upload write.
- [x] Invalidate dashboard and history caches for affected users after cleanup write.
- [x] Add export dataset-metadata read cache.
- [x] Keep export response itself uncached (no-store).
- [ ] Add integration checks for Redis hit/miss headers during manual QA.
- [ ] Add production telemetry dashboards for cache hit rate and fallback rate.

## Cache Keys

- vizsmith:v1:user:{userId}:dashboard
- vizsmith:v1:user:{userId}:history
- vizsmith:v1:user:{userId}:dataset:{datasetId}

## Invalidation Rules

- Upload success: invalidate dashboard and history keys for uploader.
- Cleanup success: invalidate dashboard, history, and dataset keys for each affected user/dataset.
- Dataset missing during export lookup: invalidate stale dataset-scoped key.

## Verification Commands

- npm run lint

## Notes

- If REDIS_URL is missing or Redis is unavailable, routes fail open to Supabase reads.
- Dashboard realtime subscription remains active and now uses refresh=1 fetch to bypass stale cache after change events.
