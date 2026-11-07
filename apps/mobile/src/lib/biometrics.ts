import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const LOCK_KEY = 'mm.appLock.enabled';

export interface LockCapability {
  /** Biometric hardware present and enrolled. */
  biometrics: boolean;
  /** Some device credential (PIN/pattern/password or biometrics) is set up. */
  anyCredential: boolean;
  label: string;
}

export async function getLockCapability(): Promise<LockCapability> {
  const [hardware, enrolled, level, types] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.getEnrolledLevelAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);
  const biometrics = hardware && enrolled;
  const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  const label = biometrics ? (face ? 'Face unlock' : 'Fingerprint') : 'Device PIN';
  return {
    biometrics,
    anyCredential: level !== LocalAuthentication.SecurityLevel.NONE,
    label,
  };
}

export async function isLockEnabled(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(LOCK_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setLockEnabled(enabled: boolean): Promise<void> {
  if (enabled) await SecureStore.setItemAsync(LOCK_KEY, '1');
  else await SecureStore.deleteItemAsync(LOCK_KEY);
}

/** Prompt with biometrics, falling back to the device PIN/pattern/password. */
export async function authenticate(reason = 'Unlock Money Money') {
  return LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
    requireConfirmation: false,
  });
}
