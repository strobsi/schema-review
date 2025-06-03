import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as core from '@actions/core';

type LicenseResponse = {
  is_trial: boolean;
  plugin: string;
  state: string;
};

export default async (pkgName: string, licenseKey?: string) => {
  const PROXY_SERVER_URI = process.env.PROXY_SERVER_URI || null;

  if (!licenseKey) {
    core.info(
      'License key is not set. Please set the EVENTCATALOG_SCALE_LICENSE_KEY parameter, you can get it from https://eventcatalog.cloud/.'
    );
    throw new Error('No license key provided');
  }

  // Verify the license key
  const fetchOptions: any = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${licenseKey}`,
      'Content-Type': 'application/json',
    },
  };
  let response: any;
  try {
    if (PROXY_SERVER_URI) {
      const proxyAgent = new HttpsProxyAgent(PROXY_SERVER_URI);
      fetchOptions.agent = proxyAgent;
    }
    response = await fetch('https://api.eventcatalog.cloud/functions/v1/license', fetchOptions);
  } catch (err: any) {
    console.log(err);
    core.info(
      'Network Connection Error: Unable to establish a connection to license server. Check network or proxy settings. Error: ' +
        err.message +
        ' '
    );
    throw new Error('Network Connection Error');
  }

  if (response.status !== 200) {
    core.info(
      'Invalid license key. Please check your plugin license key or purchase a license at https://eventcatalog.cloud/, Error: ' +
        response.statusText
    );
    throw new Error('Invalid license key');
  }

  if (response.status === 200) {
    const data = (await response.json()) as LicenseResponse;
    if (pkgName !== data.plugin) {
      core.info(
        'Invalid license key for this plugin. Please check your plugin license key or purchase a license at https://eventcatalog.cloud/' +
          pkgName +
          ' ' +
          data.plugin
      );
      throw new Error('Invalid license key for this plugin');
    }
  }

  return Promise.resolve();
};
