// Contacts for the recipient picker.
//
// On Android the phone book is read with one native query that only asks for
// the name and number. expo-contacts joins every data row for every contact,
// which can look like an endless spinner on a large address book. Other
// platforms keep the expo-contacts path.

import { Platform, PermissionsAndroid } from "react-native";
import { requireOptionalNativeModule } from "expo";
import * as Contacts from "expo-contacts";

const native =
  Platform.OS === "android" ? requireOptionalNativeModule("OffTxtSms") : null;

const TIMEOUT_MS = 15_000;

/** Keep the same digits the SMS layer uses. */
export function cleanPhoneNumber(value) {
  const digits = String(value ?? "").replace(/[^\d+]/g, "");
  return digits.length >= 6 ? digits : null;
}

/**
 * @param {boolean} ask
 * @returns {Promise<{ granted: boolean, canAskAgain: boolean }>}
 */
export async function contactsAccess(ask = false) {
  if (Platform.OS === "android") {
    const permission = PermissionsAndroid.PERMISSIONS.READ_CONTACTS;

    if (await PermissionsAndroid.check(permission)) {
      return { granted: true, canAskAgain: true };
    }
    if (!ask) return { granted: false, canAskAgain: true };

    const result = await PermissionsAndroid.request(permission);
    return {
      granted: result === PermissionsAndroid.RESULTS.GRANTED,
      canAskAgain: result !== PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
    };
  }

  const permission = await Contacts.getPermissionsAsync();
  let status = permission.status;
  let canAskAgain = permission.canAskAgain !== false;

  if (status !== "granted" && ask && canAskAgain) {
    const asked = await Contacts.requestPermissionsAsync();
    status = asked.status;
    canAskAgain = asked.canAskAgain !== false;
  }

  return { granted: status === "granted", canAskAgain };
}

function normalise(rows) {
  const contacts = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const id = String(row?.id ?? "");
    const name = String(row?.name ?? "").trim();
    const number = cleanPhoneNumber(row?.number);

    if (!id || !name || !number) continue;
    if (/^[\s\d+-]+$/.test(name)) continue;
    if (!contacts.has(id)) contacts.set(id, { id, name, number });
  }

  return [...contacts.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function readNativeContacts() {
  return native.readContacts();
}

async function readExpoContacts() {
  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
  });

  return data.map((contact) => ({
    id: contact.id,
    name: contact.name,
    number: contact.phoneNumbers?.find((phone) => phone.number)?.number,
  }));
}

function withTimeout(promise, ms) {
  let timer;

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("Contacts did not load in time.")),
      ms,
    );
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Contacts that have a name and a usable phone number.
 * @returns {Promise<Array<{ id: string, name: string, number: string }>>}
 */
export async function loadPhoneContacts({ timeoutMs = TIMEOUT_MS } = {}) {
  const source =
    typeof native?.readContacts === "function"
      ? readNativeContacts()
      : readExpoContacts();

  return normalise(await withTimeout(source, timeoutMs));
}
