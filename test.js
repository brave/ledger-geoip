require('.').getGeoIP({ allP: true, verboseP: true, timeout: 10000 }, function (err, provider, result) {
  if (err) return console.log('provider=' + (provider || {}).name + ' ' + err.toString() + '\n')

  console.log('provider=' + provider.name + ' result=' + result + '\n')
})
