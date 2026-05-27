import { Text, View, FlatList, StyleSheet, Pressable } from "react-native";
import * as Contacts from "expo-contacts";
import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams } from "expo-router";
import { router } from "expo-router";
import * as SMS from "expo-sms";

export default function ContactsScreen() {
  const { fullPayUrl } = useLocalSearchParams();
  console.log(fullPayUrl);
  const [error, setError] = useState(undefined);
  const [contactsList, setContactsList] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  useEffect(() => {
    (async () => {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status === "granted") {
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
        });
        if (data.length > 0) {
          const filteredContactList = data.filter((contact) => {
            const name = contact.name ? contact.name.trim() : "";
            if (!name || name === "null null") return false;
            const onlyNumber = /^[\s\d+-]+$/.test(name);
            if (onlyNumber) return false;
            return true;
          });
          setContactsList(filteredContactList);
          console.log(filteredContactList.length);
          console.log(filteredContactList[0]);
        }
      } else {
        setError("Permission to access contacts denied.");
      }
    })();
  }, []);

  const sendRequestMessage = () => {
    const clickableLink = encodeURI(fullPayUrl);
    (async () => {
      const isAvailable = await SMS.isAvailableAsync();
      if (isAvailable) {
        console.log(selectedIds);
        const { result } = await SMS.sendSMSAsync(
          ["6369605616"],
          clickableLink,
        );
        console.log(result);
      } else {
        console.log("there's no SMS available on this device");
      }
    })();
  };
  const toggleSelectedContacts = (id) => {
    setSelectedIds((prevIds) => {
      if (prevIds.includes(id)) {
        return prevIds.filter((item) => item !== id);
      } else {
        return [...prevIds, id];
      }
    });
  };
  return (
    <SafeAreaView style={styles.container}>
      <Text style={{ fontSize: 24, fontWeight: "bold" }}>Contacts</Text>
      {error && <Text>Error occured: {error}</Text>}
      {contactsList && (
        <FlatList
          data={contactsList}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isSelected = selectedIds.includes(item.id);
            return (
              <Pressable onPress={() => toggleSelectedContacts(item.id)}>
                <View
                  style={{
                    flex: 1,
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    marginBottom: 8,
                    borderBottomColor: "black",
                    borderBottomWidth: 1,
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <View>
                    <Text style={{ fontSize: 16, fontWeight: "condensedBold" }}>
                      {item.name}
                    </Text>
                    {item.phoneNumbers && item.phoneNumbers.length > 0 && (
                      <Text style={{ fontSize: 12 }}>
                        {item.phoneNumbers[0].number}
                      </Text>
                    )}
                  </View>
                  <Ionicons
                    size={24}
                    name={isSelected ? "checkbox" : "square-outline"}
                  />
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <Pressable
        style={{
          position: "absolute",
          bottom: 40,
          right: 10,
          left: 0,
          elevation: 10,
          backgroundColor: "yellow",
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: 40,
          flexDirection: "row",
          gap: 12,
          alignItems: "center",
        }}
        onPress={sendRequestMessage}
      >
        <Text>Send request</Text>
        <Ionicons size={24} name="arrow-forward" />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
