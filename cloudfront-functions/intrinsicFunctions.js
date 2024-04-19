//get property of an object
function index(o, p) {
  return o[p];
}

//get a value of object by path
function get(o, p) {
  return p.split(".").reduce(index, o);
}

function compareByPath(p) {
  return function (a, b) {
    return compare(get(a, p), get(b, p));
  };
}

function compare(a, b) {
  if (typeof a === "number") {
    return a - b;
  } else if (typeof a === "string") {
    return Buffer.from(a).compare(Buffer.from(b));
  } else {
    throw new Error("value must be a number or string");
  }
}

function sortByPath(arr, path) {
  return arr.sort(compareByPath(path));
}

function handler(event) {
  let body = "Bad Request";
  let path = event.request.uri.split("/", 2);
  let statusCode = 400;
  let statusDescription = "BadRequest";
  if (path && path[1]) {
    switch (path[1]) {
      case "ulid":
        body = { value: ulid(), requestId: event.context.requestId };
        statusCode = 200;
        statusDescription = "OK";
        break;
      case "sortByPath":
        let value = event.request.querystring.arr.value;
        value = value.includes("%2522")
          ? decodeURIComponent(decodeURIComponent(value))
          : decodeURIComponent(value);
        try {
          body = {
            requestId: event.context.requestId,
            value: sortByPath(
              JSON.parse(value),
              event.request.querystring.path.value
            ),
          };
          statusCode = 200;
          statusDescription = "OK";
        } catch (e) {
          body = e.message;
        }
        break;
      default:
        break;
    }
  }
  var response = {
    statusCode,
    statusDescription,
    headers: {
      "content-type": { value: "application/json" },
    },
    body: JSON.stringify(body),
  };
  return response;
}

// based on https://github.com/ulid/javascript/blob/master/dist/index.js
const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford's Base32
const ENCODING_LEN = ENCODING.length;
const TIME_MAX = Math.pow(2, 48) - 1;
const TIME_LEN = 10;
const RANDOM_LEN = 16;

function replaceCharAt(str, index, char) {
  if (index > str.length - 1) {
    return str;
  }
  return str.substr(0, index) + char + str.substr(index + 1);
}

function incrementBase32(str) {
  let done;
  let index = str.length;
  let char;
  let charIndex;
  const maxCharIndex = ENCODING_LEN - 1;
  while (!done && index-- >= 0) {
    char = str[index];
    charIndex = ENCODING.indexOf(char);
    if (charIndex === maxCharIndex) {
      str = replaceCharAt(str, index, ENCODING[0]);
      continue;
    }
    done = replaceCharAt(str, index, ENCODING[charIndex + 1]);
  }
  if (typeof done === "string") {
    return done;
  }
}

function randomChar(prng) {
  let rand = Math.floor(prng() * ENCODING_LEN);
  if (rand === ENCODING_LEN) {
    rand = ENCODING_LEN - 1;
  }
  return ENCODING.charAt(rand);
}

function encodeTime(now, len) {
  let mod;
  let str = "";
  for (; len > 0; len--) {
    mod = now % ENCODING_LEN;
    str = ENCODING.charAt(mod) + str;
    now = (now - mod) / ENCODING_LEN;
  }
  return str;
}

function encodeRandom(len, prng) {
  let str = "";
  for (; len > 0; len--) {
    str = randomChar(prng) + str;
  }
  return str;
}

function decodeTime(id) {
  var time = id
    .substr(0, TIME_LEN)
    .split("")
    .reverse()
    .reduce((carry, char, index) => {
      const encodingIndex = ENCODING.indexOf(char);
      return (carry += encodingIndex * Math.pow(ENCODING_LEN, index));
    }, 0);
  return time;
}

function ulid() {
  return (
    encodeTime(Date.now(), TIME_LEN) +
    encodeRandom(RANDOM_LEN, () => Math.random())
  );
}
