import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen
            name="accessibility"
            options={{ title: 'Accessibility prototype' }}
          />
          <Stack.Screen
            name="move-request"
            options={{ title: 'Controlled move requests' }}
          />
          <Stack.Screen
            name="controlled-selection"
            options={{ title: 'Controlled selection' }}
          />
          <Stack.Screen
            name="controlled-annotations"
            options={{ title: 'Controlled annotations' }}
          />
          <Stack.Screen
            name="provider-coordination"
            options={{ title: 'Provider coordination' }}
          />
          <Stack.Screen
            name="spare-pieces"
            options={{ title: 'Spare pieces' }}
          />
          <Stack.Screen
            name="interaction-hardening"
            options={{ title: 'Interaction hardening' }}
          />
          <Stack.Screen
            name="transitions"
            options={{ title: 'Controlled transitions' }}
          />
        </Stack>
        <StatusBar style="dark" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
