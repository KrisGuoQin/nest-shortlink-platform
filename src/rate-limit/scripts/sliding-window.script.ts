export const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local member = ARGV[3]
local t = redis.call('TIME')
local now = tonumber(t[1]) + tonumber(t[2]) / 1000000
local cutoff = now - window
redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)
local count = redis.call('ZCARD', key)

if count < limit then
    redis.call('ZADD', key, now, member)
    redis.call('EXPIRE', key, window*2)

    return {1,limit-count-1,0}
end

local oldest = redis.call('ZRANGE',key,0,0,'WITHSCORES')
local retryAfterMs = 0

if oldest[2] then
    retryAfterMs = math.floor((tonumber(oldest[2]) + window - now) * 1000)
end

return {0,0,retryAfterMs}
`