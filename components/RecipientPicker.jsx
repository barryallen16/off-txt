import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Contacts from "expo-contacts";
import Loading from "./Loading";
import PixelIcon from "./PixelIcon";
import AppButton from "./AppButton";
import { listFavorites, toggleFavorite } from "../lib/db";
import { colors, radius, space, type } from "../lib/theme";

export function cleanNumber(phoneNumbers) {
  const entry = phoneNumbers?.find((item) => item.number);
  if (!entry) return null;
  const digits = String(entry.number).replace(/[^\d+]/g, "");
  return digits.length >= 6 ? digits : null;
}

/**
 * Phone number field with a contact list underneath. Typing works without any
 * contact permission, the list only shows up when it is granted. Favorite
 * contacts are pinned to the top of the list.
 *
 * @param {{ selected: { number: string, name?: string | null } | null,
 *   onSelect: (value: { number: string, name?: string | null } | null) => void,
 *   disabled?: boolean }} props
 */
export default function RecipientPicker({
  selected,
  onSelect,
  disabled = false,
}) {
  const [contacts, setContacts] = useState([]);
  const [favorites, setFavorites] = useState(new Set());
  const [query, setQuery] = useState("");
  const [state, setState] = useState("loading");
  const [canAsk, setCanAsk] = useState(true);
  const [asking, setAsking] = useState(false);

  const load = useCallback(async (ask) => {
    setState("loading");

    try {
      const permission = await Contacts.getPermissionsAsync();
      let status = permission.status;
      let canAskAgain = permission.canAskAgain !== false;

      if (status !== "granted" && ask && canAskAgain) {
        const asked = await Contacts.requestPermissionsAsync();
        status = asked.status;
        canAskAgain = asked.canAskAgain !== false;
      }

      setCanAsk(canAskAgain);
      if (status !== "granted") {
        setState("denied");
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
      });

      setContacts(
        data
          .map((contact) => ({
            id: contact.id,
            name: (contact.name || "").trim(),
            number: cleanNumber(contact.phoneNumbers),
          }))
          .filter((contact) => contact.name && contact.number),
      );
      setFavorites(
        new Set(listFavorites().map((favorite) => favorite.number)),
      );
      setState("granted");
    } catch {
      setState("denied");
    }
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  useEffect(() => {
    if (state !== "denied") return undefined;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") load(false);
    });
    return () => subscription.remove();
  }, [state, load]);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = contacts.filter(
      (contact) =>
        !needle ||
        contact.name.toLowerCase().includes(needle) ||
        contact.number.includes(needle),
    );

    matching.sort((a, b) => a.name.localeCompare(b.name));

    const favoriteRows = matching.filter((contact) =>
      favorites.has(contact.number),
    );
    const otherRows = matching.filter(
      (contact) => !favorites.has(contact.number),
    );
    return {
      favorites: favoriteRows,
      others: otherRows,
    };
  }, [contacts, favorites, query]);

  const allow = async () => {
    setAsking(true);
    try {
      if (canAsk) await load(true);
      else await Linking.openSettings();
    } catch {
      // The settings screen can fail to open; the button stays available.
    } finally {
      setAsking(false);
    }
  };

  const toggle = (contact) => {
    const nowFavorite = toggleFavorite(contact);
    setFavorites((current) => {
      const next = new Set(current);
      if (nowFavorite) next.add(contact.number);
      else next.delete(contact.number);
      return next;
    });
  };

  const renderContact = (contact) => {
    const active = selected?.number === contact.number;
    const favorite = favorites.has(contact.number);

    return (
      <View
        key={contact.id}
        style={[styles.row, active && styles.rowActive]}
      >
        <Pressable
          onPress={() =>
            onSelect({ number: contact.number, name: contact.name })
          }
          accessibilityRole="button"
          accessibilityLabel={`Send to ${contact.name}`}
          style={({ pressed }) => [
            styles.rowMain,
            pressed && styles.rowPressed,
          ]}
        >
          <Text style={type.bodyMedium} numberOfLines={1}>
            {contact.name}
          </Text>
          <Text style={type.muted}>{contact.number}</Text>
        </Pressable>
        <Pressable
          onPress={() => toggle(contact)}
          accessibilityRole="button"
          accessibilityLabel={
            favorite
              ? `Remove ${contact.name} from favorites`
              : `Add ${contact.name} to favorites`
          }
          hitSlop={8}
          style={({ pressed }) => [
            styles.star,
            pressed && styles.starPressed,
          ]}
        >
          <PixelIcon
            name="star"
            size={20}
            color={favorite ? colors.accent : colors.muted}
          />
        </Pressable>
      </View>
    );
  };

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

      {state === "loading" ? (
        <Loading compact label="Loading contacts" />
      ) : state === "denied" ? (
        <View style={styles.permissionRow}>
          <Text style={[type.muted, styles.permissionText]}>
            Contacts are off. Type a number above, or allow access to pick from
            the list.
          </Text>
          <AppButton
            label={canAsk ? "Allow" : "Settings"}
            variant="outline"
            loading={asking}
            onPress={allow}
            style={styles.permissionButton}
          />
        </View>
      ) : contacts.length === 0 ? (
        <Text style={[type.muted, styles.empty]}>
          No contacts with a phone number.
        </Text>
      ) : (
        !disabled && (
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

            <ScrollView
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {groups.favorites.length > 0 ? (
                <Text style={[type.label, styles.groupLabel]}>FAVORITES</Text>
              ) : null}
              {groups.favorites.map(renderContact)}

              {groups.others.length > 0 ? (
                <Text style={[type.label, styles.groupLabel]}>CONTACTS</Text>
              ) : null}
              {groups.others.map(renderContact)}

              {groups.favorites.length === 0 &&
              groups.others.length === 0 ? (
                <Text style={[type.muted, styles.empty]}>
                  No contact matches.
                </Text>
              ) : null}
            </ScrollView>
          </>
        )
      )}
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
    maxHeight: 240,
  },
  groupLabel: {
    paddingTop: space.sm,
    paddingBottom: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowMain: {
    flex: 1,
    paddingVertical: space.sm,
    gap: 2,
  },
  rowActive: {
    backgroundColor: colors.panel,
  },
  rowPressed: {
    backgroundColor: colors.line,
  },
  star: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius,
  },
  starPressed: {
    backgroundColor: colors.line,
  },
  permissionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.sm,
  },
  permissionText: {
    flex: 1,
  },
  permissionButton: {
    minHeight: 40,
    paddingHorizontal: space.md,
  },
  empty: {
    paddingVertical: space.md,
  },
});
