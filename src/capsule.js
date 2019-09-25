import axios from 'axios/index'
import { cacheAdapterEnhancer, Cache } from 'axios-extensions'

const PARAMETER_REGEXP = /([:*])(\w+)/g
const DEFAULT_FIVE_MINUTES = 5000

class Capsule {
  constructor() {
    this.req = this.request.bind(this, true)
    this.methods = []
    this.debug = false
    this.http = axios
    this.defaultHeaders = {
      'Cache-Control': 'no-cache'
    }
  }

  get isNode () {
    return typeof global !== "undefined" && ({}).toString.call(global) === '[object global]';
  }
  
  log(message, type = 'success') {
    const SHRESET = "\x1b[0m"
    const color = {
      error: "\x1b[31m",
      warning: "\x1b[33m",
      success: "\x1b[32m"
    }

    if (this.isNode) {
      console.log(color[type], message, SHRESET)
    } else {
      console.log(message)
    }
  }

  enableDebug() {
    this.debug = true
  }


  addHeader(headers = {}) {
    for (const [headerKey, value] of Object.entries(headers)) {
      const parsedValue = (typeof value === 'function') ? value() : value;
      headers[headerKey] = parsedValue;
    }

    this.defaultHeaders = {
      ...this.defaultHeaders,
      ...headers
    };
  }
  
  cache(seconds = DEFAULT_FIVE_MINUTES) {
    return new Cache({ maxAge: seconds * 1000, max: 100 })
  }

  request(key, params, options = {}) {
    if (!this.methods[key]) {
      return console.error(`The route ${key} was not defined.`)
    }

    return new Promise((resolve, reject) => {
      const CACHE_REGISTER = !this.methods[key].defaults.cache && options.cache
      const CACHE_UPDATE = this.methods[key].defaults.cache && options.forceUpdate
      
      // Configure a timing based on the input passed / default 5 mins
      if(CACHE_REGISTER || CACHE_UPDATE) {

        this.methods[key].defaults.cache = this.cache(options.cache)

        // If cache it's marked as false we need to remove it as the axios will resolve the request itself
        if(options.cache !== false) {
          delete options.cache
        }
      }
  
      // Before get route object we update it's cache
      let route = Object.assign({}, this.methods[key])
      options.url = this.replaceDynamicURLParts(route.defaults.url, params)

      this.addHeader(options.headers)
      options.headers = this.defaultHeaders
  
      if(route.method === 'get') {
        options.params = params
      } else {
        options.data = params
      }

      if (this.debug === true) {
        const { method, baseURL } = route.defaults
        this.log(`[${method.toUpperCase()}] ${key} -> ${ baseURL + options.url }`)
      }

      route.request(options)
      .then(result => {
        const data = (options.fullResult && options.fullResult === true) ? result : result.data
        resolve(data)
      }).catch(error => {
        let data = {}

        if(this.isNode) {
          data = error.response && error.response.data
          if(error.code) {
            data = {
              code: error.errno,
              message: error.code
            }
          }
        } else {
          data = {
            code: error.response.status,
            message: error.response.statusText
          }
        }

        if (this.debug === true) {
          const { method, baseURL } = route.defaults
          this.log(`[${method.toUpperCase()}] ${data.code} ${key} -> ${baseURL + options.url}`, 'error')
        }

        resolve(data)
      })
    })
  }

  register(baseURL, data) {
    if(typeof baseURL !== "string") {
      return console.error("You must define the first parameter the baseURL.")
    }

    for(let method in data) {
      for(let key in data[method] ) {
        const methodData = data[method][key]

        // Treating url as always an object we open the register method to be treated very open
        let options = (typeof methodData === 'object') ? methodData : { url: methodData }

        if(typeof this.methods[key] !== 'undefined') {
          return console.error(`The route ${key} already registered`)
        }

        if(options.cache) {
          options.cache = this.cache(options.cache)
        } else {
          options.cache = false
        }

        this.methods[key] = axios.create({
          ...options,
          method,
          baseURL,
          adapter: cacheAdapterEnhancer(axios.defaults.adapter, { enabledByDefault: false })
        })
      }
    }
  }
  
  replaceDynamicURLParts(url, params) {
    return url.replace(PARAMETER_REGEXP, $0 => {
      const nameParam = $0.substring(1)
      return params[nameParam]
    })
  }
}

export default new Capsule()