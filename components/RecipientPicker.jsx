import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Contacts from "expo-contacts";
import PixelIcon from "./PixelIcon";
import { colors, radius, space, type } from "../lib/theme";

export function cleanNumber(phoneNumbers) {
  const entry = phoneNumbers?.find((item) => item.number);
  if (!entry) return null;
  const digits = String(entry.number).replace(/[^\d+]/g, "");
  return digits.length >= 6 ? digits : null;
}

/**
 * Phone number field with a contact list underneath. Typing works without any
 * contact permission, the list only shows up when it is granted.
 *
 * @param {{ selected: { number: string, name?: string | null } | null,
 *   onSelect: (value: { number: string, name?: string | null } | null) => void,
 *   disabled?: boolean }} props
 */
export default function RecipientPicker({ selected, onSelect, disabled = false }) {
  const [contacts, setContacts] = useState([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;

    (async () => {
      const { status } = await Contacts.requestPermissionsAsync();
      if (!active || status !== "granted") return;

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
      });
      if (!active) return;

      setContacts(
        data
          .map((contact) => ({
            id: contact.id,
            name: (contact.name || "").trim(),
            number: cleanNumber(contact.phoneNumbers),
          }))
          .filter((contact) => contact.name && contact.number),
      );
    })().catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const pool = needle
      ? contacts.filter(
          (contact) =>
            contact.name.toLowerCase().includes(needle) ||
            contact.number.includes(needle),
        )
      : contacts;
    return pool.slice(0, 40);
  }, [contacts, query]);

  return (
    <View style={styles.container}>
      <Text style={type.label}>TO</Text>

      <View style={styles.inputRow}>
        <PixelIcon name="phone" size={16} color={colors.muted} />
        <TextInput
          value={selected?.number ?? ""}
          onChangeText={(text) =>
            onSelect(text.trim() ? { number: text.trim(), name: null } : null)
          }
          placeholder="Phone number"
          placeholderTextColor={colors.muted}
          keyboardType="phone-pad"
          editable={!disabled}
          style={[type.body, styles.input]}
          accessibilityLabel="Recipient phone number"
        />
      </View>

      {selected?.name ? (
        <Text style={type.muted} numberOfLines={1}>
          {selected.name}
        </Text>
      ) : null}

      {contacts.length > 0 && !disabled ? (
        <>
          <View style={styles.searchRow}>
            <PixelIcon name="search" size={16} color={colors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search contacts"
              placeholderTextColor={colors.muted}
              style={[type.muted, styles.search]}
              accessibilityLabel="Search contacts"
            />
          </View>

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {visible.map((contact) => {
              const active = selected?.number === contact.number;
              return (
                <Pressable
                  key={contact.id}
                  onPress={() =>
                    onSelect({ number: contact.number, name: contact.name })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Send to ${contact.name}`}
                  style={({ pressed }) => [
                    styles.row,
                    active && styles.rowActive,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <Text style={type.bodyMedium} numberOfLines={1}>
                    {contact.name}
                  </Text>
                  <Text style={type.muted}>{contact.number}</Text>
                </Pressable>
              );
            })}
            {visible.length === 0 ? (
              <Text style={[type.muted, styles.empty]}>No contact matches.</Text>
            ) : null}
          </ScrollView>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space.sm,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
    paddingHorizontal: space.md,
    minHeight: 48,
  },
  input: {
    flex: 1,
    paddingVertical: space.sm,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: space.sm,
  },
  search: {
    flex: 1,
    paddingVertical: space.xs,
  },
  list: {
    maxHeight: 190,
  },
  row: {
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    gap: 2,
  },
  rowActive: {
    backgroundColor: colors.panel,
  },
  rowPressed: {
    backgroundColor: colors.line,
  },
  empty: {
    paddingVertical: space.md,
  },
});
