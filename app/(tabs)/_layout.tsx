import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors } from '../../theme';

function TabIcon({ emoji }: { emoji: string }) {
  return <Text style={{ fontSize: 20 }}>{emoji}</Text>;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryDark,
        tabBarInactiveTintColor: colors.inkSoft,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: () => <TabIcon emoji="🏠" /> }}
      />
      <Tabs.Screen
        name="add"
        options={{ title: 'Add', tabBarIcon: () => <TabIcon emoji="➕" /> }}
      />
      <Tabs.Screen
        name="recipes"
        options={{ title: 'Recipes', tabBarIcon: () => <TabIcon emoji="🍳" /> }}
      />
      <Tabs.Screen
        name="list"
        options={{ title: 'List', tabBarIcon: () => <TabIcon emoji="🛒" /> }}
      />
      <Tabs.Screen
        name="stats"
        options={{ title: 'Stats', tabBarIcon: () => <TabIcon emoji="📊" /> }}
      />
    </Tabs>
  );
}