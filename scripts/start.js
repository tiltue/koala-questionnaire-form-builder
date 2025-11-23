/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Custom CRA start wrapper that relaxes the dev-server host firewall.
 * Webpack Dev Server 4 validates that every entry in `allowedHosts`
 * is a non-empty string. When CRA cannot determine a LAN IP address,
 * it passes an empty string which triggers the runtime schema error.
 * Setting `DANGEROUSLY_DISABLE_HOST_CHECK=true` makes CRA provide the
 * string literal "all" instead, restoring the previous behaviour.
 */

if (!process.env.DANGEROUSLY_DISABLE_HOST_CHECK) {
    process.env.DANGEROUSLY_DISABLE_HOST_CHECK = 'true';
}

require('react-scripts/scripts/start');
