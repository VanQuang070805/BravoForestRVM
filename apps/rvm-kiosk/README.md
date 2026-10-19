# BravoForest RVM kiosk

The kiosk page displays a short-lived member QR code and reads session state and eligible packaging from the API. It does not simulate sensor-confirmed deposits in browser code.

## Local configuration

Copy `.env.example` to `.env.local`, then set:

- `RVM_MACHINE_ID` to the ID of the real machine record deployed at the current location.
- `RVM_API_KEY` to a newly issued API key for that machine. Keep it server-only; never prefix it with `NEXT_PUBLIC_`.
- `API_URL` to the API's server-side URL.

Start the API and the machine controller before using the kiosk. The controller must submit sensor-confirmed items with machine authentication, then call the confirm/finalize endpoints when the physical deposit is complete. The kiosk polls session state and the finalized points. See the [API RVM protocol](../api/README.md#rvm-login-and-deposit-protocol).

For production Compose, copy `infrastructure/.env.kiosk.prod.example` to `.env.kiosk.prod` and set the real machine ID and a newly issued machine API key. Compose injects these values only into the kiosk server container.
