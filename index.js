var datax = require('data-expression')
var http = require('http')
var https = require('https')
var Joi = require('joi')
var underscore = require('underscore')
var url = require('url')

var schema = Joi.array().min(1).items(Joi.object().keys(
  { name: Joi.string().required().description('commonly-known name of provider'),
    site: Joi.string().uri().required().description('associated website'),
    server: Joi.string().uri({ schema: /https?/ }).required().description('HTTP(s) location of service'),
    path: Joi.string().required().description('path to evaluate for endpoint'),
    method: Joi.string().valid('GET', 'POST', 'PUT').optional().description('HTTP method'),
    payload: Joi.string().optional().description('expression to evaluate for HTTP payload'),
    addressP: Joi.boolean().optional().default(false).description('address required'),
    textP: Joi.boolean().optional().default(false).description('text result'),
    iso3166: Joi.string().required().description('expression to evaluate to resolve to an ISO3166 two-character code'),
    description: Joi.string().optional().description('a brief annotation')
  }
))

var providers = [
  { name: 'freegeoip.net',
    site: 'https://github.com/fiorix/freegeoip',
    server: 'https://freegeoip.net',
    path: "'/json/' + address",
    iso3166: 'body.country_code'
  }

/*
  { name: 'hackertarget.com',
    site: 'https://hackertarget.com/geoip-ip-location-lookup/',
    server: 'http://api.hackertarget.com',
    path: "'/geoip/?q=' + address",
    addressP: true,
    textP: true,
    iso3166: '(function () { var kv = {}; lines.forEach(function (p) { kv[p.split(":")[0]] = p.split(":")[1] }); return kv.Country.trim() })()'
  },

  { name: 'ip-api.com',
    site: 'http://ip-api.com',
    server: 'http://ip-api.com',
    path: "'/json/' + address",
    iso3166: 'body.countryCode'
  },

  { name: 'ipinfo.io',
    site: 'http://ipinfo.io',
    server: 'http://ipinfo.io',
    path: "'/json/' + address",
    iso3166: 'body.country'
  }
 */
]

var addrSchema = Joi.alternatives().try(Joi.string().ip(), Joi.string().empty(''))
var cacheExpiry = 0
var cachedIP = ''
var iso3166Schema = Joi.string().regex(/^[A-Z][A-Z]/i)

var getGeoIP = function (address, options, callback) {
  var entries, validity

  if (typeof address === 'function') {
    callback = address
    options = {}
    address = ''
  } else if (typeof address === 'object') {
    callback = options
    options = address
    address = ''
  }

  if (typeof address === 'undefined') address = ''
  else if (typeof address !== 'string') throw new Error('invalid address')
  else {
    validity = Joi.validate(address, addrSchema)
    if (validity.error) throw new Error('invalid address: ' + validity.error)
  }

  if (typeof options === 'function') {
    callback = options
    options = {}
  }
  options = underscore.extend({ roundtrip: roundTrip }, options)
  if (typeof options.roundtrip !== 'function') throw new Error('invalid roundtrip option (must be a function)')

  providers.forEach(function (provider) { if (typeof provider.score === 'undefined') provider.score = 0 })
  entries = underscore.sortBy(underscore.shuffle(providers), function (provider) { return provider.score })

  var d = function (i) {
    if (underscore.now() > cacheExpiry) cachedIP = ''
    if (cachedIP) {
      address = cachedIP
      return f(i)
    }

    whatIsMyIP(options, function (err, result) {
      if (err) return callback(err)

      cacheExpiry = underscore.now() + (5 * 60 * 1000)
      cachedIP = result

      address = result
      f(i)
    })
  }

  var e = function (provider, field) {
    var result = datax.evaluate(provider[field], { address: address })

    if (result) return result

    provider.score = -1001
    callback(new Error('provider ' + provider.name + ' has invalid ' + field + ' field: ' + provider[field]), provider)
  }

  var f = function (i) {
    var now, params, provider

    if (i === 0) {
      if (!options.allP) callback(new Error('no providers available'))
      return
    }

    provider = entries[--i]
    if (provider.score < -1000) return f(i)

    if ((!address) && (provider.addressP)) return d(i + 1)

    params = underscore.defaults(underscore.pick(provider, [ 'server', 'method' ]), underscore.pick(options, [ 'timeout' ]))
    params.path = e(provider, 'path')
    if (!params.path) return f(i)

    if (provider.payload) {
      params.payload = e(provider, 'payload')
      if (!params.payload) return f(i)
    }

    now = underscore.now()
    options.roundtrip(params, underscore.extend(options, { rawP: provider.textP }), function (err, response, payload) {
      var result

      if (err) {
        provider.score = (err.toString() === 'Error: timeout') ? -500  // timeout
                           : (typeof err.code !== 'undefined') ? -350  // DNS, etc.
                           : -750                                      // HTTP response error
      } else {
        result = datax.evaluate(provider.iso3166, provider.textP ? { lines: payload.split('\n') } : { body: payload })
        validity = Joi.validate(result, iso3166Schema)
        if (!validity.error) {
          provider.score = Math.max(5000 - (underscore.now() - now), -250)
          callback(null, provider, result)
          if (options.allP) return f(i)

          return
        }

        err = new Error('provider ' + provider.name + ' has invalid iso3166 field [' + provider.iso3166 + '] for ' +
                        JSON.stringify(payload))
        provider.score = -1001
      }

      callback(err, provider)
      f(i)
    })
  }

  f(entries.length)
}

var whatIsMyIP = function (options, callback) {
  if (typeof options === 'function') {
    callback = options
    options = {}
  }
  options = underscore.extend({ roundtrip: roundTrip }, options, { rawP: true })
  if (typeof options.roundtrip !== 'function') throw new Error('invalid roundtrip option (must be a function)')

  options.roundtrip({ server: 'http://bot.whatismyipaddress.com' }, options, function (err, response, payload) {
    if (err) return callback(err)

    callback(null, payload)
  })
}

var roundTrip = function (params, options, callback) {
  var request, timeoutP
  var parts = url.parse(params.server)
  var client = parts.protocol === 'https:' ? https : http

  params = underscore.defaults(underscore.extend(underscore.pick(parts, 'protocol', 'hostname', 'port'), params),
                               { method: params.payload ? 'POST' : 'GET' })
  if (options.debugP) console.log('\nparams=' + JSON.stringify(params, null, 2))

  request = client.request(underscore.omit(params, [ 'payload', 'timeout' ]), function (response) {
    var body = ''

    if (timeoutP) return
    response.on('data', function (chunk) {
      body += chunk.toString()
    }).on('end', function () {
      var payload

      if (params.timeout) request.setTimeout(0)

      if (options.verboseP) {
        console.log('>>> HTTP/' + response.httpVersionMajor + '.' + response.httpVersionMinor + ' ' + response.statusCode +
                   ' ' + (response.statusMessage || ''))
        console.log('>>> via: ' + params.hostname + (params.path || ''))
        console.log('>>> ' + (body || '').split('\n').join('\n>>> '))
      }
      if (Math.floor(response.statusCode / 100) !== 2) return callback(new Error('HTTP response ' + response.statusCode))

      try {
        payload = (options.rawP) ? body : (response.statusCode !== 204) ? JSON.parse(body) : null
      } catch (err) {
        return callback(err)
      }

      try {
        callback(null, response, payload)
      } catch (err0) {
        if (options.verboseP) console.log('callback: ' + err0.toString() + '\n' + err0.stack)
      }
    }).setEncoding('utf8')
  }).on('error', function (err) {
    callback(err)
  }).on('timeout', function () {
    timeoutP = true
    callback(new Error('timeout'))
  })
  if (params.payload) request.write(JSON.stringify(params.payload))
  request.end()
  if (params.timeout) request.setTimeout(params.timeout)

  if (!options.verboseP) return

  console.log('<<< ' + params.method + ' ' + params.protocol + '//' + params.hostname + (params.path || ''))
  console.log('<<<')
  if (params.payload) console.log('<<< ' + JSON.stringify(params.payload, null, 2).split('\n').join('\n<<< '))
}

module.exports = {
  getGeoIP: getGeoIP,
  whatIsMyIP: whatIsMyIP,
  providers: providers,
  schema: schema
}

var validity = Joi.validate(providers, schema)
if (validity.error) throw new Error(validity.error)
