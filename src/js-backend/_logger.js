const methods = ['info', 'warn', 'error', 'table']

function noop() {}
for (let method of methods) {
  noop[method] = noop
}

function logger(name, trace) {
  if (process.env.LOG !== true) return noop
  if (!trace) return noop
  if (!'console' in window) return noop
  name = `[${name.toUpperCase()}]`
  let log =  function log(...args) {
    if (!trace) return;
    args.unshift(name)
    console.log(...args)
  }
  for (let method of methods) {
    log[method] = (...args) => {
      if (!trace) return
      if(method !== 'table') args.unshift(name)
      console[method](...args)
    }
  }
  return log
}

export default logger
