export interface CryptoPort {
  hash(value: string): Promise<string>;
  compare(plain: string, hash: string): Promise<boolean>;
  verifyPkce(codeVerifier: string, codeChallenge: string, method: string): boolean;
}
