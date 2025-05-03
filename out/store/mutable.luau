-- Compiled with roblox-ts v3.0.0
local TS = _G[script]
local _jsnatives = TS.import(script, TS.getModule(script, "@rbxts", "jsnatives").out)
local ArrayUtils = _jsnatives.ArrayUtils
local Object = _jsnatives.Object
local Proxy = _jsnatives.Proxy
local _signals = TS.import(script, script.Parent.Parent, "signals")
local makeDataNode = _signals.makeDataNode
local isListening = _signals.isListening
local untrack = _signals.untrack
local batch = _signals.batch
local objectNodes = setmetatable({}, {
	__mode = "k",
})
local objectProxies = setmetatable({}, {
	__mode = "k",
})
local function getNodes(obj)
	local _obj = obj
	local nodes = objectNodes[_obj]
	if not nodes then
		local _exp = obj
		nodes = {}
		local _nodes = nodes
		objectNodes[_exp] = _nodes
	end
	return nodes
end
local function getNode(nodes, key, value)
	local node = nodes[key]
	if not node then
		node = makeDataNode(value, {
			eq = false,
		})
		nodes[key] = node
	end
	return node
end
local SELF
local trackSelf = function(obj)
	return isListening() and getNode(getNodes(obj), SELF).current()
end
local updateSelf = function(obj)
	local _result = getNodes(obj)[SELF]
	if _result ~= nil then
		_result = _result:next(nil)
	end
	return _result
end
local isWrappable = function(obj)
	local _obj = obj
	if not (type(_obj) == "table") then
		return false
	end
	local meta = getmetatable(obj)
	if meta == nil then
		return true
	end
	return false
end
local PROXY
local isWrapped = function(obj)
	local _obj = obj
	if not (type(_obj) == "table") then
		return false
	end
	local meta = getmetatable(obj)
	if meta == nil or meta[PROXY] ~= true then
		return false
	end
	return true
end
local RAW = {}
local TRACK = {}
SELF = {}
PROXY = {}
local RAW_TRACKED = {}
local function unwrap(obj, untracks)
	if untracks == nil then
		untracks = true
	end
	if untracks then
		return untrack(function()
			return unwrap(obj, false)
		end)
	end
	if not isWrapped(obj) then
		return obj
	end
	if ArrayUtils.isArray(obj) then
		local newObj = {}
		for _, val in obj do
			newObj[#newObj + 1] = unwrap(val)
		end
		return newObj
	else
		local newObj = {}
		for _, _binding in Object.entries(obj) do
			local key = _binding[1]
			local value = _binding[2]
			newObj[key] = unwrap(value)
		end
		return newObj
	end
end
local function trackAll(obj)
	if not isWrapped(obj) then
		return nil
	end
	for _, value in Object.values(obj) do
		trackAll(value)
	end
end
local function withWrap(obj)
	if isWrapped(obj) then
		return obj
	end
	local _obj = obj
	local proxy = objectProxies[_obj]
	if proxy then
		return proxy
	end
	return obj
end
local function withoutWrap(obj, untracked)
	if untracked == nil then
		untracked = true
	end
	if isWrapped(obj) then
		if untracked then
			return obj[RAW]
		end
		return obj[RAW_TRACKED]
	end
	return obj
end
local function wrap(target)
	if not isWrappable(target) then
		return target
	end
	local _target = target
	local proxy = objectProxies[_target]
	if proxy then
		return proxy
	end
	proxy = Proxy.new(target, {
		get = function(target, key, proxy)
			if key == RAW then
				return target
			end
			if key == TRACK then
				return trackSelf(target)
			end
			if key == RAW_TRACKED then
				trackAll(proxy)
				return target
			end
			local nodes = getNodes(target)
			local tracked = nodes[key]
			local value = if tracked == nil then target[key] else tracked.current(false, true)
			if tracked == nil and isListening() then
				value = getNode(nodes, key, value).current(false, true)
			end
			return wrap(value)
		end,
		set = function(target, key, value, proxy)
			if key == RAW then
				return true
			end
			if key == TRACK then
				return true
			end
			if key == RAW_TRACKED then
				return true
			end
			local _value = value
			value = if type(_value) == "table" then withoutWrap(value) else value
			local current = target[key]
			if current == value then
				return true
			end
			untrack(function()
				batch(function()
					local _value_1 = value
					local _condition = type(_value_1) == "table"
					if _condition then
						_condition = type(current) == "table" and ArrayUtils.isArray(value) == ArrayUtils.isArray(current)
					end
					if _condition then
						local proxyCurrent = proxy[key]
						local anyStructuralChangeMade = false
						if ArrayUtils.isArray(value) and ArrayUtils.isArray(current) then
							local currSize = #current
							local newSize = #value
							do
								local i = 0
								local _shouldIncrement = false
								while true do
									if _shouldIncrement then
										i += 1
									else
										_shouldIncrement = true
									end
									if not (i < newSize or i < currSize) then
										break
									end
									local newVal = value[i + 1]
									local currVal = current[i + 1]
									if newVal ~= currVal then
										proxyCurrent[i] = newVal
									end
								end
							end
							anyStructuralChangeMade = newSize ~= currSize
						else
							local _set = {}
							for _, _v in Object.keys(current) do
								_set[_v] = true
							end
							local currentKeys = _set
							for _, _binding in Object.entries(value) do
								local key = _binding[1]
								local val = _binding[2]
								local currVal = current[key]
								if currVal ~= val then
									proxyCurrent[key] = val
								end
								if not (currentKeys[key] ~= nil) and val ~= nil then
									anyStructuralChangeMade = true
								else
									currentKeys[key] = nil
									if currVal == nil then
										anyStructuralChangeMade = true
									end
								end
							end
							-- ▼ ReadonlySet.size ▼
							local _size = 0
							for _ in currentKeys do
								_size += 1
							end
							-- ▲ ReadonlySet.size ▲
							if _size > 0 then
								anyStructuralChangeMade = true
								for key in currentKeys do
									proxyCurrent[key] = nil
								end
							end
						end
						if anyStructuralChangeMade then
							getNode(getNodes(target), key, value):next(current)
							updateSelf(current)
						end
					else
						target[key] = value
						local nodes = getNodes(target)
						local node = getNode(nodes, key, value)
						if node ~= nil then
							node:next(value)
						end
						updateSelf(target)
					end
				end)
			end)
			return true
		end,
	}, {}, {
		[PROXY] = true,
	})
	local _target_1 = target
	local _proxy = proxy
	objectProxies[_target_1] = _proxy
	return proxy
end
local createMutable = function(obj)
	return wrap(obj)
end
return {
	unwrap = unwrap,
	trackAll = trackAll,
	withWrap = withWrap,
	withoutWrap = withoutWrap,
	RAW = RAW,
	TRACK = TRACK,
	SELF = SELF,
	PROXY = PROXY,
	RAW_TRACKED = RAW_TRACKED,
	createMutable = createMutable,
}
