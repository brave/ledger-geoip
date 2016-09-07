var addresses = [
  ''
]
addresses.forEach(function (address) {
  require('.').getGeoIP(address, { allP: true, debugP: true, verboseP: true, timeout: 10000 }, function (err, provider, result) {
    if (err) return console.log('address=' + address + ' provider=' + (provider || {}).name + ' ' + err.toString())

    console.log('address=' + address + ' provider=' + provider.name + ' result=' + result)
  })
})
