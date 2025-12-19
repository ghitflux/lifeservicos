import * as SecureStore from 'expo-secure-store';

const CREDENTIALS_KEY = 'savedCredentials';

export type SavedCredentials = {
  email: string;
  password: string;
};

export const saveCredentials = async (email: string, password: string) => {
  await SecureStore.setItemAsync(
    CREDENTIALS_KEY,
    JSON.stringify({ email, password })
  );
};

export const loadCredentials = async (): Promise<SavedCredentials | null> => {
  const raw = await SecureStore.getItemAsync(CREDENTIALS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SavedCredentials;
    if (!parsed?.email || !parsed?.password) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const clearCredentials = async () => {
  await SecureStore.deleteItemAsync(CREDENTIALS_KEY);
};
