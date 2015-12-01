# Alexa Voice Service Server

> Node.js web server for interacting with the [Alexa Voice Service](https://developer.amazon.com/appsandservices/solutions/alexa/alexa-voice-service).

# Usage

Run auth server and authenticate.

```
curl https://localhost:3000/device/regcode/my_device/1234567 -k > ./config/deviceSecret.json

open https://localhost:3000/device/register/<regCode>

You will get a "This server could not prove that it is localhost; its security certificate is not trusted by your computer's operating system" warning. Since it's just localhost you can proceed.

https://localhost:3000/authresponse/?code=<code>&scope=<scope>&state</state>

curl https://localhost:3000/device/accesstoken/my_device/1234567/<deviceSecret> -k > ./config/token.json
```

Install dependencies

```
npm install
```

Run

```
npm start
```

# License

MIT
