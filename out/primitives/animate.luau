-- Compiled with roblox-ts v3.0.0
local curves
local function keyframes(...)
	local keys = { ... }
	return function(t)
		if t <= 0 then
			return keys[1].value
		end
		if t >= 1 then
			return keys[#keys].value
		end
		local prevKey = keys[1]
		for i = 1, #keys - 1 do
			local key = keys[i + 1]
			if t <= key.at then
				local progress = (t - prevKey.at) / (key.at - prevKey.at)
				local easing = key.easing or curves.linear
				return prevKey.value + easing(progress) * (key.value - prevKey.value)
			end
			prevKey = key
		end
		return keys[#keys].value
	end
end
curves = {
	cubicBezier = function(p0, p1, p2, p3)
		return function(t)
			local u = 1 - t
			local tt = t * t
			local uu = u * u
			local uuu = uu * u
			local ttt = tt * t
			return uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y
		end
	end,
	linear = function(t)
		return t
	end,
	easeIn = function(t)
		return t * t
	end,
	easeOut = function(t)
		return t * (2 - t)
	end,
	easeInOut = function(t)
		return if t < 0.5 then 2 * t * t else -1 + (4 - 2 * t) * t
	end,
	bounce = function(t)
		if t < 0.36363636 then
			return 7.5625 * t * t
		elseif t < 0.72727273 then
			t -= 0.54545455
			return 7.5625 * t * t + 0.75
		elseif t < 0.90909091 then
			t -= 0.81818182
			return 7.5625 * t * t + 0.9375
		else
			t -= 0.95454545
			return 7.5625 * t * t + 0.984375
		end
	end,
	bounceIn = function(t)
		return 1 - curves.bounce(1 - t)
	end,
	bounceOut = function(t)
		return curves.bounce(t)
	end,
	bounceInOut = function(t)
		return if t < 0.5 then (1 - curves.bounce(1 - 2 * t)) / 2 else (1 + curves.bounce(2 * t - 1)) / 2
	end,
	elastic = function(t)
		local c4 = (2 * math.pi) / 3
		return if t == 0 then 0 elseif t == 1 then 1 elseif t < 0.5 then (math.pow(2, 20 * t - 10) * math.sin((t * 20 - 11.125) * c4)) / 2 else (math.pow(2, -20 * t + 10) * math.sin((t * 20 - 11.125) * c4)) / -2 + 1
	end,
	elasticIn = function(t)
		return 1 - curves.elastic(1 - t)
	end,
	elasticOut = function(t)
		return curves.elastic(t)
	end,
	elasticInOut = function(t)
		return if t < 0.5 then (1 - curves.elastic(1 - 2 * t)) / 2 else (1 + curves.elastic(2 * t - 1)) / 2
	end,
	back = function(t)
		local s = 1.70158
		return t * t * ((s + 1) * t - s)
	end,
	backIn = function(t)
		return curves.back(t)
	end,
	backOut = function(t)
		local s = 1.70158
		t -= 1
		return t * t * ((s + 1) * t + s) + 1
	end,
	backInOut = function(t)
		local s = 1.70158
		local _result
		if t < 0.5 then
			_result = (t * t * ((s + 1) * t - s)) / 2
		else
			t -= 1
			_result = (t * t * ((s + 1) * t + s)) / 2 + 1
		end
		return _result
	end,
	steps = function(steps, direction)
		if direction == nil then
			direction = "end"
		end
		local stepSize = 1 / steps
		return function(t)
			local step = math.floor(t / stepSize)
			if direction == "start" then
				return step * stepSize
			elseif direction == "end" then
				return (step + 1) * stepSize
			else
				return (step + 0.5) * stepSize
			end
		end
	end,
}
return {
	keyframes = keyframes,
	curves = curves,
}
