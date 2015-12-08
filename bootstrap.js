'use strict';

const request = require('request');
const fs = require('fs');
const _ = require('lodash');
const host = 'https://localhost:9745';

// Turn off verification of certificates
process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

//.error=InvalidDeviceSecret
//getAuthResponse();
getToken();

function getRegCode() {
  request({
    url: `${host}/device/regcode/my_device/1234567`,
    json: true
  }, function(error, response, body) {
    if (error) {
      console.log(error);
      return false;
    }

    const file = fs.createWriteStream(`${__dirname}/config/deviceSecret.json`, { flags : 'w' });
    var regCode = null;

    if (body.error === 'PendingRegistration') {
      regCode = _.get(body, ['extras', 'regCode']);
    } else {
      regCode = _.get(body, 'regCode');
      file.write(JSON.stringify(body));
      file.end();
    }

    console.log({
      visit: `https://localhost:9745/device/register/${regCode}`
    });
    console.log(body);
  });
}

function getAuthResponse() {
  request({
    url: `${host}/authresponse`,
    json: true
  }, function(error, response, body) {
    if (error) {
      console.log(error);
      return false;
    }

    if (/no authentication/gi.test(body)) {
      getRegCode();
    }

    console.log(body)
  });
}

function getToken() {
  const deviceSecret = _.get(require('./config/deviceSecret.json'), 'deviceSecret');

  request({
    url: `${host}/device/accesstoken/my_device/1234567/${deviceSecret}`,
    json: true
  }, function(error, response, body) {
    if (error) {
      console.log(error);
      return false;
    }

    const file = fs.createWriteStream(`${__dirname}/config/token.json`);

    if (body.error) {
      console.log(body.error);
    } else {
      file.write(JSON.stringify(body));
      file.end();
    }

    console.log(body);
  });
}
