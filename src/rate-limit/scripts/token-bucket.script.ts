export const TOKEN_BUCKET_SCRIPT = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])
local t = redis.call('TIME')
local nowMs = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local state = redis.call('HMGET',key,'tokens','lastRefill')
local tokens = tonumber(state[1])
local lastRefill = tonumber(state[2])

if tokens == nil then
  tokens = capacity
  lastRefill = nowMs
end

local elapsedMs = math.max(0, nowMs - lastRefill)
local refill =(elapsedMs / 1000) * refillRate

tokens = math.min(capacity,tokens + refill)

lastRefill = nowMs
local allowed = 0
local retryAfterMs = 0

if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
else
  retryAfterMs = math.ceil((1 - tokens) / refillRate * 1000)
end

redis.call('HSET',key,'tokens',tokens,'lastRefill',lastRefill)

local ttl = math.ceil(capacity / refillRate*2)

redis.call('EXPIRE',key,ttl)

return {
  allowed,
  math.floor(tokens),
  retryAfterMs
}
`;