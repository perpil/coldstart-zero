//this code is a heavily modified version of https://github.com/mhart/aws4/blob/master/aws4.js
const crypto = require("crypto");
const querystring = require("querystring");
import cf from "cloudfront";
const kvsId = "KVSTORE_ID";
const kvsHandle = cf.kvs(kvsId);

function hmac(key, string, encoding) {
  return crypto
    .createHmac("sha256", key)
    .update(string, "utf8")
    .digest(encoding);
}

function hash(string, encoding) {
  return crypto.createHash("sha256").update(string, "utf8").digest(encoding);
}

// This function assumes the string has already been percent encoded
function encodeRfc3986(urlEncodedString) {
  return urlEncodedString.replace(/[!'()*]/g, function (c) {
    return "%" + c.charCodeAt(0).toString(16).toUpperCase();
  });
}

function encodeRfc3986Full(str) {
  return encodeRfc3986(encodeURIComponent(str));
}

var HEADERS_TO_IGNORE = [
  "authorization",
  "connection",
  "x-amzn-trace-id",
  "user-agent",
  "expect",
  "presigned-expires",
  "range",
];

// request: { path | body, [host], [method], [headers] }
// credentials: { accessKeyId, secretAccessKey, [sessionToken] }
let tRequest,
  tCredentials,
  tService,
  tRegion,
  tExtraHeadersToIgnore,
  tExtraHeadersToInclude,
  tParsedPath,
  tDatetime;
function RequestSigner(request, credentials) {
  var headers = (request.headers = request.headers || {});

  tRequest = request;
  tCredentials = credentials;

  tService = "s3";
  tRegion = request.host.match(/^[^\.]+\.s3\.(.*?)\.amazonaws\.com$/)[1];

  if (!headers.Host && !headers.host) {
    headers.Host = request.host;
  }

  tExtraHeadersToIgnore = request.extraHeadersToIgnore || {};
  tExtraHeadersToInclude = request.extraHeadersToInclude || {};
}

function prepareRequest() {
  parsePath();

  var request = tRequest,
    headers = request.headers,
    query;
  if (request.signQuery) {
    tParsedPath.query = query = tParsedPath.query || {};

    if (tCredentials.sessionToken)
      query["X-Amz-Security-Token"] = tCredentials.sessionToken;

    if (tService === "s3" && !query["X-Amz-Expires"])
      query["X-Amz-Expires"] = 86400;

    if (query["X-Amz-Date"]) tDatetime = query["X-Amz-Date"];
    else query["X-Amz-Date"] = getDateTime();

    query["X-Amz-Algorithm"] = "AWS4-HMAC-SHA256";
    query["X-Amz-Credential"] =
      tCredentials.accessKeyId + "/" + credentialString();
    query["X-Amz-SignedHeaders"] = signedHeaders();
  } else {
    if (!request.doNotModifyHeaders) {
      if (request.body && !headers["Content-Type"] && !headers["content-type"])
        headers["Content-Type"] =
          "application/x-www-form-urlencoded; charset=utf-8";

      if (
        request.body &&
        !headers["Content-Length"] &&
        !headers["content-length"]
      )
        headers["Content-Length"] = Buffer.byteLength(request.body);

      if (
        tCredentials.sessionToken &&
        !headers["X-Amz-Security-Token"] &&
        !headers["x-amz-security-token"]
      )
        headers["X-Amz-Security-Token"] = tCredentials.sessionToken;

      headers["X-Amz-Date"] = getDateTime();
    }
  }
}

function sign() {
  if (!tParsedPath) prepareRequest();

  if (tRequest.signQuery) {
    tParsedPath.query["X-Amz-Signature"] = signature();
  } else {
    tRequest.headers.Authorization = authHeader();
  }

  tRequest.path = formatPath();

  return tRequest;
}

function getDateTime() {
  if (!tDatetime) {
    var headers = tRequest.headers,
      date = new Date(headers.Date || headers.date || new Date());

    tDatetime = date.toISOString().replace(/[:\-]|\.\d{3}/g, "");
  }
  return tDatetime;
}

function getDate() {
  return getDateTime().substr(0, 8);
}

function authHeader() {
  return [
    "AWS4-HMAC-SHA256 Credential=" +
      tCredentials.accessKeyId +
      "/" +
      credentialString(),
    "SignedHeaders=" + signedHeaders(),
    "Signature=" + signature(),
  ].join(", ");
}

function signature() {
  var date = getDate();
  var kCredentials = hmac(
    hmac(
      hmac(hmac("AWS4" + tCredentials.secretAccessKey, date), tRegion),
      tService
    ),
    "aws4_request"
  );
  return hmac(kCredentials, stringToSign(), "hex");
}

function stringToSign() {
  return [
    "AWS4-HMAC-SHA256",
    getDateTime(),
    credentialString(),
    hash(canonicalString(), "hex"),
  ].join("\n");
}

function canonicalString() {
  if (!tParsedPath) prepareRequest();

  var pathStr = tParsedPath.path,
    query = tParsedPath.query,
    headers = tRequest.headers,
    queryStr = "",
    decodePath = tRequest.doNotEncodePath,
    bodyHash;

  if (tService === "s3" && tRequest.signQuery) {
    bodyHash = "UNSIGNED-PAYLOAD";
  } else if (this.isCodeCommitGit) {
    bodyHash = "";
  } else {
    bodyHash =
      headers["X-Amz-Content-Sha256"] ||
      headers["x-amz-content-sha256"] ||
      hash(this.request.body || "", "hex");
  }

  if (query) {
    var reducedQuery = Object.keys(query).reduce(function (obj, key) {
      if (!key) return obj;
      obj[encodeRfc3986Full(key)] = !Array.isArray(query[key])
        ? query[key]
        : query[key];
      return obj;
    }, {});
    var encodedQueryPieces = [];
    Object.keys(reducedQuery)
      .sort()
      .forEach(function (key) {
        if (!Array.isArray(reducedQuery[key])) {
          encodedQueryPieces.push(
            key + "=" + encodeRfc3986Full(reducedQuery[key])
          );
        } else {
          reducedQuery[key]
            .map(encodeRfc3986Full)
            .sort()
            .forEach(function (val) {
              encodedQueryPieces.push(key + "=" + val);
            });
        }
      });
    queryStr = encodedQueryPieces.join("&");
  }
  if (pathStr !== "/") {
    pathStr = pathStr
      .split("/")
      .reduce(function (path, piece) {
        if (decodePath) piece = decodeURIComponent(piece.replace(/\+/g, " "));
        path.push(encodeRfc3986Full(piece));
        return path;
      }, [])
      .join("/");
    if (pathStr[0] !== "/") pathStr = "/" + pathStr;
  }

  return [
    tRequest.method || "GET",
    pathStr,
    queryStr,
    canonicalHeaders() + "\n",
    signedHeaders(),
    bodyHash,
  ].join("\n");
}

function canonicalHeaders() {
  var headers = tRequest.headers;
  function trimAll(header) {
    return header.toString().trim().replace(/\s+/g, " ");
  }
  return Object.keys(headers)
    .filter(function (key) {
      return !HEADERS_TO_IGNORE.includes(key.toLowerCase());
    })
    .sort(function (a, b) {
      return a.toLowerCase() < b.toLowerCase() ? -1 : 1;
    })
    .map(function (key) {
      return key.toLowerCase() + ":" + trimAll(headers[key]);
    })
    .join("\n");
}

function signedHeaders() {
  var extraHeadersToInclude = tExtraHeadersToInclude,
    extraHeadersToIgnore = tExtraHeadersToIgnore;
  return Object.keys(tRequest.headers)
    .map(function (key) {
      return key.toLowerCase();
    })
    .filter(function (key) {
      return (
        extraHeadersToInclude[key] ||
        (!HEADERS_TO_IGNORE.includes(key) && !extraHeadersToIgnore[key])
      );
    })
    .sort()
    .join(";");
}

function credentialString() {
  return [getDate(), tRegion, tService, "aws4_request"].join("/");
}

function parsePath() {
  let path = tRequest.path || "/";

  if (/[^0-9A-Za-z;,/?:@&=+$\-_.!~*'()#%]/.test(path)) {
    path = encodeURI(decodeURI(path));
  }

  var queryIx = path.indexOf("?"),
    query = null;

  if (queryIx >= 0) {
    query = querystring.parse(path.slice(queryIx + 1));
    path = path.slice(0, queryIx);
  }

  tParsedPath = {
    path: path,
    query: query,
  };
}

function formatPath() {
  let path = tParsedPath.path,
    query = tParsedPath.query;

  if (!query) return path;

  // Services don't support empty query string keys
  if (query[""] != null) delete query[""];

  return path + "?" + encodeRfc3986(querystring.stringify(query));
}

async function handler(event) {
  let bucket, path;
  let pieces =
    /\/presign\/([-a-z\.0-9]{3,63}\.s3\.\w{2}-\w+-\d\.amazonaws\.com)(\/.+)/.exec(
      event.request.uri
    );
  if (pieces) {
    bucket = pieces[1];
    path = pieces[2];
  }
  if (!bucket || !path) {
    return {
      statusCode: 400,
      statusDescription: "Bad Request",
      body: `Invalid request: URI must be in the format /presign/<bucket>.s3.<region>.amazonaws.com/<path>`,
    };
  }
  let requestOptions = {
    host: bucket,
    path,
    method: "GET",
    signQuery: true,
  };
  let accessKeyId = await kvsHandle.get("ACCESS_KEY", { format: "string" });
  let secretAccessKey = await kvsHandle.get("SECRET_KEY", { format: "string" });
  RequestSigner(requestOptions, {
    accessKeyId,
    secretAccessKey,
  });
  let result = sign();
  const response = {
    statusCode: 302,
    statusDescription: "Found",
    headers: { location: { value: `https://${result.host}${result.path}` } },
  };

  return response;
}
