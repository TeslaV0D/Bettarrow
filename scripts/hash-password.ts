/*
 * Creates an APP_PASSWORD_HASH value for .env.
 *   npm run hash-password            (prompts, input hidden)
 *   echo -n 'secret' | npm run hash-password --silent
 */
import { createInterface } from "node:readline";
import { hashPassword } from "../src/server/password";

async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const c of process.stdin) chunks.push(c as Buffer);
    return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  // Hide typed characters.
  (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
    if (s.includes("Passwort")) process.stdout.write(s);
  };
  const answer = await new Promise<string>((resolve) => rl.question("Passwort: ", resolve));
  rl.close();
  process.stdout.write("\n");
  return answer;
}

const password = await readPassword();
if (password.length < 8) {
  console.error("Das Passwort muss mindestens 8 Zeichen lang sein.");
  process.exit(1);
}
console.log(`APP_PASSWORD_HASH=${await hashPassword(password)}`);
