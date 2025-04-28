-- Compiled with roblox-ts v3.0.0
local TS = _G[script]
local exports = {}
for _k, _v in TS.import(script, script, "animate") or {} do
	exports[_k] = _v
end
for _k, _v in TS.import(script, script, "tween") or {} do
	exports[_k] = _v
end
return exports
