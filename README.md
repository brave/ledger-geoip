# ledger-geoip
Find the geoip information for an IP address, do so using a list of geoip reporters that is weighted over time.

## API

### Get the Country Code for your IP address

        var getBalance = require('ledger-geoip').getBalance

        var address = '3...'
        getBalance(address, function (err, provider, result) {
          if (err) return console.log((provider ? (provider.name + ': ') : '') + err.toString())

          console.log('address=' + address + ' provider=' + provider.name + ' satoshis=' + result)
        })

This method works by using a modified [round-robin](https://en.wikipedia.org/wiki/Round-robin_DNS) algorithm with a simple
scoring system:

- each time that `getBalance` is called, it shuffles the list of providers and then orders them according to each provider's score

- each provider is tried in order and the first (successful) result is returned

- if  the attempt is successful,
then the provider's score is set to a number between `-250` and `5000` that corresponds to the number of milli-seconds it to took to round-trip and process the request

- if the attempt fails, then the provider score is set to one of:

    - on DNS (or other network) error: -350;

    - on timeout: -500;

    - HTTP error: -750; or,

    - on internal error: -1001 (thereby disqualifying the provider from further consideration)

### Add to the list of Providers

Each of these properties is mandatory:

        require('ledger-geoip').providers.push({ name     : 'commonly-known name of provider'
                                               , site     : 'https://example.com/'
                                               , server   : 'https://api.example.com'
                                               , path     : '"/v1/address" + address'
                                               , satoshis : 'body.confirmed_satoshis'
                                               })

The default value for the `method` is `"GET"`;
(or `"POST"` if the value for the `payload` property is present).

Both the mandatory `path` property and the optional `payload` property are evaluated with this context:

        { address: '3...' }

The mandatory `satoshis` property is evaluated with this context:

        { body: JSON.parse(HTTP_response_body) }

## Finally...

All of the GeoIP reporters in this package are available using public APIs without any API key.

If you want to have your GeoIP reporter added to the package,
please send an email to [Brave Software](mailto:devops@brave.com?subject=ledger-geoip).

If you want to have your GeoIP reporter removed from the package,
also send an [email](mailto:devops@brave.com?subject=ledger-geoip).

Enjoy!
