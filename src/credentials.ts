export interface CredentialResolution {
  value?: string;
  warning?: string;
}

export interface KeychainRequest {
  service: string;
  account: string;
}

export type KeychainPasswordReader = (request: KeychainRequest) => Promise<CredentialResolution>;

const ENV_REFERENCE_PATTERN = /^\$[A-Za-z_][A-Za-z0-9_]*$/;

function tokenizeCommand(command: string): string[] | undefined {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (char === undefined) continue;

    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (quote) return undefined;
  if (current) tokens.push(current);
  return tokens;
}

function parseKeychainCommand(value: string): KeychainRequest | undefined {
  const tokens = tokenizeCommand(value.trim());
  if (!tokens || tokens.length !== 7) return undefined;

  const [binary, subcommand, accountFlag, account, serviceFlag, service, passwordFlag] = tokens;
  if (binary !== "!security") return undefined;
  if (subcommand !== "find-generic-password") return undefined;
  if (accountFlag !== "-a" || !account) return undefined;
  if (serviceFlag !== "-s" || !service) return undefined;
  if (passwordFlag !== "-w") return undefined;

  return { service, account };
}

async function readKeychainPassword(request: KeychainRequest): Promise<CredentialResolution> {
  try {
    const process = Bun.spawn({
      cmd: [
        "/usr/bin/security",
        "find-generic-password",
        "-a",
        request.account,
        "-s",
        request.service,
        "-w",
      ],
      stdout: "pipe",
      stderr: "ignore",
    });
    const output = (await new Response(process.stdout).text()).trim();
    const exitCode = await process.exited;

    if (exitCode !== 0 || !output) {
      return { warning: "Provider credential could not be resolved from macOS Keychain." };
    }

    return { value: output };
  } catch {
    return { warning: "Provider credential could not be resolved from macOS Keychain." };
  }
}

export class SafeCredentialResolver {
  constructor(private readonly keychainPasswordReader: KeychainPasswordReader = readKeychainPassword) {}

  async resolve(value: string | undefined): Promise<CredentialResolution> {
    if (!value) return { warning: "Provider credential is not configured." };

    const trimmed = value.trim();
    if (!trimmed) return { warning: "Provider credential is empty." };

    if (ENV_REFERENCE_PATTERN.test(trimmed)) {
      const resolved = process.env[trimmed.slice(1)];
      return resolved
        ? { value: resolved }
        : { warning: "Provider credential environment variable is not set." };
    }

    const keychainRequest = parseKeychainCommand(trimmed);
    if (keychainRequest) {
      return this.keychainPasswordReader(keychainRequest);
    }

    if (/^!?(?:\S+\/)?security\s+/.test(trimmed) || trimmed.startsWith("$(")) {
      return { warning: "Provider credential reference is not allowed by the safe resolver." };
    }

    return { value };
  }
}

export function bearerAuthorizationHeader(secret: string): string {
  return secret.trimStart().toLowerCase().startsWith("bearer ") ? secret : `Bearer ${secret}`;
}
