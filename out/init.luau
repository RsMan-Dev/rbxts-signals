-- Compiled with roblox-ts v3.0.0
local TS = _G[script]
--[[
	*
	 * Custom implementation of S.js for roblox, with interfaces inspired from many other libraries like solidjs, preact, etc.
	 * 
	 * This code is mainly not mine, the library could be created thanks to a massive inspiration from:
	 *  - https://github.com/adamhaile/S
	 *  - https://github.com/solidjs/solid
	 *  - https://www.npmjs.com/package/@preact/signals-react
	 *  - https://github.com/rodydavis/signals.dart
	 * 
	 * The code has been rewritten to be compilable using roblox-ts, and to be more useable in roblox.
	 * I included some functionalities that i foud useful in other libraries, like the on, getOwner 
	 * and runWithOwner from solidjs, the single-function signals style from preact, augmented with 
	 * other methods inspired by signals.dart.
	 * 
	 * I removed some securities, so if any buc can be fous let me know it in a pull request or in issues.
	 * 
	 * The library may be slower that the original S.js, but it is more flexible and easier to use, and i 
	 * did not found any performance issue in my tests, unless when i created a ridiculously sized tree of signals.
	 
]]
local withArgCount = TS.import(script, script, "argCount").withArgCount
-- Because luau has no console, we use print, to keep js-like syntax
local console = {
	warn = function(msg)
		return print("[WARNING]", msg)
	end,
	error = function(msg)
		return print("[ERROR]", msg)
	end,
}
-- Constants
local NOTPENDING = {}
local CURRENT = 0
local STALE = 1
local RUNNING = 2
local CurrBench = nil
--[[
	*
	 * # Benchmarking function
	 * Benchmarks a function by running it and measuring the time taken to execute it, as well as the number of computations,
	 * reads, writes and disposes that occurred during the execution.
	 * 
	 * @param fn Function to benchmark, all computations must be synchronous, and context must not be frozen
	 * @param logs Whether to log the results or not, defaults to true
	 * @returns A tuple of the result of the function and a BenchmarkResult object containing the number of computations, reads, writes, disposes and execution time in milliseconds
	 
]]
local function benchmark(fn, logs)
	if logs == nil then
		logs = true
	end
	local startTime = os.clock()
	local oldBench = CurrBench
	local bench = {
		computations = 0,
		reads = 0,
		writes = 0,
		disposes = 0,
		execTime = 0,
	}
	local result
	CurrBench = bench
	TS.try(function()
		result = fn()
	end, nil, function()
		bench.execTime = (os.clock() - startTime) * 1000
		if oldBench ~= nil then
			oldBench.computations += bench.computations
			oldBench.reads += bench.reads
			oldBench.writes += bench.writes
			oldBench.disposes += bench.disposes
		end
		CurrBench = oldBench
	end)
	if logs then
		print(`[SIGNAL-BENCH] Time taken: {bench.execTime}ms, Computations: {bench.computations}, Reads: {bench.reads}, Writes: {bench.writes}, Disposes: {bench.disposes}`)
	end
	return { result, bench }
end
local Listener = nil
local LastNode = nil
local Owner = nil
--[[
	*
	 * # Get owner
	 * @returns The current running computation node owning the current context, or undefined if there is none
	 
]]
local function getOwner()
	local owner = Owner
	-- prevent recycling the node bc can be used in async gaps.
	if owner ~= nil and owner.kept == false then
		owner.kept = true
		local clean = function()
			owner.kept = false
			return owner.kept
		end
		if owner.cleanups ~= nil then
			owner.cleanups[#owner.cleanups + 1] = clean
		else
			owner.cleanups = { clean }
		end
	end
	return owner
end
--[[
	*
	 * # Run with owner
	 * Runs a function with a given owner, and restores the previous owner after the function is executed.
	 * This is useful in asynchronous contexts where the owner will be undefined, allows to create new 
	 * computations owned by the given owner, to allow them to be disposed when the owner is disposed.
	 * 
	 * @param owner The new computation node owner to define during the function execution 
	 * @param fn The function to execute with the new owner
	 * @returns The result of the function execution
	 
]]
local function runWithOwner(owner, fn)
	local prevOwner = Owner
	Owner = owner
	local _exitType, _returns = TS.try(function()
		return TS.TRY_RETURN, { fn() }
	end, nil, function()
		Owner = prevOwner
	end)
	if _exitType then
		return unpack(_returns)
	end
end
--[[
	*
	 * # ComputationNode class
	 * Represents a computation node in the reactive system. It holds the function to be executed, its value, and its state.
	 * It also manages its dependencies and cleanups.
	 
]]
local RootClock, updateNode, logComputationRead, RootClockProxy
local ComputationNode
do
	ComputationNode = setmetatable({}, {
		__tostring = function()
			return "ComputationNode"
		end,
	})
	ComputationNode.__index = ComputationNode
	function ComputationNode.new(...)
		local self = setmetatable({}, ComputationNode)
		return self:constructor(...) or self
	end
	function ComputationNode:constructor()
		self.fn = nil
		self.value = nil
		self.age = -1
		self.state = CURRENT
		self.source1 = nil
		self.source1slot = 0
		self.sources = nil
		self.sourceslots = nil
		self.log = nil
		self.owned = nil
		self.cleanups = nil
		self.context = {}
		self.kept = false
	end
	function ComputationNode:current()
		if Listener ~= nil then
			if self.age == RootClock.time then
				if self.state == RUNNING then
					error("circular dependency")
				else
					updateNode(self)
				end
			end
			logComputationRead(self)
		end
		return self.value
	end
	function ComputationNode:clock()
		return RootClockProxy
	end
	function ComputationNode:apply(fn)
		return runWithOwner(self, fn)
	end
end
local UNOWNED = ComputationNode.new()
--[[
	*
	 * # Get candidate node
	 * Gets the last recycled node, or creates a new one if there is none.
	 * This is used to create new computations nodes to provide as root for new computations.
	 * @returns The current running computation node, or undefined if there is none
	 
]]
local function getCandidateNode()
	local node = LastNode
	if node == nil then
		node = ComputationNode.new()
	end
	LastNode = nil
	local _condition = Owner
	if _condition then
		-- ▼ ReadonlyMap.size ▼
		local _size = 0
		for _ in Owner.context do
			_size += 1
		end
		-- ▲ ReadonlyMap.size ▲
		_condition = _size > 0
	end
	if _condition then
		local _exp = Owner.context
		-- ▼ ReadonlyMap.forEach ▼
		local _callback = function(v, k)
			local _context = node.context
			local _k = k
			local _v = v
			_context[_k] = _v
			return _context
		end
		for _k, _v in _exp do
			_callback(_v, _k, _exp)
		end
		-- ▲ ReadonlyMap.forEach ▲
	end
	return node
end
--[[
	*
	 * # Create root
	 * Will create a new computation node with the given function, and will run it immediately.
	 * The node will be the base of a new computation tree, and will be disposed when the given
	 * dispose function will be executed.
	 * @param fn Function where the new owner will be defined, and will be executed immediately, with the given dispose function at first parameter
	 * @returns The result of the function execution
	 
]]
local RunningClock, dispose, recycleOrClaimNode
local function createRoot(fn)
	local root = getCandidateNode()
	local result
	local owner = Owner
	local disposer = function()
		return if root == nil then nil elseif RunningClock ~= nil then RootClock.disposes:add(root) else dispose(root)
	end
	Owner = root
	TS.try(function()
		result = fn(disposer)
	end, nil, function()
		Owner = owner
	end)
	if recycleOrClaimNode(root, nil, nil, true) then
		root = nil
	end
	return result
end
local createComputationResult = {
	node = nil,
	value = nil,
}
--[[
	*
	 * # Make computation node
	 * Creates a new computation node with the given function and initial value. The node will be owned 
	 * by the current owner, and will be disposed when the owner is disposed, unless orphaned.
	 * The computation will be executed immediately with the initial value, and will track its dependencies, unless untracked.
	 * 
	 * @warn Prefer using createEffect or createMemo instead of this function, as it is not meant to be used directly, exposed for more advanced use cases.
	 * @warn Creating a computations without any owner will never be disposed, and will leak memory.
	 * @param fn Function to execute on initialization and when any of its dependencies change, will be passed the last execution value as first parameter.
	 * @param value Initial value of the computation, will be passed to the function on first execution
	 * @param orphan Whether the computation is orphaned or not, if true, the computation will not be disposed when the owner is disposed
	 * @param sample Whether the computation is sampled or not, if true, the computation will not track its dependencies
	 * @returns 
	 
]]
local execToplevelComputation, finishToplevelComputation
local function createComputation(fn, value, orphan, untrack)
	if Owner == nil then
		console.warn("computations created without a root or parent will never be disposed")
	end
	local node = getCandidateNode()
	local owner = Owner
	local listener = Listener
	local toplevel = RunningClock == nil
	Owner = node
	Listener = if untrack then nil else node
	value = if toplevel then execToplevelComputation(fn, value) else fn(value)
	Owner = owner
	Listener = listener
	local recycled = recycleOrClaimNode(node, fn, value, orphan)
	if toplevel then
		finishToplevelComputation(owner, listener)
	end
	createComputationResult.node = if recycled then nil else node
	createComputationResult.value = value
	return createComputationResult
end
--[[
	*
	 * # DataNode class
	 * Represents a data node in the reactive system. It holds the value of the node, its state, and its dependencies.
	 * It also manages its cleanups and updates.
	 
]]
local logDataRead, event
local DataNode
do
	DataNode = setmetatable({}, {
		__tostring = function()
			return "DataNode"
		end,
	})
	DataNode.__index = DataNode
	function DataNode.new(...)
		local self = setmetatable({}, DataNode)
		return self:constructor(...) or self
	end
	function DataNode:constructor(value, signalPredicate)
		if signalPredicate == nil then
			signalPredicate = true
		end
		self.value = value
		self.signalPredicate = signalPredicate
		self.pending = NOTPENDING
		self.log = nil
	end
	function DataNode:getInstantaneousValue()
		if self.pending == NOTPENDING then
			return self.value
		else
			return self.pending
		end
	end
	function DataNode:shouldUpdate(a, b)
		if self.signalPredicate == false then
			return true
		end
		if self.signalPredicate == true then
			return a ~= b
		end
		return not self.signalPredicate(a, b)
	end
	function DataNode:current(untrack)
		if untrack == nil then
			untrack = false
		end
		if not untrack and Listener ~= nil then
			logDataRead(self)
		end
		if CurrBench ~= nil then
			CurrBench.reads += 1
		end
		return self.value
	end
	function DataNode:next(value)
		if not self:shouldUpdate(if self.pending == NOTPENDING then self.value else self.pending, value) then
			return value
		end
		if RunningClock ~= nil then
			local notPending = self.pending == NOTPENDING
			self.pending = value
			if notPending then
				RootClock.changes:add(self)
			end
		else
			if self.log ~= nil then
				self.pending = value
				RootClock.changes:add(self)
				event()
			else
				if CurrBench ~= nil then
					CurrBench.writes += 1
				end
				self.value = value
			end
		end
		return value
	end
	function DataNode:clock()
		return RootClockProxy
	end
end
--[[
	*
	 * # Make data node
	 * Creates a new data node with the given value and options. The node will be owned by the current owner, and will be disposed when the owner is disposed.
	 * 
	 * @param value The value of the data node
	 * @param options The options to be passed to the data node, including the eq function
	 * @returns The new data node
	 
]]
local function makeDataNode(value, options)
	local _exp = value
	local _result = options
	if _result ~= nil then
		_result = _result.eq
	end
	local _condition = _result
	if _condition == nil then
		_condition = true
	end
	return DataNode.new(_exp, _condition)
end
--[[
	*
	 * # Make lazy data node
	 * Creates a new lazy data node with the given value and options. The node will be created when it is first got using the accessor function.
	 * the owner used for disposal is the one that was defined at the moment of makeLazyDataNode was called, and if it was no owner at this moment,
	 * the owner used will be the one that is defined at first call of the accessor function.
	 * A lazy option is provided, when false, the node will be created directly.
	 * 
	 * @param value The accessor function to be called when the node is first accessed
	 * @param options The options to be passed to the data node, including the eq function and lazy option
	 * @returns An accessor function that will return the data node when called
	 
]]
local function makeLazyDataNode(value, options)
	local _result = options
	if _result ~= nil then
		_result = _result.lazy
	end
	local _condition = _result
	if _condition == nil then
		_condition = true
	end
	local node = if _condition then nil else makeDataNode(value, options)
	local owner = Owner
	return function()
		if node == nil then
			node = runWithOwner(owner or Owner, function()
				return makeDataNode(value, options)
			end)
		end
		return node
	end
end
--[[
	*
	 * # Create signal
	 * Makes a signal using a DataNode, with an user-friendly interface.
	 * If lazy is set to true (default), the signal will be created when it is first accessed, cf: {@link makeLazyDataNode}
	 * 
	 * @param value The first value of the signal
	 * @param options The options to be passed to the signal, including the eq function and lazy option
	 * @returns A signal object
	 
]]
local function createSignal(value, options)
	local node = makeLazyDataNode(value, options)
	return setmetatable({
		SIGNAL = true,
	}, {
		__call = withArgCount(function(argCount, _, value)
			if argCount == 1 then
				return node():current()
			else
				return node():next(value)
			end
		end),
		__index = function(target, key)
			if key == "val" then
				return node():current()
			elseif key == "set" then
				return function(fn)
					return node():next(fn(node():getInstantaneousValue()))
				end
			elseif key == "peek" then
				return node():current(true)
			elseif key == "accessor" then
				return function()
					return node():current()
				end
			end
			return target[key]
		end,
		__newindex = function(_, key, value)
			if key == "val" then
				node():next(value)
			end
		end,
		__metatable = nil,
	})
end
local function isSignal(signal)
	local _signal = signal
	local _condition = type(_signal) == "table"
	if _condition then
		_condition = signal.SIGNAL == true
	end
	return _condition
end
--[[
	*
	 * # Make memo node
	 * Like {@link makeDataNode}, will create a new data node with the given value and options, but will also create
	 * a new computation node with the given function, that will update the data node anytime its dependencies change.
	 * 
	 * @warn memo is batched, see {@link batch} for more information
	 * @warn Like any computations, creating a computations without any owner will never be disposed, and will leak memory.
	 * @param fn The function to be executed when any of its dependencies change, will update its signal value.
	 * @param value The initial value of the memo, will be passed to the function on first execution.
	 * @param options The options to be passed to the data node, including the eq function
	 * @returns 
	 
]]
local batch
local function makeMemoNode(fn, value, options)
	local dataNode
	local computationNode = createComputation(function(V)
		local newVal = batch(function()
			return fn(V)
		end)
		if dataNode then
			dataNode:next(newVal)
		end
		return newVal
	end, value, false, false)
	dataNode = makeDataNode(computationNode.value, options)
	return dataNode
end
--[[
	*
	 * # Make lazy memo node
	 * Like {@link makeMemoNode}, but with {@link makeLazyDataNode} behavior.
	 * 
	 * @warn memo is batched, see {@link batch} for more information
	 * @warn Like any computations, creating a computations without any owner will never be disposed, and will leak memory.
	 * @param fn The function to be executed when any of its dependencies change, will update its signal value.
	 * @param value The initial value of the memo, will be passed to the function on first execution.
	 * @param options The options to be passed to the data node, including the eq function
	 * @returns 
	 
]]
local function makeLazyMemoNode(fn, value, options)
	local _result = options
	if _result ~= nil then
		_result = _result.lazy
	end
	local _condition = _result
	if _condition == nil then
		_condition = true
	end
	local dataNode = if _condition then nil else makeMemoNode(fn, value, options)
	local owner = Owner
	return function()
		if dataNode == nil then
			dataNode = runWithOwner(owner or Owner, function()
				return makeMemoNode(fn, value, options)
			end)
		end
		return dataNode
	end
end
--[[
	*
	 * # Create Memo
	 * Creates a memoized function that will be executed when any of its dependencies change.
	 * The memoized will act as a computation that updates a signal value, and will be disposed when the owner is disposed.
	 * 
	 * @warn memo is batched, see {@link batch} for more information
	 * @warn Like any computations, creating a computations without any owner will never be disposed, and will leak memory.
	 * @param fn The function to be executed when any of its dependencies change, will update its data node value, will get the current value of the signal as first parameter
	 * @param value The initial value of the memo, will be passed to the function on first execution
	 * @param options 
	 
]]
local untrack
local function createMemo(fn, value, options)
	local node = makeLazyMemoNode(fn, value, options)
	return setmetatable({
		SIGNAL = false,
	}, {
		__call = function()
			return node():current()
		end,
		__index = function(target, key)
			if key == "val" then
				return node():current()
			elseif key == "peek" then
				return untrack(function()
					return node():current()
				end)
			elseif key == "accessor" then
				return function()
					return node():current()
				end
			end
			return target[key]
		end,
		__newindex = function(_, key, value)
			if key == "val" then
				node():next(value)
			end
		end,
		__metatable = nil,
	})
end
local function isReadonlySignal(signal)
	local _signal = signal
	if not (type(_signal) == "table") then
		return false
	end
	local is = signal.SIGNAL
	return is == false or is == true
end
--[[
	*
	 * # Untrack
	 * Disable listener during the function execution, so it won't track any dependencies. This is useful to avoid unnecessary updates
	 * 
	 * @param fn The function to be executed without tracking
	 * @returns The result of the function execution
	 
]]
function untrack(fn)
	local result
	local listener = Listener
	Listener = nil
	result = fn()
	Listener = listener
	return result
end
--[[
	*
	 * # Create effect
	 * Creates a new effect that will be executed when any of its dependencies change. returns a function that will get the effect result.
	 * 
	 * @warn createEffect is batched, see {@link batch} for more information
	 * @warn Like any computations, creating a computations without any owner will never be disposed, and will leak memory.
	 * @param fn The function to be executed when any of its dependencies change, will be passed the last execution value as first parameter
	 * @param value The initial value of the effect, will be passed to the function on first execution
	 * @returns A function that will get the effect result
	 
]]
local function createEffect(fn, value)
	local _binding = createComputation(fn, value, false, false)
	local node = _binding.node
	local _value = _binding.value
	return if node == nil then function()
		return _value
	end else function()
		return node:current()
	end
end
--[[
	*
	 * # On
	 * This function help to keep control of tracking, by using the first function to track dependencies, and the second one to transform
	 * the first function's result, and old computation result as second parameter, in an untracked scope, returns a function to give to 
	 * any computation.
	 * Defer option is used to wait for the first change in the first function to execute the second one, so initialisation will not 
	 * execute the second function if defer is true.
	 * 
	 * @param on Tracking function, will be called to track dependencies
	 * @param fn Transform function, will be called to transform the first function's result and old computation result
	 * @param options Options to be passed to the function, including the defer option
	 * @returns 
	 
]]
local function on(on, fn, options)
	local onchanges = if options ~= nil then options.defer == true else false
	return function(old)
		local listener = Listener
		local input = on()
		if onchanges then
			onchanges = false
			return nil
		else
			Listener = nil
			local value = fn(input, old)
			Listener = listener
			return value
		end
	end
end
--[[
	*
	 * # batch
	 * Executes a function in a batch, so all changes will be applied at once, and will not trigger any updates until the batch is finished.
	 * Nesting batches is allowed, but will have no more effect than a single batch.
	 * 
	 * @note createEffect and createMemo are already batched, so this function is not needed in most cases.
	 * @param fn The function to be executed in a batch
	 * @returns The result of the function execution
	 
]]
function batch(fn)
	local result = nil
	if RunningClock ~= nil then
		result = fn()
	else
		RunningClock = RootClock
		RunningClock.changes:reset()
		TS.try(function()
			result = fn()
			event()
		end, nil, function()
			RunningClock = nil
		end)
	end
	return result
end
--[[
	*
	 * # On cleanup
	 * Adds a cleanup function to the current owner, that will be executed when the owner is disposed.
	 * 
	 * @param fn The function to execute when the owner is disposed 
	 
]]
local function onCleanup(fn)
	if Owner == nil then
		console.warn("cleanups created without a root or parent will never be run")
	elseif Owner.cleanups == nil then
		Owner.cleanups = { fn }
	else
		Owner.cleanups[#Owner.cleanups + 1] = fn
	end
end
--[[
	*
	 * # Dispose
	 * a function to manually dispose a node, and all its dependencies.
	 * 
	 * @param node The node to dispose
	 
]]
local function disposeNode(node)
	if node == nil then
		return nil
	end
	if RunningClock ~= nil then
		RootClock.disposes:add(node)
	else
		dispose(node)
	end
end
--[[
	*
	 * # Is batching
	 * Checks if the current context is in a batch or not, and returns true if it is.
	 
]]
local function isBatching()
	return RunningClock ~= nil
end
--[[
	*
	 * # Is listening
	 * Checks if the current context is listening or not, and returns true if it is.
	 
]]
local function isListening()
	return Listener ~= nil
end
--[[
	*
	 * #Context class
	 * Represents a context in the reactive system. It holds a value and allows to run a function with the context value.
	 
]]
local Context
do
	Context = setmetatable({}, {
		__tostring = function()
			return "Context"
		end,
	})
	Context.__index = Context
	function Context.new(...)
		local self = setmetatable({}, Context)
		return self:constructor(...) or self
	end
	function Context:constructor(value)
		self.value = value
		self.symbol = {}
	end
	function Context:getValue()
		local _result = Owner
		if _result ~= nil then
			local _context = _result.context
			local _symbol = self.symbol
			_result = _context[_symbol]
		end
		local _condition = _result
		if _condition == nil then
			_condition = self.value
		end
		return _condition
	end
	function Context:populate(value)
		if Owner ~= nil then
			local _context = Owner.context
			local _symbol = self.symbol
			local _value = value
			_context[_symbol] = _value
		end
	end
	function Context:apply(value, callback, tracks)
		if tracks == nil then
			tracks = false
		end
		local _binding = createComputation(function()
			self:populate(value)
			return callback()
		end, nil, false, not tracks)
		local _value = _binding.value
		return _value
	end
	function Context:Provider(props)
		return self:apply(props.value, function()
			return props.children
		end)
	end
end
--[[
	*
	 * # Create context
	 * Creates a new context with the given value. The context can be used to run a function with the context value.
	 * 
	 * @param value The value of the context
	 * @returns The new context
	 
]]
local function createContext(value)
	return Context.new(value)
end
--[[
	*
	 * # Get context
	 * Gets the current context value. If the context is not defined, it will return the default value of the context.
	 * 
	 * @param context The context to get the value from
	 * @returns The current context value
	 
]]
local function useContext(context)
	return context:getValue()
end
--[[
	*
	 * # Create cache
	 * Cache a value to avoid executing the function multiple times.
	 * Useful to execute a function in another context, but avoiding to execute it multiple times.
	 * Cache is resettable using the second function returned.
	 * @param fn Function to be executed to get the value of the cache
	 * @returns A function that will return the cached value, and a function to clear the cache
	 
]]
local function createCache(fn)
	local value = nil
	local cache = function()
		if value == nil then
			value = fn()
		end
		return value
	end
	onCleanup(function()
		value = nil
		return value
	end)
	return { cache, function()
		value = nil
	end }
end
--/ Graph classes and operations
local Log
do
	Log = setmetatable({}, {
		__tostring = function()
			return "Log"
		end,
	})
	Log.__index = Log
	function Log.new(...)
		local self = setmetatable({}, Log)
		return self:constructor(...) or self
	end
	function Log:constructor()
		self.node1 = nil
		self.node1slot = 0
		self.nodes = nil
		self.nodeslots = nil
	end
end
local Queue
do
	Queue = setmetatable({}, {
		__tostring = function()
			return "Queue"
		end,
	})
	Queue.__index = Queue
	function Queue.new(...)
		local self = setmetatable({}, Queue)
		return self:constructor(...) or self
	end
	function Queue:constructor()
		self.items = {}
		self.count = 0
	end
	function Queue:reset()
		self.count = 0
	end
	function Queue:add(item)
		self.items[self.count + 1] = item
		self.count += 1
	end
	function Queue:run(fn)
		local items = self.items
		for _, item in items do
			fn(item)
		end
		table.clear(items)
		self.count = 0
	end
end
local Clock
do
	Clock = setmetatable({}, {
		__tostring = function()
			return "Clock"
		end,
	})
	Clock.__index = Clock
	function Clock.new(...)
		local self = setmetatable({}, Clock)
		return self:constructor(...) or self
	end
	function Clock:constructor()
		self.time = 0
		self.changes = Queue.new()
		self.updates = Queue.new()
		self.disposes = Queue.new()
	end
end
RootClock = Clock.new()
RunningClock = nil
RootClockProxy = {
	time = function(self)
		return RootClock.time
	end,
}
function execToplevelComputation(fn, _value)
	RunningClock = RootClock
	RootClock.changes:reset()
	RootClock.updates:reset()
	local value = nil
	TS.try(function()
		value = fn(_value)
	end, nil, function()
		RunningClock = nil
		Listener = RunningClock
		Owner = Listener
	end)
	return value
end
local run
function finishToplevelComputation(owner, listener)
	if RootClock.changes.count > 0 or RootClock.updates.count > 0 then
		RootClock.time += 1
		TS.try(function()
			run(RootClock)
		end, nil, function()
			RunningClock = nil
			Owner = owner
			Listener = listener
		end)
	end
end
function recycleOrClaimNode(node, fn, value, orphan)
	local _owner = if orphan or Owner == nil or Owner == UNOWNED then nil else Owner
	local recycle = node.kept == false and node.source1 == nil and (node.owned == nil and node.cleanups == nil or _owner ~= nil)
	if recycle then
		LastNode = node
		if _owner ~= nil then
			if node.owned ~= nil then
				if _owner.owned == nil then
					_owner.owned = node.owned
				else
					for _, ownedNode in node.owned do
						_owner.owned[#_owner.owned + 1] = ownedNode
					end
				end
			end
			if node.cleanups ~= nil then
				if _owner.cleanups == nil then
					_owner.cleanups = node.cleanups
				else
					for _, cleanup in node.cleanups do
						_owner.cleanups[#_owner.cleanups + 1] = cleanup
					end
				end
			end
			node.cleanups = nil
			node.owned = node.cleanups
			table.clear(node.context)
		end
	else
		node.fn = fn
		node.value = value
		node.age = RootClock.time
		if _owner ~= nil then
			if _owner.owned == nil then
				_owner.owned = { node }
			else
				_owner.owned[#_owner.owned + 1] = node
			end
		end
	end
	return recycle
end
local function logRead(from)
	local to = Listener
	local toslot = if to.source1 == nil then -1 elseif to.sources == nil then 0 else #to.sources
	local fromslot
	if from.node1 == nil then
		from.node1 = to
		from.node1slot = toslot
		fromslot = -1
	elseif from.nodes == nil then
		from.nodes = { to }
		from.nodeslots = { toslot }
		fromslot = 0
	else
		fromslot = #from.nodes
		from.nodes[fromslot + 1] = to
		from.nodeslots[#from.nodeslots + 1] = toslot
	end
	if to.source1 == nil then
		to.source1 = from
		to.source1slot = fromslot
	elseif to.sources == nil then
		to.sources = { from }
		to.sourceslots = { fromslot }
	else
		to.sources[#to.sources + 1] = from
		to.sourceslots[#to.sourceslots + 1] = fromslot
	end
end
function logDataRead(data)
	if data.log == nil then
		data.log = Log.new()
	end
	logRead(data.log)
end
function logComputationRead(node)
	if node.log == nil then
		node.log = Log.new()
	end
	logRead(node.log)
end
function event()
	-- b/c we might be under a top level S.root(), have to preserve current root
	local owner = Owner
	RootClock.updates:reset()
	RootClock.time += 1
	TS.try(function()
		run(RootClock)
	end, nil, function()
		Listener = nil
		RunningClock = Listener
		Owner = owner
	end)
end
local applyDataChange
function run(clock)
	local running = RunningClock
	local count = 0
	RunningClock = clock
	clock.disposes:reset()
	-- for each batch ...
	while clock.changes.count ~= 0 or clock.updates.count ~= 0 or clock.disposes.count ~= 0 do
		if count > 0 then
			clock.time += 1
		end
		clock.changes:run(applyDataChange)
		clock.updates:run(updateNode)
		clock.disposes:run(dispose)
		-- if there are still changes after excessive batches, assume runaway            
		count += 1
		if count > 1e5 then
			error("Runaway clock detected")
		end
	end
	RunningClock = running
end
local markComputationsStale
function applyDataChange(data)
	if CurrBench ~= nil then
		CurrBench.writes += 1
	end
	data.value = data.pending
	data.pending = NOTPENDING
	if data.log then
		markComputationsStale(data.log)
	end
end
local markNodeStale
function markComputationsStale(log)
	local node1 = log.node1
	local nodes = log.nodes
	-- mark all downstream nodes stale which haven't been already
	if node1 ~= nil then
		markNodeStale(node1)
	end
	if nodes ~= nil then
		for _, node in nodes do
			markNodeStale(node)
		end
	end
end
local markOwnedNodesForDisposal
function markNodeStale(node)
	local time = RootClock.time
	if node.age < time then
		node.age = time
		node.state = STALE
		RootClock.updates:add(node)
		if node.owned ~= nil then
			markOwnedNodesForDisposal(node.owned)
		end
		if node.log ~= nil then
			markComputationsStale(node.log)
		end
	end
end
function markOwnedNodesForDisposal(owned)
	for _, node in owned do
		node.age = RootClock.time
		node.state = CURRENT
		if node.owned ~= nil then
			markOwnedNodesForDisposal(node.owned)
		end
	end
end
local cleanupNode
function updateNode(node)
	if node.state == STALE then
		local owner = Owner
		local listener = Listener
		Listener = node
		Owner = Listener
		node.state = RUNNING
		cleanupNode(node, false)
		if CurrBench ~= nil then
			CurrBench.computations += 1
		end
		node.value = node.fn(node.value)
		node.state = CURRENT
		Owner = owner
		Listener = listener
	end
end
local cleanupSource
function cleanupNode(node, final)
	local sourceslots = node.sourceslots
	if node.cleanups ~= nil then
		for _, cleanup in node.cleanups do
			cleanup(final)
		end
		node.cleanups = nil
	end
	if node.owned ~= nil then
		for _, ownedNode in node.owned do
			dispose(ownedNode)
		end
		node.owned = nil
	end
	if node.source1 ~= nil then
		cleanupSource(node.source1, node.source1slot)
		node.source1 = nil
	end
	if node.sources ~= nil and sourceslots ~= nil then
		for i = 0, #node.sources - 1 do
			local _exp = node.sources
			-- ▼ Array.pop ▼
			local _length = #_exp
			local _result = _exp[_length]
			_exp[_length] = nil
			-- ▲ Array.pop ▲
			-- ▼ Array.pop ▼
			local _length_1 = #sourceslots
			local _result_1 = sourceslots[_length_1]
			sourceslots[_length_1] = nil
			-- ▲ Array.pop ▲
			cleanupSource(_result, _result_1)
		end
	end
end
function cleanupSource(source, slot)
	if slot == -1 then
		source.node1 = nil
	else
		local last = source.nodes[#source.nodes]
		local lastslot = source.nodeslots[#source.nodeslots]
		source.nodes[#source.nodes] = nil
		source.nodeslots[#source.nodeslots] = nil
		if slot ~= #source.nodes then
			source.nodes[slot + 1] = last
			source.nodeslots[slot + 1] = lastslot
			if lastslot == -1 then
				last.source1slot = slot
			else
				last.sourceslots[lastslot + 1] = slot
			end
		end
	end
end
function dispose(node)
	node.fn = nil
	node.log = nil
	cleanupNode(node, true)
	if CurrBench ~= nil then
		CurrBench.disposes += 1
	end
end
return {
	benchmark = benchmark,
	getOwner = getOwner,
	runWithOwner = runWithOwner,
	getCandidateNode = getCandidateNode,
	createRoot = createRoot,
	createComputation = createComputation,
	makeDataNode = makeDataNode,
	makeLazyDataNode = makeLazyDataNode,
	createSignal = createSignal,
	isSignal = isSignal,
	makeMemoNode = makeMemoNode,
	makeLazyMemoNode = makeLazyMemoNode,
	createMemo = createMemo,
	isReadonlySignal = isReadonlySignal,
	untrack = untrack,
	createEffect = createEffect,
	on = on,
	batch = batch,
	onCleanup = onCleanup,
	disposeNode = disposeNode,
	isBatching = isBatching,
	isListening = isListening,
	createContext = createContext,
	useContext = useContext,
	createCache = createCache,
	ComputationNode = ComputationNode,
}
