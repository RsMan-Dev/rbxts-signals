-- Compiled with roblox-ts v3.0.0
local TS = _G[script]
local _signals = TS.import(script, script.Parent.Parent, "signals")
local createEffect = _signals.createEffect
local createMemo = _signals.createMemo
local createSignal = _signals.createSignal
local on = _signals.on
local onCleanup = _signals.onCleanup
local untrack = _signals.untrack
local RunService = TS.import(script, TS.getModule(script, "@rbxts", "services")).RunService
--[[
	*
	 * # Tween
	 * Creates a tween signal that animates a value from its current value to the target value over a specified duration.
	 * @param target A function that returns the target value to tween to.
	 * @param param1 An object containing the tween properties.
	 * @returns A signal that represents the current value of the tween.
	 
]]
local function createTween(target, _param)
	if _param == nil then
		_param = {}
	end
	local ease = _param.ease
	if ease == nil then
		ease = function(t)
			return t
		end
	end
	local duration = _param.duration
	if duration == nil then
		duration = 100
	end
	local elapsed = createSignal(0)
	local from = untrack(target)
	local delta = 0
	local current = createMemo(function()
		return from + delta * ease(elapsed() / duration)
	end)
	local connection = nil
	local function tick(dt)
		elapsed.set(function(prev)
			local nextVal = math.clamp(prev + (dt * 1000), 0, duration)
			if nextVal == duration then
				local _result = connection
				if _result ~= nil then
					_result:Disconnect()
				end
			end
			return nextVal
		end)
	end
	createEffect(on(target, function(target)
		from = current()
		delta = target - from
		elapsed(0)
		connection = RunService.Heartbeat:Connect(tick)
		onCleanup(function()
			local _result = connection
			if _result ~= nil then
				_result = _result:Disconnect()
			end
			return _result
		end)
	end, {
		defer = true,
	}))
	return current
end
--[[
	*
	 * # createTweened
	 * Creates a tweened signal that animates a value from its next value to the target value over a specified duration.
	 * @param value The initial value of the tweened signal.
	 * @param props An object containing the tween properties.
	 * @returns A tuple containing the tweened signal and a setter function to update the value.
	 
]]
local function createTweened(value, props)
	local signal = createSignal(value)
	local tween = createTween(signal, props)
	return { tween, function(value)
		return signal(value)
	end }
end
return {
	createTween = createTween,
	createTweened = createTweened,
}
