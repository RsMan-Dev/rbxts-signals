local Module = {}

function Module.withArgCount(func)
  return function(...)
    return func(select("#", ...), ...)
  end
end

return Module