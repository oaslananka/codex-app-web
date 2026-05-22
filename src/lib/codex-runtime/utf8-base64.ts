const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBinary(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return binary;
}

function binaryToBytes(binary: string) {
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function encodeBase64Utf8(text: string) {
  return btoa(bytesToBinary(encoder.encode(text)));
}

export function decodeBase64Utf8(value: string) {
  try {
    return decoder.decode(binaryToBytes(atob(value)));
  } catch {
    return value;
  }
}
