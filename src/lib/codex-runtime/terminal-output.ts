const ANSI_ESCAPE_PATTERN =
  /[\u001B\u009B](?:\][^\u0007]*(?:\u0007|\u001B\\)|[\[\]()#;?]*(?:(?:\d{1,4}(?:;\d{0,4})*)?[0-9A-ORZcf-nqry=><~]))/g;
const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000B-\u001A\u001C-\u001F\u007F]/g;

export function sanitizeTerminalOutput(text: string) {
  return text.replace(ANSI_ESCAPE_PATTERN, '').replace(CONTROL_CHAR_PATTERN, '');
}
