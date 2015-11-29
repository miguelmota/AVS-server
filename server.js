const https = require('https');
const fs = require('fs');
const stream = require('stream');
const streamToBuffer = require('stream-to-buffer');
const SpawnStream = require('spawn-stream');
const isStream = require('is-stream');
const isBuffer = require('is-buffer');
const request = require('request');
const _ = require('lodash');

const AUTH_CONFIG = require('./config/auth.json');
const AUTH_HOST = _.get(AUTH_CONFIG, 'host', 'localhost');
const AUTH_PORT = _.get(AUTH_CONFIG, 'port', 3000);
const PRODUCT_ID = _.get(AUTH_CONFIG, 'productId', 'product_id');
const DEVICE_SERIAL_NUMBER = _.get(AUTH_CONFIG, 'deviceSerialNumber', 0);

const TOKEN_JSON_FILE = __dirname + '/config/token.json';
const DEVICE_SECRET = _.get(require('./config/deviceSecret.json'), 'deviceSecret');

const CONFIG = require('./config/config.json');
const WEBSOCKET_PORT = _.get(CONFIG, ['websocket', 'port'], 8080);

// Turn off verification of certificates
process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

const WebSocketServer = require('ws').Server;
const wss = new WebSocketServer({
  port: WEBSOCKET_PORT
});

const ERROR_CODES = {
  INVALID_TOKEN: 'com.amazon.alexahttpproxy.exceptions.InvalidAccessTokenException'
};

const app = require('express')();
const http = require('http').Server(app);

var TOKEN;

function loadTokenFromFile() {
  fs.readFile(TOKEN_JSON_FILE, function(error, token) {
    if (error) {
      console.error(error);
    } else {
      TOKEN = JSON.parse(token).access;
    }
  });
}

function getNewToken() {
  const URL = 'https://' + AUTH_HOST + ':' + AUTH_PORT + '/device/accesstoken/' + PRODUCT_ID + '/' + DEVICE_SERIAL_NUMBER + '/' + DEVICE_SECRET;

  request({
    url: URL
  }, function(error, response, body) {
    if (error) {
      console.error(error);
    }

    if (body) {
      try {
        body = JSON.parse(body);
      } catch(e) {

      }

      if (_.get(body, 'access')) {
        fs.writeFile(TOKEN_JSON_FILE, JSON.stringify(body), function(error) {
          if (error) {
            console.error(error);
          } else {
            console.log('new token saved.');
            loadTokenFromFile();
          }
        });
      } else {
        console.error('No access token retrieved');
        console.error(body);
      }
    }
  });
}

loadTokenFromFile();

wss.on('connection', function(ws) {
  ws.on('message', function(payload) {
    try {
      payload = JSON.parse(payload);
    } catch(e) {
      payload = {};
    }

    const audioBase64 = payload.data;
    var inputAudioStream = new stream.PassThrough();

    if (_.isString(audioBase64)) {
      console.log('Received audio');
      const inputAudioBuffer = new Buffer(audioBase64, 'base64');

      inputAudioStream.end(inputAudioBuffer);
    } else {
      inputAudioStream.end('');
    }

    const sox = SpawnStream('sox', ['-', '-r', '16000', '-e', 'signed', '-b', '16', 'input.wav']);

    inputAudioStream.pipe(sox);

    setTimeout(function() {
      const formattedAudioStream = fs.createReadStream(__dirname + '/input.wav');

      post(ws, formattedAudioStream);
    }, 500);
  });
});

app.get('/', function(req, res){
  res.send('index');
});

const PORT = process.ENV_PORT || _.get(CONFIG, 'port', 9000);

http.listen(PORT, function(){

});

function post(ws, audioBuffer) {
  const BOUNDARY = 'BLAH1234';
  const BOUNDARY_DASHES = '--';
  const NEWLINE = '\r\n';
  const METADATA_CONTENT_DISPOSITION = 'Content-Disposition: form-data; name="metadata"';
  const METADATA_CONTENT_TYPE = 'Content-Type: application/json; charset=UTF-8';
  const AUDIO_CONTENT_TYPE = 'Content-Type: audio/L16; rate=16000; channels=1';
  const AUDIO_CONTENT_DISPOSITION = 'Content-Disposition: form-data; name="audio"';

  const headers = {
    'Authorization' : 'Bearer ' + TOKEN,
    'Content-Type':'multipart/form-data; boundary=' + BOUNDARY
  };

  const metadata = {
    messageHeader: {},
    messageBody: {
      profile: 'alexa-close-talk',
      locale: 'en-us',
      'format': 'audio/L16; rate=16000; channels=1'
    }
  };

  const postDataStart = [
    NEWLINE, BOUNDARY_DASHES, BOUNDARY, NEWLINE, METADATA_CONTENT_DISPOSITION, NEWLINE, METADATA_CONTENT_TYPE,
    NEWLINE, NEWLINE, JSON.stringify(metadata), NEWLINE, BOUNDARY_DASHES, BOUNDARY, NEWLINE,
    AUDIO_CONTENT_DISPOSITION, NEWLINE, AUDIO_CONTENT_TYPE, NEWLINE, NEWLINE
  ].join('');

  const postDataEnd = [NEWLINE, BOUNDARY_DASHES, BOUNDARY, BOUNDARY_DASHES, NEWLINE].join('');

  const options = {
    hostname: 'access-alexa-na.amazon.com',
    port: 443,
    path: '/v1/avs/speechrecognizer/recognize',
    method: 'POST',
    headers: headers,
    encoding: 'binary'
  };

  const req = https.request(options, function(res) {
    streamToBuffer(res, function (err, buffer) {
      console.log('response', buffer.length);
      if (err) {
        console.error('error', err);
        return false;
      }

      var errorCode;

      try {
        errorCode = JSON.parse(buffer.toString('utf8')).error.code;
        console.log(errorCode);
      } catch(e) {

      }

      if (errorCode) {
        if (errorCode === ERROR_CODES.INVALID_TOKEN) {
          getNewToken();
          return false;
        }
      }

      const str = buffer.toString('utf8');
      const start = str.indexOf('mpeg')+4;
      const end = str.search(/--[\s\s]*$/);
      const slicedBuffer = buffer.slice(start,end);
      const responseAudioStream = new stream.PassThrough();
      responseAudioStream.end(slicedBuffer);

      const hstart = str.indexOf('application/json')+16;
      const hend = str.search('}}');
      const headersString = str.slice(hstart, hend+5);
      var headers = {};
      console.log(hstart, hend);

      if (hend > -1) {
        try {
          headers = JSON.parse(headersString.trim());
          console.log(JSON.stringify(headers));
        } catch(e) {

        }
      }

      responseAudioStream.on('data', function(data) {
        ws.send(data, {binary: true});
        /*
        ws.send(JSON.stringify({
          headers: headers
        }));
       */
      });
    });

    req.on('error', function(e) {
      console.log('problem with request: ' + e.message);
    });
  });

  if (isStream(audioBuffer)) {
    streamToBuffer(audioBuffer, function(error, buffer) {
      if (error) {
        console.error(error);
        return false;
      }
      sendRequest(buffer);
    });
  } else if (isBuffer(audioBuffer)) {
    sendRequest(audioBuffer);
  } else {
    console.error('Audio buffer invalid');
  }

  function sendRequest(audBuffer) {
    req.write(postDataStart);
    req.write(audBuffer);
    req.write(postDataEnd);
    req.end();
  }
}
