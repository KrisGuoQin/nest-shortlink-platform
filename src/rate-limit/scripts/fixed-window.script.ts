export const FIXED_WINDOW_SCRIPT = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local count = redis.call('INCR', key)

if count == 1 then
    redis.call('EXPIRE', key, window)
end

local ttl = redis.call('PTTL', key)

if count > limit then
    return {0,0,ttl}
end

return {1,limit-count,0}
`